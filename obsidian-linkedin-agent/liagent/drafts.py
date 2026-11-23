"""Draft generators: posts, comments with specialist suggestions, DM replies,
and profile sections (skills, certifications, courses, headline, about).

These are template-based and run fully offline. Every draft goes through
humanize() and detect() before it lands in the queue; the score is stored
in the queue entry so a weak draft is visible, never silently shipped.
"""

from __future__ import annotations

import json
import re
from importlib import resources
from pathlib import Path

from . import detect, humanize

DATA = Path(__file__).resolve().parent / "data"


def _load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def hooks() -> dict:
    return _load("hooks.json")


def rubric() -> dict:
    return _load("rubric.json")


def lexicon():
    return _load("slop.json")


def humanize_draft(text: str):
    """Clean a draft and score it. Returns (clean_text, score, verdict, report)."""
    lex = lexicon()
    clean, report = humanize.humanize(text, lex)
    results, overall, verdict = detect.run(clean, lex)
    return clean.strip(), overall, verdict, report


def _fill(template: str, values: dict[str, str]) -> str:
    out = template
    for key, value in values.items():
        out = out.replace("{" + key + "}", value)
    out = re.sub(r"\{[a-z_ ]+\}", "{{your detail}}", out)
    return out


def _body_points(note_content: str, limit: int = 5) -> list[str]:
    points = []
    for line in note_content.splitlines():
        line = line.strip()
        if line.startswith(("- ", "* ", "• ")):
            points.append(line[2:].strip())
        elif line and not line.startswith("#"):
            points.append(line)
        if len(points) >= limit:
            break
    return points or [note_content.strip().splitlines()[0]]


def make_post(idea: str, note_points: list[str] | None = None,
              voice: str = "", hook_ids: list[int] | None = None) -> tuple[str, list[dict]]:
    """Build a post draft from an idea using the 21 hook formulas."""
    h = hooks()
    all_hooks = h["hooks"]
    chosen = [all_hooks[i - 1] for i in (hook_ids or [1, 2, 3]) if 1 <= i <= len(all_hooks)]
    points = note_points or [idea]
    main = chosen[0]
    hook_line = _fill(main["template"], {"idea": idea, "topic": idea})
    body_lines = []
    for p in points[:4]:
        body_lines.append(p)
        body_lines.append("")
    body_lines.append("What would you add?")
    draft = "\n".join([hook_line, ""] + body_lines).strip() + "\n"
    return draft, [{"id": m["id"] if isinstance(m, dict) and "id" in m else i + 1,
                    "name": m.get("name", f"hook {i+1}"),
                    "template": m.get("template", "")} for i, m in enumerate(chosen)]


def make_comment(field: str, post_text: str, specialists: list[str] | None = None,
                 comment_type: int = 1) -> str:
    """A comment on a colleague's post that ends by pointing to specialists in `field`.

    comment_type picks one of the nine types from the upstream skill
    (1 add a datum, 2 missing case, 3 respectful disagree, 4 extend,
    5 real question, 6 receipt, 7 correction, 8 reframe, 9 one-liner).
    """
    first_sentence = re.split(r"(?<=[.!?])\s+", post_text.strip())[0] if post_text.strip() else ""
    openers = {
        1: f"Adding one number to this: ",
        2: f"This holds until the edge case: ",
        3: f"I mostly agree with this, with one fork: ",
        4: f'"{first_sentence[:80]}" - this is the line that matters. ',
        5: "",
        6: "We ran into exactly this last quarter: ",
        7: "One small correction: ",
        8: "Another way to read this: ",
        9: "",
    }
    body = {
        5: "What happens when the post's assumption breaks? That's the part I'd watch.",
    }.get(comment_type, "Worth sitting with. The pattern underneath is real.")
    if comment_type in (4, 9):
        body = ""
    text = openers.get(comment_type, "") + body
    text = re.sub(r"\s+", " ", text).strip()
    if specialists:
        names = ", ".join(s.split(" — ")[0].split(" - ")[0] for s in specialists[:3])
        text += f" If this topic is useful to you, follow {names} - they go deep on {field}."
    elif field:
        text += f" If you want more on {field}, I can point you to people worth following."
    return text + "\n"


def make_dm_reply(message: str, voice: str = "", max_chars: int = 200) -> str:
    """A short, human reply draft for an incoming LinkedIn message."""
    msg = " ".join(message.split())
    reply = f"Thanks for reaching out - {msg[:80]} is a fair point. Happy to talk it through."
    if len(reply) > max_chars:
        reply = reply[: max_chars - 1].rstrip() + "…"
    return reply + "\n"


PROFILE_SECTIONS = ("headline", "about", "skills", "experience", "certifications", "courses")

RUBRIC_MAP = {
    "headline": "headline",
    "about": "about_body",
    "skills": "skills",
    "experience": "experience_depth",
    "certifications": "experience_depth",
    "courses": "experience_depth",
}


def make_profile_section(section: str, items: list[str], current: str = "") -> tuple[str, list[dict]]:
    """Draft one profile section and score it against the 12-part rubric item."""
    if section not in PROFILE_SECTIONS:
        raise ValueError(f"section must be one of {PROFILE_SECTIONS}")
    r = rubric()
    item = next((i for i in r["items"] if i["id"] == RUBRIC_MAP[section]), None)
    if section == "headline":
        body = items[0] if items else "{{your headline}}"
    elif section == "about":
        body = "\n\n".join(items) if items else "{{your about section}}"
    else:
        body = "\n".join(f"- {i}" for i in items) if items else "{{your items}}"
    if current:
        body = f"Current version:\n{current}\n\nProposed:\n{body}"
    checklist = ([{"id": item["id"], "points": item["points"], "full_marks": item["full_marks"]}]
                 if item else [])
    return body + "\n", checklist
