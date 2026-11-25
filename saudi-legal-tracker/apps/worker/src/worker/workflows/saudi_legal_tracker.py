"""Track the latest Saudi legal publications from official government sources.

Fetches the newest decisions, royal orders, royal decrees, circulars, regulations,
amendments and repeals from Umm Al-Qura (the official gazette) and the portals of the
Ministry of Justice, Ministry of Finance, Ministry of Human Resources and the Bureau of
Experts, classifies and summarizes them in Arabic with a Mistral model, and returns a
digest. Delivery to Slack, email or Notion is optional and driven by workspace secrets.
"""

import asyncio
import base64
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
    default_category: str | None = None  # fixed category for items from this source


SOURCES: list[SourceSpec] = [
    SourceSpec(
        key="uqn_council",
        name_ar="قرارات مجلس الوزراء — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/council-of-ministers-decisions"],
        hint="قرارات مجلس الوزراء المنشورة في الجريدة الرسمية",
        default_category="قرار مجلس الوزراء",
    ),
    SourceSpec(
        key="uqn_royal_orders",
        name_ar="أوامر ملكية — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/royal-orders"],
        hint="الأوامر الملكية المنشورة في الجريدة الرسمية",
        default_category="أمر ملكي",
    ),
    SourceSpec(
        key="uqn_royal_decrees",
        name_ar="مراسيم ملكية — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/royal-decrees"],
        hint="المراسيم الملكية المنشورة في الجريدة الرسمية",
        default_category="مرسوم ملكي",
    ),
    SourceSpec(
        key="uqn_rules",
        name_ar="لوائح وأنظمة — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/rules-and-regulations"],
        hint="اللوائح والأنظمة المنشورة في الجريدة الرسمية",
        default_category="لائحة",
    ),
    SourceSpec(
        key="uqn_ministerial",
        name_ar="قرارات وزارية — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/ministerial-decisions"],
        hint="القرارات الوزارية المنشورة في الجريدة الرسمية",
        default_category="قرار وزاري",
    ),
    SourceSpec(
        key="uqn_mou",
        name_ar="مذكرات تفاهم — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/memorandums-of-understanding"],
        hint="مذكرات التفاهم المنشورة في الجريدة الرسمية",
        default_category="أخرى",
    ),
    SourceSpec(
        key="uqn_agreements",
        name_ar="اتفاقيات — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/agreements"],
        hint="الاتفاقيات المنشورة في الجريدة الرسمية",
        default_category="أخرى",
    ),
    SourceSpec(
        key="uqn_authorities",
        name_ar="هيئات — جريدة أم القرى",
        kind="page",
        urls=["https://www.uqn.gov.sa/decisions/authorities"],
        hint="قرارات الهيئات المنشورة في الجريدة الرسمية",
        default_category="قرار هيئة",
    ),
    SourceSpec(
        key="boe_laws",
        name_ar="بوابة البحث في الأنظمة واللوائح — هيئة الخبراء بمجلس الوزراء",
        kind="page",
        urls=[
            "https://laws.boe.gov.sa/boelaws/laws/",
            "https://laws.boe.gov.sa/BoeLaws/Laws/Search",
        ],
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
    persist: bool = True  # save run results to a folder in the target GitHub repo
    persist_dir: str = "legal-updates"
    since_date: str | None = (
        None  # e.g. "15/5/1448" (Hijri) or "2026-10-27"; drops dated items older than it
    )


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
    persist_status: str = ""
    source_counts: dict[str, int] = {}
    dashboard_markdown: str = ""


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
        prev_end = matches[i - 1].end() if i > 0 else 0
        after = text[match.end() : min(next_start, match.end() + 300)]
        before = text[max(prev_end, match.start() - 300) : match.start()]
        date_match = _DATE_RE.search(after) or _DATE_RE.search(before)
        published = date_match.group(0) if date_match else None
        snippet = _clean_text(after or before)[:300]
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
    urls = {item.url for item in items}
    items = [
        item
        for item in items
        if not any(
            other != item.url and other.startswith(item.url.rstrip("/") + "/")
            for other in urls
        )
    ]
    dated = [item for item in items if item.published_at]
    if len(dated) >= 3:
        return dated[:max_items]
    return items


def _hijri_to_epoch(year: int, month: int, day: int) -> float | None:
    """Tabular (Kuwaiti) Islamic calendar -> Unix epoch (UTC midnight)."""
    try:
        a = year - 1
        jdn = (
            1948440
            + 354 * a
            + (3 + 11 * a) // 30
            + 29 * (month - 1)
            + month // 2
            + day
            - 1
        )
        ll = jdn + 68569
        n = (4 * ll) // 146097
        ll = ll - (146097 * n + 3) // 4
        i = (4000 * (ll + 1)) // 1461001
        ll = ll - (1461 * i) // 4 + 31
        j = (80 * ll) // 2447
        d = ll - (2447 * j) // 80
        ll = j // 11
        m = j + 2 - 12 * ll
        y = 100 * (n - 49) + i + ll
        return datetime(y, m, d, tzinfo=timezone.utc).timestamp()
    except (ValueError, OverflowError):
        return None


def _parse_date_to_epoch(raw: str) -> float | None:
    raw = re.sub(r"[\u0621-\u064a]", "", raw).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            if 1990 <= dt.year <= 2100:
                return dt.timestamp()
            if 1400 <= dt.year <= 1500:
                return _hijri_to_epoch(dt.year, dt.month, dt.day)
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
        if 1400 <= year <= 1500:
            return _hijri_to_epoch(year, month, day)
    match = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", raw)
    if match and 1400 <= int(match.group(1)) <= 1500:
        return _hijri_to_epoch(
            int(match.group(1)), int(match.group(2)), int(match.group(3))
        )
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
    since_epoch: float | None = None,
) -> NewItemsResult:
    cutoff = now - lookback_hours * 3600
    if since_epoch is not None:
        cutoff = max(cutoff, since_epoch)
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
    results: list[SourceFetchResult], lookback_hours: int, since_date: str | None
) -> NewItemsResult:
    import time

    since_epoch = _parse_date_to_epoch(since_date) if since_date else None
    return select_new_items(
        results, lookback_hours, time.time(), _SEEN_URLS, since_epoch
    )


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


