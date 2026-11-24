"""Track the latest Saudi legal publications from official government sources.

Fetches the newest decisions, royal orders, royal decrees, circulars, regulations,
amendments and repeals from Umm Al-Qura (the official gazette) and the portals of the
Ministry of Justice, Ministry of Finance, Ministry of Human Resources and the Bureau of
Experts, classifies and summarizes them in Arabic with a Mistral model, and returns a
digest. Delivery to Slack, email or Notion is optional and driven by workspace secrets.
"""

import asyncio
import html
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlparse

from pydantic import BaseModel

import mistralai.workflows as workflows
from mistralai.workflows import activity_heartbeat
from mistralai.workflows.plugins.mistralai import (
    ChatCompletionRequest,
    SystemMessage,
    UserMessage,
    chat_parse_to_model,
)

WORKFLOW_NAME = "saudi-legal-updates"

CLASSIFIER_MODEL = "mistral-large-latest"
MAX_TOTAL_NEW_ITEMS = 60
CLASSIFY_BATCH_SIZE = 8

CATEGORIES = [
    "أمر ملكي",
    "مرسوم ملكي",
    "قرار مجلس الوزراء",
    "قرار وزاري",
    "تعميم",
    "نظام",
    "لائحة",
    "تعديل نظام",
    "إلغاء نظام",
    "قرار هيئة",
    "حكم أو مبدأ قضائي",
    "أخرى",
]

CATEGORY_ORDER = CATEGORIES

CLASSIFIER_SYSTEM_PROMPT = (
    "أنت خبير متخصص في الأنظمة والتشريعات السعودية. تصلك قائمة JSON لعناوين منشورة في مصادر "
    "حكومية سعودية رسمية (جريدة أم القرى، بوابة الأنظمة، مواقع الوزارات والهيئات). "
    "لكل عنصر في القائمة أرجع كائناً واحداً يحتوي على الحقول التالية بالضبط:\n"
    "- index: نفس رقم العنصر في القائمة.\n"
    f"- category: قيمة واحدة من هذه القائمة فقط: {', '.join(CATEGORIES)}.\n"
    "- reference: اسم الوثيقة (النظام أو القرار أو التعميم أو الأمر) ورقمها وسنة إصدارها إن "
    "ذُكرت في العنوان أو المقتطف، بحد أقصى 120 حرفاً، وإلا سلسلة فارغة.\n"
    "- summary_ar: ملخص عربي من جملتين إلى ثلاث جمل يوضح ما يتضمنه النص.\n"
    "- is_amendment_or_repeal: true إذا كان النص تعديلَ نظام أو قرارٍ قائم، أو إلغاءً أو إيقافاً "
    "له، وإلا false.\n"
    "أرجع كائن JSON صالحاً فقط، دون أي نص إضافي."
)


class SourceSpec(BaseModel):
    key: str
    name_ar: str
    kind: str  # "feed" (RSS/Atom) or "page" (HTML listing)
    urls: list[str]
    hint: str


