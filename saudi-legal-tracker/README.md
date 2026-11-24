# saudi-legal-tracker

Mistral Workflow that tracks the latest Saudi legal publications — royal orders, royal
decrees, Council of Ministers decisions, ministerial decisions, circulars, regulations,
and amendments/repeals of regulations — from official sources:

- Umm Al-Qura official gazette: `uqn.gov.sa`, `portal.uqn.gov.sa/archive`
- Bureau of Experts (Council of Ministers): `laws.boe.gov.sa` (laws search + law updates)
- Ministry of Justice: `laws.moj.gov.sa`, `portaleservices.moj.gov.sa/TameemPortal`
- Ministry of Finance: `mof.gov.sa` (announcements & circulars, rules and regulations)
- Ministry of Human Resources and Social Development: `hrsd.gov.sa` (decisions and regulations)

Each run fetches the latest listing pages, keeps only items not seen before (in-worker
dedupe, bounded by `lookback_hours`), classifies and summarizes them in Arabic with a
Mistral model, and returns a Markdown digest. Delivery to Slack / email / Notion is
optional (see `.env.example`); by default the digest is the execution result in Studio.

## Workflow

- Name: `saudi-legal-updates`
- Input (`TrackerInput`):
  - `lookback_hours` (default 48): only report items published within this window when a
    Gregorian date is available; undated items rely on dedupe.
  - `max_items_per_source` (default 15)
  - `classify` (default true): run the Mistral classifier; when false, items are returned
    unclassified.
  - `delivery_target` (default `studio`): `studio` | `slack` | `email` | `notion`
- Output (`TrackerOutput`): run metadata, per-source counts, the classified items, the
  Markdown digest, and the delivery status.

## Develop

```bash
mistral dev                 # hot-reloading worker (needs MISTRAL_API_KEY in .env)
cd apps/worker
uv run --all-packages python -m pytest tests/ -q     # tests
```

Lint: `ruff check` / `ruff format --check` on the worker sources, and
`semgrep --config .agents/skills/capability-workflows/scripts/linting/rules apps/worker/src/worker/workflows`
(the `worker:semgrep` nx target runs the same rules).

## Deploy

Push to the GitHub repository, then deploy the pushed revision as a managed workflow
deployment (see `docs.mistral.ai/studio/workflows` → managed deployments). After the
deployment serves the revision, create a schedule, e.g. daily at 09:00 Asia/Riyadh:

```python
from mistralai.client import Mistral, models

client = Mistral()
client.workflows.schedules.schedule_workflow(
    workflow_identifier="saudi-legal-updates",
    deployment_name="<deployment-name>",
    schedule=models.ScheduleDefinition(
        input={"lookback_hours": 26, "delivery_target": "studio"},
        cron_expressions=["0 6 * * *"],  # 09:00 Asia/Riyadh (UTC+3)
        time_zone_name="Asia/Riyadh",
        policy=models.SchedulePolicy(overlap=models.ScheduleOverlapPolicy.SKIP),
    ),
)
```

Run once manually first (`execute_workflow`) and confirm the digest before enabling the
schedule. Bind delivery secrets as workspace secrets on the deployment when using
`slack`/`email`/`notion` targets — scheduled runs act as the deployment and cannot use
user OAuth credentials.