def build_dashboard_markdown(
    classified: list[ClassifiedItem],
    run_at: str,
    source_counts: dict[str, int],
    since_date: str | None,
) -> str:
    """Weekly smart-tracking dashboard: items grouped by category, with per-source counts and links."""
    try:
        week_start = (
            (datetime.fromisoformat(run_at) - timedelta(days=7)).date().isoformat()
        )
    except ValueError:
        week_start = "—"
    lines = [
        f"# 📊 لوحة متابعة التحديثات القانونية — {run_at[:10]}",
        "",
        f"- عرض أسبوعي من {week_start} إلى {run_at[:10]}"
        + (f" | منذ {since_date}" if since_date else ""),
        f"- إجمالي العناصر الجديدة في هذا التشغيل: {len(classified)}",
        "",
        "## الأعداد حسب المصدر",
        "",
    ]
    for source_key, count in sorted(source_counts.items(), key=lambda kv: -kv[1]):
        spec = next((sp for sp in SOURCES if sp.key == source_key), None)
        lines.append(f"- {spec.name_ar if spec else source_key}: **{count}**")
    lines.append("")
    if not classified:
        lines.append("لا توجد قرارات جديدة في هذه الفترة.")
        return "\n".join(lines)
    for category in CATEGORY_ORDER:
        group = [entry for entry in classified if entry.category == category]
        if not group:
            continue
        lines += [f"## {category} ({len(group)})", ""]
        for entry in group:
            item = entry.item
            date_part = f" — {item.published_at}" if item.published_at else ""
            ref_part = f" | {entry.reference}" if entry.reference else ""
            lines.append(
                f"- [{item.title}]({item.url}) — {item.source_name}{date_part}{ref_part}"
            )
        lines.append("")
    return "\n".join(lines).strip() + "\n"


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


def build_run_payload(
    run_at: str,
    lookback_hours: int,
    sources_ok: int,
    sources_failed: int,
    fetched_total: int,
    source_errors: dict[str, str],
    classified: list[ClassifiedItem],
) -> dict:
    return {
        "run_at": run_at,
        "lookback_hours": lookback_hours,
        "sources_total": sources_ok + sources_failed,
        "sources_ok": sources_ok,
        "sources_failed": sources_failed,
        "items_fetched": fetched_total,
        "items_new": len(classified),
        "source_errors": source_errors,
        "items": [entry.model_dump() for entry in classified],
    }


async def _github_put_file(
    client, base: str, branch: str, path: str, content: str, message: str
) -> dict:
    existing = await client.get(f"{base}/contents/{path}", params={"ref": branch})
    body = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if existing.status_code == 200:
        body["sha"] = existing.json()["sha"]
    response = await client.put(f"{base}/contents/{path}", json=body)
    if response.status_code not in (200, 201):
        raise RuntimeError(
            f"PUT {path} -> {response.status_code}: {response.text[:200]}"
        )
    return response.json()


