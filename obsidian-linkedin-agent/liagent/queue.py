"""The approval queue. Drafts live as markdown files inside the Obsidian vault.

pending/  -> awaiting a human decision
approved/ -> human said yes, copy-ready
rejected/ -> human said no

Nothing is ever posted by this package. Approval only moves a file; the
human still pastes the content into LinkedIn themselves.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .vault import APPROVED, PENDING, REJECTED, Vault, parse_frontmatter

STATUSES = (PENDING, APPROVED, REJECTED)


@dataclass
class Entry:
    id: str
    kind: str
    title: str
    body: str
    status: str
    human_score: float
    verdict: str
    created: str
    path: Path
    frontmatter: dict


def _slug(title: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", title.lower()).strip().replace(" ", "-")
    return slug[:40] or "draft"


class Queue:
    def __init__(self, vault: Vault):
        self.vault = vault
        for status in STATUSES:
            vault.queue_dir(status).mkdir(parents=True, exist_ok=True)

    def add(self, kind: str, title: str, body: str, human_score: float = 0.0,
            verdict: str = "UNSCORED") -> Entry:
        entry_id = uuid.uuid4().hex[:8]
        created = datetime.now(timezone.utc).isoformat(timespec="seconds")
        fm = {
            "id": entry_id,
            "kind": kind,
            "title": title,
            "status": PENDING,
            "human_score": round(float(human_score), 1),
            "verdict": verdict,
            "created": created,
        }
        fname = f"{created[:10]}-{entry_id}-{_slug(title)}.md"
        path = self.vault.queue_dir(PENDING) / fname
        lines = ["---"]
        for k, v in fm.items():
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        lines += ["---", "", body.strip(), ""]
        path.write_text("\n".join(lines), encoding="utf-8")
        return self.get(entry_id)

    def _all(self, status: str) -> list[Entry]:
        out = []
        for path in sorted(self.vault.queue_dir(status).glob("*.md")):
            text = path.read_text(encoding="utf-8")
            fm = parse_frontmatter(text)
            body = re.sub(r"\A---\s*\n.*?\n---\s*\n?", "", text, count=1, flags=re.DOTALL).strip()
            out.append(Entry(
                id=str(fm.get("id", path.stem)),
                kind=str(fm.get("kind", "?")),
                title=str(fm.get("title", path.stem)),
                body=body,
                status=status,
                human_score=float(fm.get("human_score", 0.0)),
                verdict=str(fm.get("verdict", "?")),
                created=str(fm.get("created", "")),
                path=path,
                frontmatter=fm,
            ))
        return out

    def list(self, status: str = PENDING) -> list[Entry]:
        if status not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        return self._all(status)

    def get(self, entry_id: str, status: str = PENDING) -> Entry:
        for entry in self._all(status):
            if entry.id == entry_id:
                return entry
        raise KeyError(f"no {status} entry with id {entry_id!r}")

    def find(self, entry_id: str) -> Entry:
        for status in STATUSES:
            try:
                return self.get(entry_id, status)
            except KeyError:
                continue
        raise KeyError(f"no entry with id {entry_id!r} in any queue")

    def _move(self, entry_id: str, target: str) -> Entry:
        entry = self.find(entry_id)
        dest_dir = self.vault.queue_dir(target)
        dest = dest_dir / entry.path.name
        text = entry.path.read_text(encoding="utf-8")
        text = re.sub(r"(?m)^status: .*$/", f"status: {json.dumps(target)}", text, count=1)
        dest.write_text(text, encoding="utf-8")
        entry.path.unlink()
        return self.get(entry_id, target)

    def approve(self, entry_id: str) -> Entry:
        return self._move(entry_id, APPROVED)

    def reject(self, entry_id: str) -> Entry:
        return self._move(entry_id, REJECTED)