SOURCES: list[SourceSpec] = [
    SourceSpec(
        key="uqn",
        name_ar="جريدة أم القرى — آخر القرارات والأنظمة",
        kind="page",
        urls=["https://www.uqn.gov.sa/"],
        hint="الجريدة الرسمية: أوامر ملكية، مراسيم، قرارات مجلس الوزراء، لوائح وأنظمة، قرارات وزارية",
    ),
    SourceSpec(
        key="uqn_archive",
        name_ar="بوابة أرشيف أم القرى",
        kind="page",
        urls=["https://portal.uqn.gov.sa/archive"],
        hint="أرشيف أعداد جريدة أم القرى الرسمية",
    ),
    SourceSpec(
        key="boe_laws",
        name_ar="بوابة البحث في الأنظمة واللوائح — هيئة الخبراء بمجلس الوزراء",
        kind="page",
        urls=["https://laws.boe.gov.sa/boelaws/laws/"],
        hint="الأنظمة واللوائح والقرارات النافذة",
    ),
    SourceSpec(
        key="boe_updates",
        name_ar="تحديثات الأنظمة — هيئة الخبراء بمجلس الوزراء",
        kind="page",
        urls=["https://laws.boe.gov.sa/BoeLaws/Laws/LawUpdated/1"],
        hint="تعديلات وإلغاءات الأنظمة السعودية",
    ),
    SourceSpec(
        key="moj_laws",
        name_ar="بوابة الأنظمة والأحكام القضائية — وزارة العدل",
        kind="page",
        urls=["https://laws.moj.gov.sa/"],
        hint="الأنظمة والأحكام القضائية المنشورة لدى وزارة العدل",
    ),
    SourceSpec(
        key="moj_tameem",
        name_ar="بوابة التعاميم — وزارة العدل",
        kind="page",
        urls=["https://portaleservices.moj.gov.sa/TameemPortal/"],
        hint="التعاميم والقرارات الوزارية الموجهة من وزارة العدل",
    ),
    SourceSpec(
        key="mof_circulars",
        name_ar="الإعلانات والتعاميم — وزارة المالية",
        kind="page",
        urls=["https://www.mof.gov.sa/ar/announcements-and-circulars"],
        hint="التعاميم والقرارات الوزارية الصادرة عن وزارة المالية",
    ),
    SourceSpec(
        key="mof_rules",
        name_ar="الأنظمة واللوائح — وزارة المالية",
        kind="page",
        urls=["https://www.mof.gov.sa/ar/rules-and-regulation"],
        hint="الأنظمة واللوائح ذات الصلة بالشؤون المالية",
    ),
    SourceSpec(
        key="hrsd_decisions",
        name_ar="القرارات والأنظمة — وزارة الموارد البشرية والتنمية الاجتماعية",
        kind="page",
        urls=[
            "https://www.hrsd.gov.sa/knowledge-centre/decisions-and-regulations",
            "https://www.hrsd.gov.sa/knowledge-centre/decisions-and-regulations/ministerial-decisions",
        ],
        hint="القرارات الوزارية والأنظمة واللوائح المتعلقة بالعمل والموارد البشرية",
    ),
]


class LegalItem(BaseModel):
    source_key: str
    source_name: str
    title: str
    url: str
    published_at: str | None = None
    snippet: str = ""


class SourceFetchResult(BaseModel):
    source_key: str
    source_name: str
    ok: bool
    error: str | None = None
    items: list[LegalItem] = []


class NewItemsResult(BaseModel):
    items: list[LegalItem] = []
    fetched_total: int = 0


class ItemClassification(BaseModel):
    index: int
    category: str
    reference: str = ""
    summary_ar: str = ""
    is_amendment_or_repeal: bool = False


class Classifications(BaseModel):
    results: list[ItemClassification]


class ClassifiedItem(BaseModel):
    item: LegalItem
    category: str
    reference: str = ""
    summary_ar: str = ""
    is_amendment_or_repeal: bool = False


class TrackerInput(BaseModel):
    lookback_hours: int = 48
    max_items_per_source: int = 15
    classify: bool = True
    delivery_target: str = "studio"  # studio | slack | email | notion


class TrackerOutput(BaseModel):
    run_at: str
    lookback_hours: int
    sources_total: int
    sources_ok: int
    sources_failed: int
    items_fetched: int
    items_new: int
    digest_markdown: str
    items: list[ClassifiedItem]
    source_errors: dict[str, str]
    delivery_status: str


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36 saudi-legal-tracker/1.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.8",
}

_ANCHOR_RE = re.compile(
    r'<a\s[^>]*?href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL
)
_TAG_RE = re.compile(r"<[^>]+>")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{4}/\d{1,2}/\d{1,2}|\d{1,2}/\d{1,2}/\d{4}")


