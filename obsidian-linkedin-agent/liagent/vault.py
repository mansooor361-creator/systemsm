"""Read an Obsidian vault: markdown notes, frontmatter, tags, and the agent folder."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

AGENT_DIR = "LinkedIn Agent"
QUEUE_DIR = "queue"
PENDING = "pending"
APPROVED = "approved"
REJECTED = "rejected"

FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
TAG_RE = re.compile(r"(?:^|\s)#([\w/-]+)")


def parse_frontmatter(text: str) -> dict:
    """Parse a small YAML subset: scalars, [inline lists] and '- item' lists."""
    m = FM_RE.match(text)
    if not m:
        return {}
    data: dict = {}
    current = None
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith((" ", "\t")) and line.strip().startswith("- ") and current:
            data.setdefault(current, [])
            if isinstance(data[current], list):
                data[current].append(_scalar(line.strip()[2:].strip()))
            continue
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()
            current = key
            if not value:
                data[key] = []
            elif value.startswith("[") and value.endswith("]"):
                data[key] = [_scalar(v.strip()) for v in value[1:-1].split(",") if v.strip()]
            else:
                data[key] = _scalar(value)
    return data


def _scalar(value: str):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    try:
        return int(value)
    except ValueError:
        return value


@dataclass
class Note:
    path: Path
    title: str
    content: str
    frontmatter: dict = field(default_factory=dict)
    tags: list = field(default_factory=list)

    @property
    def relpath(self) -> str:
        return str(self.path)


class Vault:
    """An Obsidian vault on disk plus the agent's own folder inside it."""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise NotADirectoryError(f"vault not found: {self.root}")

    @property
    def agent_dir(self) -> Path:
        return self.root / AGENT_DIR

    def queue_dir(self, status: str = PENDING) -> Path:
        return self.agent_dir / QUEUE_DIR / status

    def ensure_agent_dir(self) -> Path:
        for status in (PENDING, APPROVED, REJECTED):
            self.queue_dir(status).mkdir(parents=True, exist_ok=True)
        return self.agent_dir

    def notes(self) -> list[Note]:
        out = []
        for path in sorted(self.root.rglob("*.md")):
            if AGENT_DIR in path.relative_to(self.root).parts:
                continue
            if any(part.startswith(".") for part in path.relative_to(self.root).parts):
                continue
            text = path.read_text(encoding="utf-8")
            fm = parse_frontmatter(text)
            body = FM_RE.sub("", text, count=1)
            fm_tags = fm.get("tags", [])
            if isinstance(fm_tags, str):
                fm_tags = [fm_tags]
            tags = sorted(set(TAG_RE.findall(body)) | set(str(t).lstrip("#") for t in fm_tags))
            title = fm.get("title") or path.stem
            out.append(Note(path=path, title=str(title), content=body.strip(), frontmatter=fm, tags=tags))
        return out

    def ideas(self) -> list[Note]:
        """Notes meant to become content: tagged linkedin/idea or living in Ideas/."""
        out = []
        for note in self.notes():
            if "linkedin/idea" in note.tags or "idea" in note.tags:
                out.append(note)
            elif note.path.relative_to(self.root).parts[0].lower() == "ideas":
                out.append(note)
        return out

    def voice(self) -> str:
        p = self.agent_dir / "voice.md"
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def specialists(self) -> dict[str, list[str]]:
        """Parse specialists.md: '## Field' sections with '- Name — why' lines."""
        p = self.agent_dir / "specialists.md"
        result: dict[str, list[str]] = {}
        if not p.exists():
            return result
        current = None
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.startswith("## "):
                current = line[3:].strip().lower()
                result[current] = []
            elif current and line.strip().startswith("- "):
                result[current].append(line.strip()[2:].strip())
        return result
