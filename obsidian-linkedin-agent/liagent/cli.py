"""liagent command line interface.

  liagent init --vault ~/Obsidian/MyVault
  liagent ideas                       # list content ideas found in the vault
  liagent post --vault V --idea "..." [--note path] [--hooks 1,5,9]
  liagent comment --vault V --field "machine learning" --post "..." [--type 5]
  liagent dm --vault V --message "..."
  liagent profile --vault V --section skills --item "PyTorch" --item "LLM eval"
  liagent queue [--status pending]
  liagent approve <id> | reject <id>
  liagent export <id>                 # copy-ready block, nothing is posted
  liagent score <file> | humanize <file>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__, detect, humanize
from .drafts import (humanize_draft, lexicon, make_comment, make_dm_reply,
                     make_post, make_profile_section)
from .queue import PENDING, Queue
from .vault import APPROVED, REJECTED, Vault


def _vault(args) -> Vault:
    return Vault(args.vault)


def _queue(args) -> Queue:
    return Queue(_vault(args))


def cmd_init(args) -> int:
    vault = _vault(args)
    agent_dir = vault.ensure_agent_dir()
    voice_src = Path(__file__).resolve().parent.parent / "templates" / "voice.md"
    voice_dst = agent_dir / "voice.md"
    if not voice_dst.exists() and voice_src.exists():
        voice_dst.write_text(voice_src.read_text(encoding="utf-8"), encoding="utf-8")
    spec = agent_dir / "specialists.md"
    if not spec.exists():
        spec.write_text(
            "# Specialists worth following, by field\n\n"
            "## machine learning\n- {{name}} — {{why}}\n\n"
            "## data engineering\n- {{name}} — {{why}}\n",
            encoding="utf-8",
        )
    print(f"agent folder ready: {agent_dir}")
    print("edit voice.md and specialists.md, then run: liagent ideas")
    return 0


def cmd_ideas(args) -> int:
    notes = _vault(args).ideas()
    if not notes:
        print("no ideas yet - tag a note #linkedin/idea or put it in Ideas/")
        return 1
    for n in notes:
        print(f"- {n.title}  ({n.path.name})  tags: {', '.join(n.tags) or '-'}")
    return 0


def _enqueue(args, kind: str, title: str, draft: str) -> int:
    clean, score, verdict, _report = humanize_draft(draft)
    entry = _queue(args).add(kind, title, clean, human_score=score, verdict=verdict)
    print(f"queued [{entry.status}] {entry.id}  {kind}: {title}")
    print(f"human score {score:.1f} ({verdict}) - approve with: liagent approve {entry.id}")
    return 0


def cmd_post(args) -> int:
    vault = _vault(args)
    note_points = None
    if args.note:
        note = next((n for n in vault.notes() if str(n.path) == args.note or n.path.name == args.note), None)
        if note is None:
            print(f"note not found: {args.note}", file=sys.stderr)
            return 1
        from .drafts import _body_points
        note_points = _body_points(note.content)
        idea = args.idea or note.title
    else:
        idea = args.idea
    if not idea:
        print("--idea is required (or pass --note)", file=sys.stderr)
        return 1
    hooks = [int(h) for h in args.hooks.split(",")] if args.hooks else [1, 2, 3]
    draft, chosen = make_post(idea, note_points, vault.voice(), hooks)
    print("hook options:", ", ".join(f"#{c['id']} {c['name']}" for c in chosen))
    return _enqueue(args, "post", idea[:60], draft)


def cmd_comment(args) -> int:
    vault = _vault(args)
    specs = vault.specialists().get(args.field.lower(), [])
    if not specs:
        print(f"no specialists listed for field '{args.field}' in {vault.agent_dir / 'specialists.md'}; "
              "the comment will be generic", file=sys.stderr)
    draft = make_comment(args.field, args.post, specs, args.type)
    return _enqueue(args, "comment", f"on {args.field} post", draft)


def cmd_dm(args) -> int:
    draft = make_dm_reply(args.message, _vault(args).voice())
    return _enqueue(args, "dm", "reply to message", draft)


def cmd_profile(args) -> int:
    body, checklist = make_profile_section(args.section, args.item or [], args.current or "")
    draft = body
    if checklist:
        draft += "\n\n<!-- rubric: " + checklist[0]["full_marks"][:120] + " -->\n"
    return _enqueue(args, f"profile:{args.section}", args.section, draft)


def cmd_queue(args) -> int:
    entries = _queue(args).list(args.status)
    if not entries:
        print(f"queue '{args.status}' is empty")
        return 0
    for e in entries:
        print(f"{e.id}  [{e.kind:<16}] score {e.human_score:5.1f} {e.verdict:<8} {e.title}")
    return 0


def cmd_approve(args) -> int:
    e = _queue(args).approve(args.id)
    print(f"approved {e.id} -> {e.path}")
    return 0


def cmd_reject(args) -> int:
    e = _queue(args).reject(args.id)
    print(f"rejected {e.id} -> {e.path}")
    return 0


def cmd_export(args) -> int:
    e = _queue(args).find(args.id)
    print(f"--- {e.kind}: {e.title} (score {e.human_score:.1f} {e.verdict}) ---")
    print(e.body)
    print("\nNothing is posted automatically. Copy this into LinkedIn yourself.")
    return 0


def cmd_score(args) -> int:
    text = Path(args.file).read_text(encoding="utf-8")
    results, overall, verdict = detect.run(text, lexicon())
    detect.render(results, overall, verdict, label=args.file)
    return 0 if verdict == "PASS" else 1


def cmd_humanize(args) -> int:
    text = Path(args.file).read_text(encoding="utf-8")
    clean, report = humanize.humanize(text, lexicon())
    sys.stdout.write(clean)
    if args.report:
        humanize.render_report(report, out=sys.stderr)
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="liagent",
                                 description="Obsidian-linked LinkedIn drafting agent (drafts only, human approves).")
    ap.add_argument("--version", action="version", version=f"liagent {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def with_vault(p):
        p.add_argument("--vault", required=True, help="path to the Obsidian vault")

    p = sub.add_parser("init", help="create the agent folder inside the vault"); with_vault(p); p.set_defaults(func=cmd_init)
    p = sub.add_parser("ideas", help="list content ideas found in the vault"); with_vault(p); p.set_defaults(func=cmd_ideas)
    p = sub.add_parser("post", help="draft a post from an idea"); with_vault(p)
    p.add_argument("--idea"); p.add_argument("--note"); p.add_argument("--hooks", help="comma-separated hook ids, e.g. 1,5,9")
    p.set_defaults(func=cmd_post)
    p = sub.add_parser("comment", help="draft a comment with specialist-follow suggestions"); with_vault(p)
    p.add_argument("--field", required=True); p.add_argument("--post", required=True)
    p.add_argument("--type", type=int, default=1, help="comment type 1-9")
    p.set_defaults(func=cmd_comment)
    p = sub.add_parser("dm", help="draft a reply to a message"); with_vault(p)
    p.add_argument("--message", required=True); p.set_defaults(func=cmd_dm)
    p = sub.add_parser("profile", help="draft a profile section (skills/certifications/courses/...)"); with_vault(p)
    p.add_argument("--section", required=True)
    p.add_argument("--item", action="append")
    p.add_argument("--current")
    p.set_defaults(func=cmd_profile)
    p = sub.add_parser("queue", help="list the approval queue"); with_vault(p)
    p.add_argument("--status", default=PENDING, choices=[PENDING, APPROVED, REJECTED]); p.set_defaults(func=cmd_queue)
    p = sub.add_parser("approve"); with_vault(p); p.add_argument("id"); p.set_defaults(func=cmd_approve)
    p = sub.add_parser("reject"); with_vault(p); p.add_argument("id"); p.set_defaults(func=cmd_reject)
    p = sub.add_parser("export", help="print a copy-ready draft (never posts)"); with_vault(p); p.add_argument("id"); p.set_defaults(func=cmd_export)
    p = sub.add_parser("score", help="run the five-check detection panel on a file")
    p.add_argument("file"); p.set_defaults(func=cmd_score)
    p = sub.add_parser("humanize", help="strip machine fingerprints from a file")
    p.add_argument("file"); p.add_argument("--report", action="store_true"); p.set_defaults(func=cmd_humanize)
    return ap


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