def _clean_text(raw: str) -> str:
    text = _TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _looks_like_feed(text: str) -> bool:
    head = text.lstrip()[:500].lower()
    return (
        head.startswith("<?xml") or "<rss" in head or "<feed" in head or "<rdf" in head
    )


def _child_text(elem: ET.Element, name: str) -> str:
    for child in elem:
        if _local_name(child.tag) == name:
            return (child.text or "").strip()
    return ""


def _feed_link(entry: ET.Element) -> str:
    for child in entry:
        if _local_name(child.tag) == "link":
            href = child.attrib.get("href")
            if href:
                return href
            return (child.text or "").strip()
    return ""


def parse_feed(
    text: str, base_url: str, spec: SourceSpec, max_items: int
) -> list[LegalItem]:
    items: list[LegalItem] = []
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return items
    for elem in root.iter():
        if _local_name(elem.tag) not in ("item", "entry"):
            continue
        title = _child_text(elem, "title")
        link = _feed_link(elem)
        if not title or not link:
            continue
        published = (
            _child_text(elem, "pubdate")
            or _child_text(elem, "published")
            or _child_text(elem, "updated")
        )
        snippet = _clean_text(
            _child_text(elem, "description") or _child_text(elem, "summary")
        )[:500]
        items.append(
            LegalItem(
                source_key=spec.key,
                source_name=spec.name_ar,
                title=title,
                url=urljoin(base_url, link),
                published_at=published or None,
                snippet=snippet,
            )
        )
        if len(items) >= max_items:
            break
    return items


def _is_relevant_url(base_url: str, href: str) -> bool:
    if not href.startswith(("http://", "https://")):
        return False
    netloc = urlparse(href).netloc.lower()
    base_netloc = urlparse(base_url).netloc.lower()
    return netloc.endswith(".gov.sa") or netloc == base_netloc


def extract_html_links(
    text: str, base_url: str, spec: SourceSpec, max_items: int
) -> list[LegalItem]:
    items: list[LegalItem] = []
    matches = list(_ANCHOR_RE.finditer(text))
    for i, match in enumerate(matches):
        href, inner = match.group(1), match.group(2)
        if href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        url = urljoin(base_url, href)
        if not _is_relevant_url(base_url, url):
            continue
        title = _clean_text(inner)
        if len(title) < 8:
            continue
        next_start = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        window = text[match.end() : min(next_start, match.end() + 400)]
        date_match = _DATE_RE.search(window)
        published = date_match.group(0) if date_match else None
        snippet = _clean_text(window)[:300]
        items.append(
            LegalItem(
                source_key=spec.key,
                source_name=spec.name_ar,
                title=title,
                url=url,
                published_at=published,
                snippet=snippet,
            )
        )
        if len(items) >= max_items:
            break
    dated = [item for item in items if item.published_at]
    if len(dated) >= 3:
        return dated[:max_items]
    return items


def _parse_date_to_epoch(raw: str) -> float | None:
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            if 1990 <= dt.year <= 2100:
                return dt.timestamp()
        except ValueError:
            continue
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if match:
        day, month, year = (int(group) for group in match.groups())
        if 2015 <= year <= 2035:
            try:
                return datetime(year, month, day, tzinfo=timezone.utc).timestamp()
            except ValueError:
                return None
    try:
        return parsedate_to_datetime(raw).timestamp()
    except (TypeError, ValueError):
        return None


