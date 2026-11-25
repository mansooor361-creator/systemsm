"""Tests for the Saudi legal updates tracker workflow."""

import asyncio
from datetime import timedelta

import mistralai.workflows as workflows
from mistralai.workflows.testing import create_test_worker

from worker.workflows import saudi_legal_tracker as tracker

RSS_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>test</title>
<item><title>مرسوم ملكي رقم 45 لسنة 2026</title><link>https://www.uqn.gov.sa/articles/123</link>
<pubDate>Mon, 06 Apr 2026 10:00:00 GMT</pubDate><description>نص المرسوم الملكي</description></item>
</channel></rss>"""

ATOM_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>test</title>
<entry><title>قرار مجلس الوزراء رقم 500</title><link href="/decisions/500"/>
<published>2026-04-05T09:00:00Z</published><summary>ملخص القرار</summary></entry>
</feed>"""

HTML_SAMPLE = """
<html><body>
<a href="/articles/987">قرار مجلس الوزراء رقم 500 لسنة 2026</a> <span>2026/04/05</span>
<a href="https://www.mof.gov.sa/docs/file.pdf">تعميم وزارة المالية رقم 12</a>
<a href="https://twitter.com/example">تابعنا</a>
<a href="#top">أعلى الصفحة</a>
</body></html>
"""

SPEC = tracker.SourceSpec(
    key="test",
    name_ar="مصدر تجريبي",
    kind="page",
    urls=["https://www.uqn.gov.sa/"],
    hint="",
)


def test_parse_feed_rss_items() -> None:
    items = tracker.parse_feed(RSS_SAMPLE, "https://www.uqn.gov.sa/", SPEC, 10)
    assert len(items) == 1
    assert items[0].title == "مرسوم ملكي رقم 45 لسنة 2026"
    assert items[0].url == "https://www.uqn.gov.sa/articles/123"
    assert items[0].published_at == "Mon, 06 Apr 2026 10:00:00 GMT"


def test_parse_feed_atom_items() -> None:
    items = tracker.parse_feed(
        ATOM_SAMPLE, "https://laws.boe.gov.sa/boelaws/laws/", SPEC, 10
    )
    assert len(items) == 1
    assert items[0].url == "https://laws.boe.gov.sa/decisions/500"
    assert items[0].published_at == "2026-04-05T09:00:00Z"


def test_parse_feed_invalid_xml_returns_empty() -> None:
    assert tracker.parse_feed("not xml at all", "https://x.gov.sa/", SPEC, 10) == []


def test_extract_html_links_filters_and_finds_dates() -> None:
    items = tracker.extract_html_links(HTML_SAMPLE, "https://www.uqn.gov.sa/", SPEC, 10)
    urls = [item.url for item in items]
    assert "https://www.uqn.gov.sa/articles/987" in urls
    assert "https://www.mof.gov.sa/docs/file.pdf" in urls
    assert not any("twitter" in url or url.endswith("#top") for url in urls)
    dated = next(item for item in items if item.url.endswith("/articles/987"))
    assert dated.published_at == "2026/04/05"


HTML_WITH_DATES = """
<html><body>
<a href="/news">اخر الاخبار</a>
<a href="/decisions">القرارات</a>
<a href="/articles/1">مرسوم ملكي رقم 10 لسنة 2026</a> <span>2026/04/06</span>
<a href="/articles/2">قرار مجلس الوزراء رقم 20</a> <span>2026/04/05</span>
<a href="/articles/3">تعميم وزارة المالية رقم 5</a> <span>2026-04-04</span>
<a href="/articles/4">نظام جديد</a> <span>2026/04/03</span>
</body></html>
"""


def test_extract_html_links_drops_nav_when_dated_items_exist() -> None:
    items = tracker.extract_html_links(
        HTML_WITH_DATES, "https://www.uqn.gov.sa/", SPEC, 15
    )
    urls = [item.url for item in items]
    assert "https://www.uqn.gov.sa/articles/1" in urls
    assert not any(url.endswith("/news") or url.endswith("/decisions") for url in urls)


def test_parse_date_to_epoch() -> None:
    assert tracker._parse_date_to_epoch("2026-04-05") is not None
    assert tracker._parse_date_to_epoch("05/04/2026") is not None
    assert tracker._parse_date_to_epoch("Mon, 06 Apr 2026 10:00:00 GMT") is not None
    assert tracker._parse_date_to_epoch("16/10/1447هـ") is not None  # Hijri now converts
    assert tracker._parse_date_to_epoch("") is None


