#!/usr/bin/env python3
"""test_agent_runner.py : agent_runner のオーケストレーションを fake で検証する

外部コマンド (gh / git / opencode) を差し替え、ネットワークなしで
キュー取得・ラベル遷移・worktree・verify・PR 作成・失敗時の後始末を確認する。
"""

import io
import json
import os
import subprocess
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

    def run(self, argv, cwd=None, timeout=None, env=None):
        argv = list(argv)
        self.calls.append({"argv": argv, "cwd": cwd, "timeout": timeout, "env": env})
        for prefix, result, effect in self.handlers:
            if argv[:len(prefix)] == prefix:
                if effect:
                    effect(argv, cwd)
                if callable(result):
                    return result(argv)
                return result if result is not None else ar.Result(0, "", "")
        return self.default

    def find(self, *prefix):
        return [call for call in self.calls
                if call["argv"][:len(prefix)] == list(prefix)]

    def called(self, *prefix):
        return bool(self.find(*prefix))


def make_worktree(argv, cwd=None):
    index = argv.index("add")
    rest = argv[index + 1:]
    if rest and rest[0] in ("-b", "-B"):
        path = rest[2]
    elif rest and rest[0] == "--detach":
        path = rest[1]
    else:
        path = rest[0]
    target = Path(path)
    if not target.is_absolute():
        target = Path(cwd or ".") / target
    target.mkdir(parents=True, exist_ok=True)


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
        self.worktree = self.cfg.state_dir / "worktrees" / "issue-12"
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

    def prs(self, open_prs=None, all_prs=None):
        open_prs = open_prs or []
        all_prs = all_prs if all_prs is not None else open_prs

        def handler(argv):
            state = argv[argv.index("--state") + 1]
            items = open_prs if state == "open" else all_prs
            return ar.Result(0, json.dumps(items), "")

        self.fake.on(["gh", "pr", "list"], handler)

    def happy(self, **overrides):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.ready_queue()
        self.fake.on(["gh", "issue", "view"], ar.Result(0, json.dumps(self.issue), ""))
        self.prs(overrides.get("open_prs"), overrides.get("all_prs"))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        dirty = overrides.get("status", "")
        post_dirty = overrides.get("status_after_verify", "")
        status_calls = {"count": 0}

        def status_handler(argv):
            status_calls["count"] += 1
            if dirty and status_calls["count"] == 1:
                return ar.Result(0, dirty, "")
            if post_dirty and status_calls["count"] >= 2:
                return ar.Result(0, post_dirty, "")
            return ar.Result(0, "", "")

        self.fake.on(["git", "status", "--porcelain"], status_handler)
        self.fake.on(["git", "rev-list"],
                     ar.Result(0, overrides.get("commits", "1\n"), ""))
        self.fake.on(["git", "rev-parse", "origin/main"], ar.Result(0, "basesha\n", ""))
        self.fake.on(["git", "diff", "--name-status"],
                     ar.Result(0, overrides.get("changed", ""), ""))
        self.fake.on(["bash"], overrides.get("verify", ar.Result(0, "ok", "")))
        self.fake.on(["git", "push"], overrides.get("push", ar.Result(0)))
        self.fake.on(["gh", "pr", "create"], overrides.get(
            "create", ar.Result(0, "https://github.com/takuto277/universe/pull/99\n")))
        self.fake.on(["opencode", "run"],
                     overrides.get("agent", ar.Result(0, "done", "")))
        self.fake.on(["gh", "issue", "edit"], overrides.get("edit", ar.Result(0)))
        self.fake.on(["gh", "issue", "comment"], ar.Result(0))
        return self.worktree

    # ---- tests ----
    def test_no_args_prints_quick_guide(self):
        env = dict(os.environ)
        env.update({
            "GH_BIN": "/nonexistent/gh",
            "GIT_BIN": "/nonexistent/git",
            "OPENCODE_BIN": "/nonexistent/opencode",
            "UNIVERSE_AGENT_STATE_DIR": str(self.cfg.state_dir),
        })
        result = subprocess.run([sys.executable, str(Path(ar.__file__))],
                                capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(0, result.returncode)
        self.assertIn("enqueue", result.stdout)
        self.assertIn("status", result.stdout)
        self.assertEqual("", result.stderr.strip())

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
        self.assertIn("-B", add)

        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("--agent", run)
        self.assertIn("builder", run)
        prompt = run[-1]
        self.assertIn("Issue #12", prompt)
        self.assertIn("janken-game: CPUのクセを追加", prompt)
        self.assertIn("verify.sh", prompt)
        self.assertIn("push", prompt)
        self.assertIn("git commit -m", prompt)
        self.assertNotIn("-c user.name", prompt)

        verify = self.fake.find("bash")
        self.assertTrue(verify)
        verify_script = verify[0]["argv"][1]
        self.assertEqual(str(self.worktree / "tools" / "verify.sh"), verify_script)
        self.assertEqual(str(self.worktree), verify[0]["cwd"])

        self.assertFalse(self.fake.called("git", "config"))
        diff = [call["argv"] for call in self.fake.find("git", "diff", "--name-status")]
        self.assertTrue(diff)
        self.assertIn("--no-renames", diff[0])
        self.assertIn("-z", diff[0])
        self.assertIn("basesha..HEAD", diff[0])
        env = self.fake.find("opencode", "run")[0]["env"]
        self.assertEqual("takuto277", env["GIT_AUTHOR_NAME"])
        self.assertEqual("takuto277@users.noreply.github.com", env["GIT_COMMITTER_EMAIL"])

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

    def test_file_changed_during_verify_marks_failed(self):
        self.happy(verify=ar.Result(0, "ok", ""),
                   status_after_verify=" M tools/check_site.py\n")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_verify_failure_comment_has_no_raw_output(self):
        self.happy(verify=ar.Result(1, "NG: link leaked=/secret", ""))
        self.assertEqual(1, self.runner.run_once())
        comments = [call["argv"][-1] for call in self.fake.find("gh", "issue", "comment")]
        self.assertTrue(comments)
        self.assertFalse(any("leaked=/secret" in body for body in comments))
        logs = "".join(path.read_text(encoding="utf-8")
                       for path in (self.cfg.state_dir / "logs").glob("issue-12-*.log"))
        self.assertIn("leaked=/secret", logs)

    def test_verify_timeout_marks_failed(self):
        self.happy(verify=ar.Result(124, "", "", timed_out=True))
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_agent_timeout_marks_failed(self):
        self.happy(agent=ar.Result(124, "", "", timed_out=True))
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_agent_failure_marks_failed(self):
        self.happy(agent=ar.Result(2, "", "boom"))
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_push_failure_marks_failed(self):
        self.happy(push=ar.Result(1, "", "rejected"))
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_pr_create_failure_marks_failed(self):
        self.happy(create=ar.Result(1, "", "no permission"))
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(any("agent:done" in argv for argv in edits))

    def test_no_commits_marks_failed(self):
        self.happy(commits="0\n")
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_label_claim_failure_stops_before_worktree(self):
        def edit(argv):
            if "agent:running" in argv:
                return ar.Result(1, "", "label error")
            return ar.Result(0)

        self.happy(edit=edit)
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "worktree", "add"))
        self.assertFalse(self.fake.called("opencode", "run"))

    def test_existing_open_pr_is_skipped(self):
        self.happy(open_prs=[{"number": 5, "state": "OPEN",
                              "url": "https://github.com/takuto277/universe/pull/5"}])
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "worktree", "add"))
        self.assertFalse(self.fake.called("opencode", "run"))
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:done" in argv for argv in edits))
        self.assertTrue(any("agent:failed" in argv for argv in edits))

    def test_existing_merged_pr_is_skipped(self):
        self.happy(all_prs=[{"number": 5, "state": "MERGED",
                             "url": "https://github.com/takuto277/universe/pull/5"}])
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_closed_pr_is_retried_after_deleting_branch(self):
        attempts = {"count": 0}

        def push(argv):
            attempts["count"] += 1
            if attempts["count"] == 1:
                return ar.Result(1, "", "! [rejected] agent/issue-12 (non-fast-forward)")
            return ar.Result(0)

        self.happy(all_prs=[{"number": 5, "state": "CLOSED",
                             "url": "https://github.com/takuto277/universe/pull/5"}],
                   push=push)
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.fake.called("git", "worktree", "add"))
        deletes = [call["argv"] for call in self.fake.find("git", "push", "origin", "--delete")]
        self.assertTrue(deletes)
        self.assertTrue(self.fake.called("gh", "pr", "create"))

    def test_gh_failure_while_checking_prs_marks_failed_without_branch_deletion(self):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.ready_queue()
        self.fake.on(["gh", "pr", "list"], ar.Result(1, "", "rate limited"))
        self.fake.on(["gh", "issue", "edit"], ar.Result(0))
        self.fake.on(["gh", "issue", "comment"], ar.Result(0))
        self.assertEqual(1, self.runner.run_once())
        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(self.fake.called("git", "worktree", "add"))
        self.assertFalse(self.fake.called("git", "push"))

    def test_modified_verify_script_is_rejected(self):
        self.happy(changed="M\0tools/verify.sh\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("bash"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_modified_ci_workflow_is_rejected(self):
        self.happy(changed="M\0.github/workflows/ci.yml\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_modified_agent_runner_is_rejected(self):
        self.happy(changed="M\0tools/agent_runner.py\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("bash"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_new_module_under_tools_is_rejected(self):
        self.happy(changed="A\0tools/json.py\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("bash"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_non_ascii_workflow_path_is_rejected(self):
        self.happy(changed="A\0.github/workflows/\u60aa\u610f.yml\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_renamed_protected_file_is_rejected(self):
        self.happy(changed="D\0tools/harness.js\0A\0tools/harness.js.bak\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_modified_pr_gate_is_rejected(self):
        self.happy(changed="D\0tools/pr_gate.py\0")
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_dirty_tree_is_committed_before_push(self):
        self.happy(status=" M apps.json\n")
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.fake.called("git", "add", "-A"))
        self.assertTrue(self.fake.called("git", "-c", "user.name=takuto277"))

    def test_dirty_tree_commit_failure_marks_failed(self):
        def git_commit(argv, cwd=None):
            return ar.Result(1, "", "hook rejected")

        self.happy(status=" M apps.json\n")
        self.fake.on(["git", "-c", "user.name=takuto277"], git_commit)
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_pause_skips_all_work(self):
        (self.cfg.state_dir / "pause").touch()
        self.ready_queue()
        self.assertEqual(0, self.runner.run_once())
        self.assertFalse(self.fake.called("gh", "issue", "list"))

    def test_dry_run_does_not_create_labels(self):
        self.fake.on(["gh", "issue", "list"],
                     ar.Result(0, json.dumps([self.issue]), ""))
        self.assertEqual(0, self.runner.run_once(dry_run=True))
        self.assertFalse(self.fake.called("gh", "label", "create"))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_lock_is_exclusive_until_released(self):
        first = ar.Lock(self.cfg.state_dir)
        self.assertTrue(first.acquire())
        self.assertTrue(first.held())
        second = ar.Lock(self.cfg.state_dir)
        self.assertFalse(second.acquire())
        first.release()
        third = ar.Lock(self.cfg.state_dir)
        self.assertTrue(third.acquire())
        third.release()
        self.assertFalse(ar.Lock(self.cfg.state_dir).held())

    def test_lock_directory_without_markers_is_not_touched(self):
        other = self.cfg.state_dir / "lock"
        other.mkdir(parents=True)
        (other / "notes.txt").write_text("do not delete")
        lock = ar.Lock(self.cfg.state_dir)
        self.assertFalse(lock.acquire())
        self.assertTrue(lock.error)
        self.assertTrue((other / "notes.txt").exists())

    def test_skip_does_not_remove_existing_worktree(self):
        self.happy(open_prs=[{"number": 5, "state": "OPEN",
                              "url": "https://github.com/takuto277/universe/pull/5"}])
        self.worktree.mkdir(parents=True, exist_ok=True)
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.worktree.exists())
        self.assertFalse(self.fake.called("git", "worktree", "remove"))

    def test_lock_migrates_old_mkdir_lock(self):
        old = self.cfg.state_dir / "lock"
        old.mkdir(parents=True)
        (old / "pid").write_text("999999")
        lock = ar.Lock(self.cfg.state_dir)
        self.assertTrue(lock.acquire())
        self.assertTrue((self.cfg.state_dir / "lock").is_file())
        lock.release()

    def test_push_rejected_as_non_fast_forward_is_rebuilt(self):
        attempts = {"count": 0}

        def push(argv):
            attempts["count"] += 1
            if attempts["count"] == 1:
                return ar.Result(1, "", "! [rejected] agent/issue-12 (non-fast-forward)")
            return ar.Result(0)

        self.happy(push=push)
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.fake.called("git", "push", "origin", "--delete", "agent/issue-12"))
        self.assertTrue(self.fake.called("gh", "pr", "create"))

    def test_pause_before_push_stops_publication(self):
        def verify(argv, cwd=None):
            (self.cfg.state_dir / "pause").touch()
            return ar.Result(0, "ok", "")

        self.happy(verify=verify)
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "push"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

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

    def test_promote_reports_failure(self):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.fake.on(["gh", "issue", "edit"], ar.Result(1, "", "denied"))
        self.assertEqual(1, self.runner.promote(42))
        self.assertFalse(self.fake.called("gh", "issue", "comment"))

    def test_commands_env_is_merged(self):
        commands = ar.Commands(env={"BASE_VAR": "base"})
        result = commands.run(
            [sys.executable, "-c", "import os; print(os.environ['BASE_VAR'], os.environ['EXTRA_VAR'])"],
            env={"EXTRA_VAR": "extra"})
        self.assertTrue(result.ok)
        self.assertEqual("base extra", result.stdout.strip())

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
        self.assertFalse(self.fake.called("gh", "label", "create"))

    def test_propose_runs_planner_in_detached_worktree(self):
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": name} for name in ar.LABELS]), ""))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        self.fake.on(["opencode", "run"], ar.Result(0, "created", ""))
        self.assertEqual(0, self.runner.propose(dry_run=False))
        add = self.fake.find("git", "worktree", "add")[0]["argv"]
        self.assertIn("--detach", add)
        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("planner", run)
        self.assertIn("agent:proposed", run[-1])
        logs = list((self.cfg.state_dir / "logs").glob("planner-*.log"))
        self.assertTrue(logs)
        self.assertIn("created", logs[0].read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