@workflows.activity(
    name="fetch_source",
    start_to_close_timeout=timedelta(seconds=90),
    retry_policy_max_attempts=2,
)
async def fetch_source(spec: SourceSpec, max_items: int) -> SourceFetchResult:
    import httpx

    items: list[LegalItem] = []
    errors: list[str] = []
    try:
        async with httpx.AsyncClient(
            headers=_HEADERS, timeout=30.0, follow_redirects=True
        ) as client:
            for url in spec.urls:
                try:
                    response = await client.get(url)
                except Exception as exc:
                    errors.append(f"{url}: {type(exc).__name__}")
                    continue
                if response.status_code != 200:
                    errors.append(f"{url}: HTTP {response.status_code}")
                    continue
                body = response.text
                parsed = (
                    parse_feed(body, url, spec, max_items)
                    if _looks_like_feed(body)
                    else []
                )
                if not parsed:
                    parsed = extract_html_links(body, url, spec, max_items)
                items.extend(parsed)
                if len(items) >= max_items:
                    break
    except Exception as exc:
        return SourceFetchResult(
            source_key=spec.key,
            source_name=spec.name_ar,
            ok=False,
            error=type(exc).__name__,
            items=[],
        )
    unique: list[LegalItem] = []
    seen_urls: set[str] = set()
    for item in items:
        if item.url in seen_urls:
            continue
        seen_urls.add(item.url)
        unique.append(item)
    error = "; ".join(errors) if errors else None
    return SourceFetchResult(
        source_key=spec.key,
        source_name=spec.name_ar,
        ok=bool(unique),
        error=error,
        items=unique[:max_items],
    )


_SEEN_URLS: dict[str, float] = {}
_SEEN_MAX_AGE_SECONDS = 30 * 24 * 3600


def select_new_items(
    results: list[SourceFetchResult],
    lookback_hours: int,
    now: float,
    seen_urls: dict[str, float],
) -> NewItemsResult:
    cutoff = now - lookback_hours * 3600
    for url, ts in list(seen_urls.items()):
        if now - ts > _SEEN_MAX_AGE_SECONDS:
            del seen_urls[url]
    new_items: list[LegalItem] = []
    fetched_total = 0
    for result in results:
        for item in result.items:
            fetched_total += 1
            if item.url in seen_urls:
                continue
            seen_urls[item.url] = now
            epoch = (
                _parse_date_to_epoch(item.published_at) if item.published_at else None
            )
            if epoch is not None and epoch < cutoff:
                continue
            new_items.append(item)
    return NewItemsResult(items=new_items, fetched_total=fetched_total)


@workflows.activity(
    name="filter_new_items",
    start_to_close_timeout=timedelta(seconds=60),
    retry_policy_max_attempts=2,
)
async def filter_new_items(
    results: list[SourceFetchResult], lookback_hours: int
) -> NewItemsResult:
    import time

    return select_new_items(results, lookback_hours, time.time(), _SEEN_URLS)


@workflows.activity(
    name="classify_items",
    start_to_close_timeout=timedelta(minutes=10),
    retry_policy_max_attempts=2,
    heartbeat_timeout=timedelta(seconds=90),
)
async def classify_items(items: list[LegalItem]) -> list[ClassifiedItem]:
    if not items:
        return []
    classified: list[ClassifiedItem] = []
    for start in range(0, len(items), CLASSIFY_BATCH_SIZE):
        batch = items[start : start + CLASSIFY_BATCH_SIZE]
        payload = [
            {
                "index": i,
                "source": item.source_name,
                "title": item.title,
                "snippet": item.snippet[:500],
                "published": item.published_at or "",
            }
            for i, item in enumerate(batch)
        ]
        request = ChatCompletionRequest(
            model=CLASSIFIER_MODEL,
            messages=[
                SystemMessage(content=CLASSIFIER_SYSTEM_PROMPT),
                UserMessage(
                    content="صَنّف العناصر التالية:\n"
                    + json.dumps(payload, ensure_ascii=False)
                ),
            ],
            temperature=0.1,
            max_tokens=4000,
        )
        try:
            parsed = await chat_parse_to_model(Classifications, request)
            by_index = {entry.index: entry for entry in parsed.results}
        except Exception:
            by_index = {}
        for i, item in enumerate(batch):
            entry = by_index.get(i)
            if entry is None:
                classified.append(
                    ClassifiedItem(
                        item=item,
                        category="أخرى",
                        summary_ar=item.title,
                        is_amendment_or_repeal=False,
                    )
                )
            else:
                category = entry.category if entry.category in CATEGORIES else "أخرى"
                classified.append(
                    ClassifiedItem(
                        item=item,
                        category=category,
                        reference=entry.reference,
                        summary_ar=entry.summary_ar or item.title,
                        is_amendment_or_repeal=entry.is_amendment_or_repeal,
                    )
                )
        activity_heartbeat(
            {
                "classified": min(start + CLASSIFY_BATCH_SIZE, len(items)),
                "total": len(items),
            }
        )
    return classified