@workflows.activity(
    name="persist_results",
    start_to_close_timeout=timedelta(seconds=180),
    retry_policy_max_attempts=2,
)
async def persist_results(
    run_at: str,
    digest_markdown: str,
    dashboard_markdown: str,
    payload: dict,
    persist_dir: str,
) -> str:
    import os

    import httpx

    token = os.environ.get("GITHUB_PAT", "")
    repo = os.environ.get("LEGAL_UPDATES_REPO", "mansooor361-creator/systemsm")
    branch = os.environ.get("LEGAL_UPDATES_BRANCH", "legal-updates-data")
    if not token:
        return "persist_skipped: GITHUB_PAT workspace secret not set"
    owner, _, name = repo.partition("/")
    if not name:
        return f"persist_skipped: bad LEGAL_UPDATES_REPO {repo!r}"
    date = run_at[:10]
    base = f"https://api.github.com/repos/{owner}/{name}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
            ref = await client.get(f"{base}/git/ref/heads/{branch}")
            if ref.status_code == 404:
                default_ref = await client.get(f"{base}/git/ref/heads/main")
                if default_ref.status_code != 200:
                    return f"persist_failed: default branch lookup -> {default_ref.status_code}"
                created = await client.post(
                    f"{base}/git/refs",
                    json={
                        "ref": f"refs/heads/{branch}",
                        "sha": default_ref.json()["object"]["sha"],
                    },
                )
                if created.status_code not in (200, 201):
                    return f"persist_failed: create branch -> {created.status_code}"
            payload_json = json.dumps(payload, ensure_ascii=False, indent=2)
            message = f"chore(legal-updates): {date} digest ({payload['items_new']} new items)"
            files = {
                f"{persist_dir}/{date}.md": digest_markdown,
                f"{persist_dir}/{date}.json": payload_json,
                f"{persist_dir}/latest.md": digest_markdown,
                f"{persist_dir}/latest.json": payload_json,
                f"{persist_dir}/dashboard.md": dashboard_markdown,
            }
            written: list[str] = []
            for path, content in files.items():
                result = await _github_put_file(
                    client, base, branch, path, content, message
                )
                written.append(result["content"]["html_url"])
            index_path = f"{persist_dir}/index.md"
            existing = await client.get(
                f"{base}/contents/{index_path}", params={"ref": branch}
            )
            if existing.status_code == 200:
                index_text = base64.b64decode(existing.json()["content"]).decode(
                    "utf-8"
                )
            else:
                index_text = "# سجل آخر التحديثات القانونية\n\n"
            line = f"- [{date}]({date}.md) — {payload['items_new']} عنصراً جديداً ([JSON]({date}.json))\n"
            if line.strip() not in index_text:
                index_text = index_text.rstrip("\n") + "\n" + line
            await _github_put_file(
                client,
                base,
                branch,
                index_path,
                index_text,
                f"chore(legal-updates): index {date}",
            )
            written.append(f"{base}/blob/{branch}/{index_path}")
            return "persisted:" + ";".join(written)
    except Exception as exc:
        return f"persist_failed:{type(exc).__name__}:{str(exc)[:200]}"


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
        new_items_result = await filter_new_items(
            results, input.lookback_hours, input.since_date
        )
        new_items = new_items_result.items[:MAX_TOTAL_NEW_ITEMS]
        if input.classify and new_items:
            classified = await classify_items(new_items)
        else:
            classified = [
                ClassifiedItem(item=item, category="أخرى", summary_ar=item.title)
                for item in new_items
            ]
        source_category = {
            spec.key: spec.default_category for spec in SOURCES if spec.default_category
        }
        for entry in classified:
            fixed = source_category.get(entry.item.source_key)
            if fixed and fixed != "أخرى":
                entry.category = fixed
        sources_ok = sum(1 for result in results if result.ok)
        digest = build_digest_markdown(
            classified,
            run_at,
            input.lookback_hours,
            sources_ok,
            len(results) - sources_ok,
            new_items_result.fetched_total,
        )
        source_counts: dict[str, int] = {}
        for entry in classified:
            source_counts[entry.item.source_key] = (
                source_counts.get(entry.item.source_key, 0) + 1
            )
        dashboard = build_dashboard_markdown(
            classified, run_at, source_counts, input.since_date
        )
        title = f"نشرة آخر التحديثات القانونية — {run_at}"
        delivery_status = await deliver_digest(input.delivery_target, title, digest)
        persist_status = "persist_disabled"
        if input.persist:
            payload = build_run_payload(
                run_at,
                input.lookback_hours,
                sources_ok,
                len(results) - sources_ok,
                new_items_result.fetched_total,
                {r.source_key: (r.error or "no items") for r in results if not r.ok},
                classified,
            )
            persist_status = await persist_results(
                run_at, digest, dashboard, payload, input.persist_dir
            )
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
            persist_status=persist_status,
            source_counts=source_counts,
            dashboard_markdown=dashboard,
        )