def test_select_new_items_dedupes_and_filters_old() -> None:
    item_new = tracker.LegalItem(
        source_key="uqn",
        source_name="أم القرى",
        title="جديد",
        url="https://www.uqn.gov.sa/a/1",
    )
    item_old = tracker.LegalItem(
        source_key="uqn",
        source_name="أم القرى",
        title="قديم",
        url="https://www.uqn.gov.sa/a/2",
        published_at="2020-01-01",
    )
    results = [
        tracker.SourceFetchResult(
            source_key="uqn",
            source_name="أم القرى",
            ok=True,
            items=[item_new, item_old],
        )
    ]
    seen: dict[str, float] = {}
    first = tracker.select_new_items(
        results, lookback_hours=48, now=1_800_000_000.0, seen_urls=seen
    )
    assert [item.url for item in first.items] == ["https://www.uqn.gov.sa/a/1"]
    assert first.fetched_total == 2
    second = tracker.select_new_items(
        results, lookback_hours=48, now=1_800_000_100.0, seen_urls=seen
    )
    assert second.items == []
    assert second.fetched_total == 2


def test_build_digest_markdown_groups_amendments_first() -> None:
    amendment = tracker.ClassifiedItem(
        item=tracker.LegalItem(
            source_key="boe_updates",
            source_name="تحديثات الأنظمة",
            title="تعديل نظام العمل",
            url="https://laws.boe.gov.sa/x",
            published_at="2026-04-05",
        ),
        category="تعديل نظام",
        reference="نظام العمل",
        summary_ar="تم تعديل المادة الخامسة.",
        is_amendment_or_repeal=True,
    )
    decision = tracker.ClassifiedItem(
        item=tracker.LegalItem(
            source_key="uqn",
            source_name="أم القرى",
            title="قرار مجلس الوزراء رقم 9",
            url="https://www.uqn.gov.sa/y",
        ),
        category="قرار مجلس الوزراء",
        summary_ar="ملخص القرار.",
    )
    digest = tracker.build_digest_markdown(
        [decision, amendment], "2026-04-06T00:00:00", 48, 8, 1, 12
    )
    assert digest.index("تعديلات وإلغاءات") < digest.index("قرار مجلس الوزراء")
    assert "تعديل نظام العمل" in digest
    assert "https://laws.boe.gov.sa/x" in digest


def test_build_digest_markdown_empty() -> None:
    digest = tracker.build_digest_markdown([], "2026-04-06T00:00:00", 48, 9, 0, 0)
    assert "لا توجد عناصر جديدة" in digest


@workflows.activity(name="fetch_source")
async def _stub_fetch_source(
    spec: tracker.SourceSpec, max_items: int
) -> tracker.SourceFetchResult:
    item = tracker.LegalItem(
        source_key=spec.key,
        source_name=spec.name_ar,
        title=f"عنصر من {spec.key}",
        url=f"https://www.uqn.gov.sa/items/{spec.key}",
    )
    return tracker.SourceFetchResult(
        source_key=spec.key, source_name=spec.name_ar, ok=True, items=[item]
    )


@workflows.activity(name="filter_new_items")
async def _stub_filter_new_items(
    results: list[tracker.SourceFetchResult],
    lookback_hours: int,
    since_date: str | None,
) -> tracker.NewItemsResult:
    items = [item for result in results for item in result.items]
    return tracker.NewItemsResult(items=items, fetched_total=len(items))


@workflows.activity(name="classify_items")
async def _stub_classify_items(
    items: list[tracker.LegalItem],
) -> list[tracker.ClassifiedItem]:
    return [
        tracker.ClassifiedItem(
            item=item, category="قرار وزاري", reference="قرار رقم 1", summary_ar="ملخص"
        )
        for item in items
    ]


@workflows.activity(name="deliver_digest")
async def _stub_deliver_digest(target: str, title: str, digest: str) -> str:
    return "studio_only"


@workflows.activity(name="persist_results")
async def _stub_persist_results(
    run_at: str,
    digest_markdown: str,
    dashboard_markdown: str,
    payload: dict,
    persist_dir: str,
) -> str:
    return "persisted_stub"


def test_build_run_payload() -> None:
    classified = [
        tracker.ClassifiedItem(
            item=tracker.LegalItem(
                source_key="uqn",
                source_name="أم القرى",
                title="مرسوم ملكي رقم 1",
                url="https://www.uqn.gov.sa/a/1",
            ),
            category="مرسوم ملكي",
            reference="مرسوم ملكي رقم 1 لسنة 2026",
            summary_ar="ملخص",
        )
    ]
    payload = tracker.build_run_payload(
        "2026-11-24T16:24:14+00:00",
        48,
        6,
        3,
        77,
        {"boe_laws": "ConnectTimeout"},
        classified,
    )
    assert payload["items_new"] == 1
    assert payload["source_errors"] == {"boe_laws": "ConnectTimeout"}
    assert payload["items"][0]["category"] == "مرسوم ملكي"
    assert payload["items"][0]["item"]["url"] == "https://www.uqn.gov.sa/a/1"