def _digest_entry(entry: ClassifiedItem) -> list[str]:
    item = entry.item
    lines = [f"### {item.title}"]
    meta = [f"- المصدر: {item.source_name}"]
    if item.published_at:
        meta.append(f"- التاريخ: {item.published_at}")
    if entry.reference:
        meta.append(f"- الوثيقة: {entry.reference}")
    lines += meta
    if entry.summary_ar and entry.summary_ar != item.title:
        lines += ["", entry.summary_ar]
    lines += ["", f"- الرابط: {item.url}", ""]
    return lines


def build_digest_markdown(
    classified: list[ClassifiedItem],
    run_at: str,
    lookback_hours: int,
    sources_ok: int,
    sources_failed: int,
    fetched_total: int,
) -> str:
    lines = [
        f"# نشرة آخر التحديثات القانونية — {run_at}",
        "",
        f"- النطاق الزمني: آخر {lookback_hours} ساعة | المصادر الناجحة: {sources_ok} | الفاشلة: {sources_failed} | العناصر المفحوصة: {fetched_total}",
        f"- عدد العناصر الجديدة: {len(classified)}",
        "",
    ]
    if not classified:
        lines.append("لا توجد عناصر جديدة في هذا التشغيل.")
        return "\n".join(lines)
    amendments = [entry for entry in classified if entry.is_amendment_or_repeal]
    if amendments:
        lines += ["## ⚖️ تعديلات وإلغاءات", ""]
        for entry in amendments:
            lines += _digest_entry(entry)
        lines.append("")
    for category in CATEGORY_ORDER:
        group = [
            entry
            for entry in classified
            if entry.category == category and not entry.is_amendment_or_repeal
        ]
        if not group:
            continue
        lines += [f"## {category}", ""]
        for entry in group:
            lines += _digest_entry(entry)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _split_digest(digest: str) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    for line in digest.splitlines():
        if line.startswith("## ") and current:
            chunks.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
        if len("\n".join(current)) > 1900:
            chunks.append("\n".join(current))
            current = []
    if current:
        chunks.append("\n".join(current))
    return chunks or [digest]


def _notion_block(chunk: str) -> dict:
    block_type = "heading_2" if chunk.startswith("## ") else "paragraph"
    return {
        "object": "block",
        "type": block_type,
        block_type: {
            "rich_text": [{"type": "text", "text": {"content": chunk[:2000]}}]
        },
    }


async def _deliver_slack(title: str, digest: str) -> str:
    import os

    import httpx

    webhook = os.environ.get("SLACK_WEBHOOK_URL", "")
    text = f"*{title}*\n```{digest[:3800]}```"
    if webhook:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(webhook, json={"text": text})
        return f"slack_webhook:{response.status_code}"
    token = os.environ.get("SLACK_BOT_TOKEN", "")
    channel = os.environ.get("SLACK_CHANNEL_ID", "")
    if not token or not channel:
        return "slack_not_configured: set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN+SLACK_CHANNEL_ID"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}"},
            json={"channel": channel, "text": text},
        )
    return f"slack_api:{response.status_code}"


