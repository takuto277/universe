#!/usr/bin/env python3
"""test_agent_runner.py : agent_runner のオーケストレーションを fake で検証する

外部コマンド (gh / git / opencode) を差し替え、ネットワークなしで
キュー取得・ラベル遷移・worktree・verify・PR 作成・失敗時の後始末を確認する。
"""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent_runner as ar  # noqa: E402


class FakeCommands:
    def __init__(self):
        self.calls = []
        self.handlers = []
        self.default = ar.Result(0, "", "")

    def on(self, prefix, result=None, effect=None):
        self.handlers.append((list(prefix), result, effect))
        return self

    def run(self, argv, cwd=None, timeout=None):
        argv = list(argv)
        self.calls.append({"argv": argv, "cwd": cwd, "timeout": timeout})
        for prefix, result, effect in self.handlers:
            if argv[:len(prefix)] == prefix:
                if effect:
                    effect(argv, cwd)
                return result if result is not None else ar.Result(0, "", "")
        return self.default

    def find(self, *prefix):
        return [call for call in self.calls
                if call["argv"][:len(prefix)] == list(prefix)]

    def called(self, *prefix):
        return bool(self.find(*prefix))


def make_worktree(argv, _cwd=None):
    # git worktree add [-b <branch>] <path> <ref>
    for index, value in enumerate(argv):
        if value == "add":
            path = argv[index + 2] if argv[index + 1] == "-b" else argv[index + 1]
            Path(path).mkdir(parents=True, exist_ok=True)
            return
    raise AssertionError("unexpected worktree command: %r" % (argv,))


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "repo"
        (self.root / "tools").mkdir(parents=True)
        (self.root / "tools" / "verify.sh").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
        self.cfg = ar.Config(
            root=self.root,
            state_dir=base / "state",
            log_file=base / "runner.log",
            gh_bin="gh",
            git_bin="git",
            opencode_bin="opencode",
        )
        self.fake = FakeCommands()
        self.runner = ar.Runner(self.cfg, cmd=self.fake, log=lambda line: None)
        self.issue = {
            "number": 12,
            "title": "janken-game: CPUのクセを追加",
            "body": "背景: クセが4種類しかない\n提案: 2種類追加する",
            "labels": [{"name": "agent:ready"}],
            "url": "https://github.com/takuto277/universe/issues/12",
            "state": "OPEN",
        }

    def tearDown(self):
        self.tmp.cleanup()

    # ---- helpers ----
    def ready_queue(self):
        self.fake.on(["gh", "issue", "list"],
                     ar.Result(0, json.dumps([self.issue]), ""))

    def happy(self, **overrides):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.ready_queue()
        self.fake.on(["gh", "issue", "view"], ar.Result(0, json.dumps(self.issue), ""))
        self.fake.on(["gh", "pr", "list"],
                     ar.Result(0, json.dumps(overrides.get("prs", [])), ""))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        self.fake.on(["git", "status", "--porcelain"],
                     ar.Result(0, overrides.get("status", ""), ""))
        self.fake.on(["git", "rev-list"],
                     ar.Result(0, overrides.get("commits", "1\n"), ""))
        self.fake.on(["bash"], overrides.get("verify", ar.Result(0, "ok", "")))
        self.fake.on(["git", "push"], overrides.get("push", ar.Result(0)))
        self.fake.on(["gh", "pr", "create"], overrides.get(
            "create", ar.Result(0, "https://github.com/takuto277/universe/pull/99\n")))
        self.fake.on(["opencode", "run"],
                     overrides.get("agent", ar.Result(0, "done", "")))
        self.fake.on(["gh", "issue", "edit"], ar.Result(0))
        self.fake.on(["gh", "issue", "comment"], ar.Result(0))
        return self.cfg.state_dir / "worktrees" / "issue-12"

    # ---- tests ----
    def test_no_ready_issues_is_noop(self):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.fake.on(["gh", "issue", "list"], ar.Result(0, "[]"))
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "issue", "edit"))
        self.assertFalse(self.fake.called("opencode", "run"))
        calls = [call["argv"][:3] for call in self.fake.calls]
        self.assertLess(calls.index(["gh", "label", "list"]),
                        calls.index(["gh", "issue", "list"]))

    def test_happy_path_claims_verifies_and_opens_pr(self):
        self.happy()
        self.assertEqual(0, self.runner.run_once())

        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:running" in argv for argv in edits))
        self.assertTrue(any("agent:done" in argv for argv in edits))

        add = self.fake.find("git", "worktree", "add")[0]["argv"]
        self.assertIn("agent/issue-12", add)

        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("--agent", run)
        self.assertIn("builder", run)
        prompt = run[-1]
        self.assertIn("Issue #12", prompt)
        self.assertIn("janken-game: CPUのクセを追加", prompt)
        self.assertIn("verify.sh", prompt)
        self.assertIn("push", prompt)

        self.assertTrue(self.fake.called("bash", str(self.root / "tools" / "verify.sh")))
        pushes = [call["argv"] for call in self.fake.find("git", "push")]
        self.assertTrue(any("agent/issue-12" in argv for argv in pushes))
        self.assertTrue(self.fake.called("gh", "pr", "create"))

        comments = [call["argv"][-1] for call in self.fake.find("gh", "issue", "comment")]
        self.assertTrue(any("pull/99" in body for body in comments))

    def test_verify_failure_marks_failed_without_pr(self):
        self.happy(verify=ar.Result(1, "NG: link", ""))
        self.assertEqual(1, self.runner.run_once())

        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("git", "push", "-u", "origin", "agent/issue-12"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))
        comments = [call["argv"][-1] for call in self.fake.find("gh", "issue", "comment")]
        self.assertTrue(any("失敗" in body for body in comments))

    def test_agent_timeout_marks_failed(self):
        self.happy(agent=ar.Result(124, "", "", timed_out=True))
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_no_commits_marks_failed(self):
        self.happy(commits="0\n")
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_existing_open_pr_is_skipped(self):
        self.happy(prs=[{"number": 5, "state": "OPEN",
                         "url": "https://github.com/takuto277/universe/pull/5"}])
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "worktree", "add"))
        self.assertFalse(self.fake.called("opencode", "run"))
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:done" in argv for argv in edits))

    def test_dirty_tree_is_committed_before_push(self):
        self.happy(status=" M apps.json\n")
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.fake.called("git", "add", "-A"))
        commits = self.fake.find("git", "-c", "user.name=takuto277")
        self.assertTrue(commits)
        self.assertTrue(any("commit" in call["argv"] for call in commits))

    def test_pause_skips_all_work(self):
        (self.cfg.state_dir / "pause").parent.mkdir(parents=True, exist_ok=True)
        (self.cfg.state_dir / "pause").touch()
        self.ready_queue()
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "issue", "list"))

    def test_lock_is_exclusive_and_recovers_stale(self):
        first = ar.Lock(self.cfg.state_dir)
        self.assertTrue(first.acquire())
        second = ar.Lock(self.cfg.state_dir)
        self.assertFalse(second.acquire())
        first.release()

        stale = ar.Lock(self.cfg.state_dir)
        self.assertTrue(stale.acquire())
        (self.cfg.state_dir / "lock" / "pid").write_text("999999")
        third = ar.Lock(self.cfg.state_dir)
        self.assertTrue(third.acquire())
        third.release()
        stale.release()

    def test_explicit_issue_uses_view_not_queue(self):
        self.happy()
        self.assertEqual(0, self.runner.run_once(issue_number=12))
        self.assertTrue(self.fake.called("gh", "issue", "view"))
        self.assertFalse(self.fake.called("gh", "issue", "list"))

    def test_enqueue_creates_ready_issue(self):
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))
        self.fake.on(["gh", "issue", "create"],
                     ar.Result(0, "https://github.com/takuto277/universe/issues/42\n"))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(0, self.runner.enqueue("テストを増やす", "本文"))
        create = self.fake.find("gh", "issue", "create")[0]["argv"]
        self.assertIn("agent:ready", create)
        created = [call["argv"] for call in self.fake.find("gh", "label", "create")]
        self.assertTrue(any("agent:ready" in argv for argv in created))

    def test_commands_timeout_kills_process_group(self):
        commands = ar.Commands()
        result = commands.run(
            [sys.executable, "-c", "import time; time.sleep(5)"], timeout=1)
        self.assertTrue(result.timed_out)
        self.assertEqual(124, result.code)

    def test_propose_dry_run_does_not_start_agent(self):
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))
        self.assertEqual(0, self.runner.propose(dry_run=True))
        self.assertFalse(self.fake.called("opencode", "run"))

    def test_propose_runs_planner_in_detached_worktree(self):
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        self.fake.on(["opencode", "run"], ar.Result(0, "created", ""))
        self.assertEqual(0, self.runner.propose(dry_run=False))
        add = self.fake.find("git", "worktree", "add")[0]["argv"]
        self.assertIn("--detach", add)
        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("planner", run)
        self.assertIn("agent:proposed", run[-1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