def test_hijri_date_conversion() -> None:
    epoch = tracker._hijri_to_epoch(1448, 5, 15)
    assert epoch is not None
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp(epoch, timezone.utc)
    assert dt.year == 2026 and dt.month == 10
    assert tracker._parse_date_to_epoch("15/5/1448") == epoch
    assert tracker._parse_date_to_epoch("1448/05/15") == epoch
    assert tracker._parse_date_to_epoch("15/5/1448هـ") == epoch


def test_select_new_items_since_date_filters_old_hijri() -> None:
    item_old = tracker.LegalItem(
        source_key="uqn_rules",
        source_name="لوائح وأنظمة — جريدة أم القرى",
        title="نظام قديم",
        url="https://www.uqn.gov.sa/a/old",
        published_at="10/5/1448",
    )
    item_new = tracker.LegalItem(
        source_key="uqn_rules",
        source_name="لوائح وأنظمة — جريدة أم القرى",
        title="نظام جديد",
        url="https://www.uqn.gov.sa/a/new",
        published_at="20/5/1448",
    )
    results = [
        tracker.SourceFetchResult(
            source_key="uqn_rules",
            source_name="لوائح",
            ok=True,
            items=[item_old, item_new],
        )
    ]
    seen: dict[str, float] = {}
    since = tracker._parse_date_to_epoch("15/5/1448")
    out = tracker.select_new_items(
        results,
        lookback_hours=24 * 365,
        now=1_800_000_000.0,
        seen_urls=seen,
        since_epoch=since,
    )
    assert [i.url for i in out.items] == ["https://www.uqn.gov.sa/a/new"]


def test_build_dashboard_markdown_counts_and_links() -> None:
    entry = tracker.ClassifiedItem(
        item=tracker.LegalItem(
            source_key="uqn_royal_orders",
            source_name="أوامر ملكية — جريدة أم القرى",
            title="أمر ملكي رقم 99",
            url="https://www.uqn.gov.sa/decisions/royal-orders/99",
            published_at="20/5/1448",
        ),
        category="أمر ملكي",
    )
    dash = tracker.build_dashboard_markdown(
        [entry], "2026-11-25T06:00:00+00:00", {"uqn_royal_orders": 1}, "15/5/1448"
    )
    assert "لوحة متابعة" in dash
    assert "أمر ملكي (1)" in dash
    assert "[أمر ملكي رقم 99](https://www.uqn.gov.sa/decisions/royal-orders/99)" in dash
    assert "أوامر ملكية — جريدة أم القرى: **1**" in dash
    assert "15/5/1448" in dash


async def test_workflow_end_to_end(temporal_env) -> None:  # noqa: ANN001
    async with create_test_worker(
        temporal_env,
        workflows=[tracker.SaudiLegalUpdatesWorkflow],
        activities=[
            _stub_fetch_source,
            _stub_filter_new_items,
            _stub_classify_items,
            _stub_deliver_digest,
            _stub_persist_results,
        ],
    ):
        handle = await temporal_env.client.start_workflow(
            tracker.WORKFLOW_NAME,
            {
                "lookback_hours": 48,
                "max_items_per_source": 5,
                "classify": True,
                "delivery_target": "studio",
            },
            id="test-saudi-legal-updates",
            task_queue="test-task-queue",
            execution_timeout=timedelta(seconds=20),
        )
        result = await asyncio.wait_for(handle.result(), timeout=30)
        assert result["sources_total"] == len(tracker.SOURCES)
        assert result["sources_ok"] == len(tracker.SOURCES)
        assert result["items_new"] == len(tracker.SOURCES)
        assert result["delivery_status"] == "studio_only"
        assert result["persist_status"] == "persisted_stub"
        assert "نشرة" in result["digest_markdown"]
        assert result["items"][0]["category"] == "قرار مجلس الوزراء"
        assert result["items"][0]["item"]["source_key"] == tracker.SOURCES[0].key
        assert result["source_counts"] == {sp.key: 1 for sp in tracker.SOURCES}
        assert "لوحة متابعة" in result["dashboard_markdown"]
        assert tracker.SOURCES[0].name_ar in result["dashboard_markdown"]


async def test_workflow_without_classification(temporal_env) -> None:  # noqa: ANN001
    async with create_test_worker(
        temporal_env,
        workflows=[tracker.SaudiLegalUpdatesWorkflow],
        activities=[
            _stub_fetch_source,
            _stub_filter_new_items,
            _stub_classify_items,
            _stub_deliver_digest,
            _stub_persist_results,
        ],
    ):
        handle = await temporal_env.client.start_workflow(
            tracker.WORKFLOW_NAME,
            {
                "lookback_hours": 24,
                "max_items_per_source": 3,
                "classify": False,
                "delivery_target": "studio",
            },
            id="test-saudi-legal-updates-noclassify",
            task_queue="test-task-queue",
            execution_timeout=timedelta(seconds=20),
        )
        result = await asyncio.wait_for(handle.result(), timeout=30)
        assert result["items_new"] == len(tracker.SOURCES)
        assert result["items"][0]["category"] == tracker.SOURCES[0].default_category
