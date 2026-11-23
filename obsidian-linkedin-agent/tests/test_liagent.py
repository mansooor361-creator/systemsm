import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from liagent import detect, humanize
from liagent.drafts import (humanize_draft, make_comment, make_dm_reply,
                            make_post, make_profile_section)
from liagent.queue import Queue
from liagent.vault import Vault, parse_frontmatter


class TestVault(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "Ideas").mkdir()
        (self.root / "Ideas" / "launch.md").write_text(
            "---\ntags: [linkedin/idea, saas]\n---\n# Launch week\n\n- shipped v2 on Tuesday\n- 40% fewer support tickets\n#launch\n",
            encoding="utf-8")
        (self.root / "random.md").write_text("just a note\n", encoding="utf-8")
        self.vault = Vault(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_parse_frontmatter(self):
        fm = parse_frontmatter("---\ntags: [a, b]\ntitle: Hi\n---\nbody")
        self.assertEqual(fm["tags"], ["a", "b"])
        self.assertEqual(fm["title"], "Hi")

    def test_ideas_filter(self):
        ideas = self.vault.ideas()
        self.assertEqual(len(ideas), 1)
        self.assertIn("linkedin/idea", ideas[0].tags)
        self.assertIn("launch", ideas[0].tags)

    def test_agent_dir_excluded_from_notes(self):
        self.vault.ensure_agent_dir()
        (self.vault.agent_dir / "queue" / "pending" / "x.md").write_text("draft", encoding="utf-8")
        self.assertEqual(len(self.vault.notes()), 2)

    def test_specialists(self):
        self.vault.ensure_agent_dir()
        (self.vault.agent_dir / "specialists.md").write_text(
            "# Specialists\n\n## machine learning\n- Jane Doe — great threads on evals\n", encoding="utf-8")
        specs = self.vault.specialists()
        self.assertIn("machine learning", specs)
        self.assertEqual(specs["machine learning"], ["Jane Doe — great threads on evals"])


class TestQueue(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Vault(self.tmp.name)
        self.q = Queue(self.vault)

    def tearDown(self):
        self.tmp.cleanup()

    def test_add_list_approve_reject(self):
        e = self.q.add("post", "My post", "body text", human_score=80.0, verdict="PASS")
        self.assertEqual(e.status, "pending")
        self.assertEqual(len(self.q.list("pending")), 1)
        a = self.q.approve(e.id)
        self.assertEqual(a.status, "approved")
        self.assertEqual(len(self.q.list("pending")), 0)
        self.assertIn("approved", str(a.path))
        e2 = self.q.add("dm", "reply", "hi", human_score=70.0, verdict="REVIEW")
        r = self.q.reject(e2.id)
        self.assertEqual(r.status, "rejected")
        self.assertEqual(r.body, "hi")

    def test_find_across_statuses(self):
        e = self.q.add("comment", "c", "body")
        self.q.approve(e.id)
        self.assertEqual(self.q.find(e.id).status, "approved")


class TestDrafts(unittest.TestCase):
    def test_post_uses_hook_and_points(self):
        draft, chosen = make_post("AI drafts cost us a deal", ["the em dash gave it away", "we rewrote it human"],
                                  hook_ids=[1])
        self.assertTrue(draft.strip())
        self.assertEqual(len(chosen), 1)
        self.assertIn("em dash", draft)

    def test_comment_suggests_specialists(self):
        c = make_comment("machine learning", "Great post about evals!",
                         ["Jane Doe — evals", "John Roe — RLHF"], comment_type=1)
        self.assertIn("Jane Doe", c)
        self.assertIn("machine learning", c)

    def test_comment_without_specialists(self):
        c = make_comment("quantum", "Nice post", [], comment_type=5)
        self.assertIn("quantum", c)

    def test_dm_reply_short(self):
        r = make_dm_reply("x " * 100)
        self.assertLessEqual(len(r.strip()), 200)

    def test_profile_section(self):
        body, checklist = make_profile_section("certifications", ["AWS SA", "PMP"])
        self.assertIn("- AWS SA", body)
        self.assertEqual(checklist[0]["id"], "experience_depth")
        with self.assertRaises(ValueError):
            make_profile_section("bogus", [])

    def test_humanize_draft_cleans_and_scores(self):
        raw = "In today's fast-paced world, it's not just a tool, it's a game-changer — delve into this…\u200b"
        clean, score, verdict, report = humanize_draft(raw)
        self.assertNotIn("\u200b", clean)
        self.assertNotIn("—", clean)
        self.assertIn(verdict, ("PASS", "REVIEW", "FLAGGED"))
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 100.0)


class TestHumanizeDetect(unittest.TestCase):
    def test_humanize_removes_invisible_and_em_dash(self):
        from liagent.drafts import lexicon
        clean, report = humanize.humanize("a—b\u200bc", lexicon())
        self.assertEqual(clean.strip(), "a, bc")

    def test_detect_runs_five_checks(self):
        from liagent.drafts import lexicon
        text = ("I shipped this on Tuesday and it broke. We lost three hours. "
                "The fix was one line. I still laugh about it. It cost us a client, honestly.")
        results, overall, verdict = detect.run(text, lexicon())
        self.assertEqual(set(results), set(detect.CHECKS))
        self.assertTrue(0 <= overall <= 100)


if __name__ == "__main__":
    unittest.main()