async def _deliver_email(title: str, digest: str) -> str:
    import os
    import smtplib
    from email.message import EmailMessage

    host = os.environ.get("SMTP_HOST", "")
    if not host:
        return "email_not_configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM, MAIL_TO"
    port = int(os.environ.get("SMTP_PORT", "465"))
    message = EmailMessage()
    message["Subject"] = title
    message["From"] = os.environ.get("MAIL_FROM", os.environ.get("SMTP_USER", ""))
    message["To"] = os.environ.get("MAIL_TO", "")
    message.set_content(digest, charset="utf-8")
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as server:
            if os.environ.get("SMTP_USER"):
                server.login(
                    os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", "")
                )
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            if os.environ.get("SMTP_USER"):
                server.login(
                    os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", "")
                )
            server.send_message(message)
    return "email_sent"


async def _deliver_notion(title: str, digest: str) -> str:
    import os

    import httpx

    token = os.environ.get("NOTION_TOKEN", "")
    parent = os.environ.get("NOTION_PARENT_PAGE_ID", "")
    if not token or not parent:
        return "notion_not_configured: set NOTION_TOKEN and NOTION_PARENT_PAGE_ID"
    payload = {
        "parent": {"page_id": parent},
        "properties": {
            "title": [
                {
                    "type": "title",
                    "title": [{"type": "text", "text": {"content": title[:200]}}],
                }
            ]
        },
        "children": [_notion_block(chunk) for chunk in _split_digest(digest)[:100]],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.notion.com/v1/pages",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    return f"notion_api:{response.status_code}"


@workflows.activity(
    name="deliver_digest",
    start_to_close_timeout=timedelta(seconds=90),
    retry_policy_max_attempts=2,
)
async def deliver_digest(target: str, title: str, digest: str) -> str:
    if target in ("", "studio", "none"):
        return "studio_only"
    try:
        if target == "slack":
            return await _deliver_slack(title, digest)
        if target == "email":
            return await _deliver_email(title, digest)
        if target == "notion":
            return await _deliver_notion(title, digest)
        return f"unknown_target:{target}"
    except Exception as exc:
        message = str(exc)[:200]
        return f"delivery_failed:{target}:{type(exc).__name__}:{message}"


@workflows.workflow.define(
    name=WORKFLOW_NAME,
    workflow_display_name="متابعة آخر التحديثات القانونية السعودية",
    workflow_description=(
        "يتتبع أحدث الأوامر الملكية والمراسيم والقرارات والتعاميم والأنظمة وتعديلاتها وإلغائها "
        "من جريدة أم القرى ومواقع الوزارات والهيئات السعودية الرسمية، يصنفها ويلخصها بالعربية، "
        "ويعيد نشرةً  كملخص."
    ),
)
class SaudiLegalUpdatesWorkflow:
    @workflows.workflow.entrypoint
    async def run(self, input: TrackerInput) -> TrackerOutput:
        run_at = workflows.workflow.now().isoformat()
        results = list(
            await asyncio.gather(
                *[fetch_source(spec, input.max_items_per_source) for spec in SOURCES]
            )
        )
        new_items_result = await filter_new_items(results, input.lookback_hours)
        new_items = new_items_result.items[:MAX_TOTAL_NEW_ITEMS]
        if input.classify and new_items:
            classified = await classify_items(new_items)
        else:
            classified = [
                ClassifiedItem(item=item, category="أخرى", summary_ar=item.title)
                for item in new_items
            ]
        sources_ok = sum(1 for result in results if result.ok)
        digest = build_digest_markdown(
            classified,
            run_at,
            input.lookback_hours,
            sources_ok,
            len(results) - sources_ok,
            new_items_result.fetched_total,
        )
        title = f"نشرة آخر التحديثات القانونية — {run_at}"
        delivery_status = await deliver_digest(input.delivery_target, title, digest)
        return TrackerOutput(
            run_at=run_at,
            lookback_hours=input.lookback_hours,
            sources_total=len(results),
            sources_ok=sources_ok,
            sources_failed=len(results) - sources_ok,
            items_fetched=new_items_result.fetched_total,
            items_new=len(classified),
            digest_markdown=digest,
            items=classified,
            source_errors={
                r.source_key: (r.error or "no items") for r in results if not r.ok
            },
            delivery_status=delivery_status,
        )
