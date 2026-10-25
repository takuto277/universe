#!/usr/bin/env python3
"""test_agent_runner.py : agent_runner のオーケストレーションを fake で検証する

外部コマンド (gh / git / opencode) を差し替え、ネットワークなしで
キュー取得・ラベル遷移・worktree・verify・PR 作成・失敗時の後始末を確認する。
"""

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from contextlib import redirect_stdout
from dataclasses import replace
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
        git_dir_calls = {"count": 0}

        def git_dir_handler(argv):
            git_dir_calls["count"] += 1
            if overrides.get("git_dir_change") and git_dir_calls["count"] > 1:
                return ar.Result(0, "/other/git/dir\n", "")
            return ar.Result(0, "/tmp/fake-git-dir\n", "")

        self.fake.on(["git", "rev-parse", "--absolute-git-dir"], git_dir_handler)
        self.fake.on(["git", "diff", "--name-status"],
                     ar.Result(0, overrides.get("changed", ""), ""))
        self.fake.on(["bash"], overrides.get("verify", ar.Result(0, "ok", "")))
        self.fake.on(["git", "-c", "core.hooksPath=/dev/null", "push"],
                     overrides.get("push", ar.Result(0)))
        self.fake.on(["gh", "pr", "create"], overrides.get(
            "create", ar.Result(0, "https://github.com/takuto277/universe/pull/99\n")))
        self.fake.on(["opencode", "run"],
                     overrides.get("agent", ar.Result(0, "done", "")))
        self.fake.on(["gh", "issue", "edit"], overrides.get("edit", ar.Result(0)))
        self.fake.on(["gh", "issue", "comment"], ar.Result(0))
        return self.worktree

    def pushes(self):
        return [call for call in self.fake.calls if "push" in call["argv"]]

    # ---- tests ----
    def history(self):
        path = self.cfg.state_dir / "history.jsonl"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def test_success_records_history_and_notifies(self):
        self.happy()
        self.assertEqual(0, self.runner.run_once())
        items = self.history()
        self.assertEqual(1, len(items))
        self.assertEqual("implement", items[0]["kind"])
        self.assertEqual("success", items[0]["result"])
        self.assertEqual(12, items[0]["issue"])
        self.assertIn("pull/99", items[0]["pr"])
        self.assertIn("duration", items[0])
        self.assertTrue(self.fake.called("osascript", "-e"))
        message = self.fake.find("osascript", "-e")[0]["argv"][2]
        self.assertIn("Issue #12", message)

    def test_failure_records_history_and_notifies(self):
        self.happy(verify=ar.Result(1, "NG", ""))
        self.assertEqual(1, self.runner.run_once())
        items = self.history()
        self.assertEqual("failed", items[-1]["result"])
        self.assertEqual(12, items[-1]["issue"])
        self.assertTrue(self.fake.called("osascript", "-e"))

    def test_notify_can_be_disabled(self):
        cfg = replace(self.cfg, notify=False)
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        self.happy()
        runner.cfg = cfg
        self.assertEqual(0, runner.run_once())
        self.assertFalse(self.fake.called("osascript", "-e"))
        self.assertTrue(self.history())

    def test_stalled_is_not_marked_when_notifications_disabled(self):
        cfg = replace(self.cfg, notify=False)
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        marker = self.cfg.state_dir / "running" / "issue-12.json"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps({"started": __import__("time").time() - 7200,
                                      "notified": False}), encoding="utf-8")
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))

        def issue_list(argv):
            label = argv[argv.index("--label") + 1]
            items = [self.issue] if label == "agent:running" else []
            return ar.Result(0, json.dumps(items), "")

        self.fake.on(["gh", "issue", "list"], issue_list)
        self.assertEqual(0, runner.run_once())
        self.assertFalse(self.fake.called("osascript", "-e"))
        self.assertFalse(json.loads(marker.read_text(encoding="utf-8"))["notified"])

    def test_stalled_issue_is_notified_once(self):
        marker = self.cfg.state_dir / "running" / "issue-12.json"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps({"started": __import__("time").time() - 7200,
                                      "notified": False}), encoding="utf-8")
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))

        def issue_list(argv):
            label = argv[argv.index("--label") + 1]
            items = [self.issue] if label == "agent:running" else []
            return ar.Result(0, json.dumps(items), "")

        self.fake.on(["gh", "issue", "list"], issue_list)
        self.assertEqual(0, self.runner.run_once())
        calls = self.fake.find("osascript", "-e")
        self.assertEqual(1, len(calls))
        self.assertIn("running", calls[0]["argv"][2])
        self.assertTrue(json.loads(marker.read_text(encoding="utf-8"))["notified"])
        self.assertEqual(0, self.runner.run_once())
        self.assertEqual(1, len(self.fake.find("osascript", "-e")))

    def test_status_shows_recent_runs(self):
        self.runner.record_history({"kind": "implement", "issue": 42,
                                    "result": "success", "duration": 12.3,
                                    "model": "opencode/deepseek-v4.1-flash-free",
                                    "changed": 3,
                                    "pr": "https://example.com/pull/42"})
        out = io.StringIO()
        with redirect_stdout(out):
            self.runner.status()
        text = out.getvalue()
        self.assertIn("recent runs", text)
        self.assertIn("#42", text)
        self.assertIn("12.3s", text)
        self.assertIn("3 files", text)
        self.assertIn("deepseek-v4.1-flash-free", text)

    def test_recent_history_skips_non_objects(self):
        path = self.runner.history_path()
        path.write_text('null\n[1]\n{"issue": 7, "result": "success"}\n',
                        encoding="utf-8")
        items = self.runner.recent_history()
        self.assertEqual(1, len(items))
        self.assertEqual(7, items[0]["issue"])

    def test_oversized_log_is_trimmed(self):
        logs = self.cfg.state_dir / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        big = logs / "issue-1-big.log"
        big.write_bytes(b"x" * (ar.LOG_MAX_BYTES + 1024))
        self.runner.cleanup_old_files()
        self.assertLess(big.stat().st_size, ar.LOG_MAX_BYTES)
        self.assertIn(b"[truncated", big.read_bytes()[:64])

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
        self.assertIn("runner が行う", prompt)
        self.assertIn("git commit", prompt)
        self.assertNotIn("git commit -m", prompt)

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

        self.assertTrue(any("agent/issue-12" in call["argv"] for call in self.pushes()))
        self.assertTrue(self.fake.called("gh", "pr", "create"))

        comments = [call["argv"][-1] for call in self.fake.find("gh", "issue", "comment")]
        self.assertTrue(any("pull/99" in body for body in comments))

    def test_verify_failure_marks_failed_without_pr(self):
        self.happy(verify=ar.Result(1, "NG: link", ""))
        self.assertEqual(1, self.runner.run_once())

        edits = [call["argv"] for call in self.fake.find("gh", "issue", "edit")]
        self.assertTrue(any("agent:failed" in argv for argv in edits))
        self.assertFalse(any("agent/issue-12" in call["argv"] for call in self.pushes()))
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
        self.assertTrue(any("--delete" in call["argv"] for call in self.pushes()))
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
        self.assertFalse(self.pushes())

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

    def test_changed_git_dir_is_rejected(self):
        self.happy(git_dir_change=True)
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.fake.called("git", "add", "-A"))
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_dirty_tree_is_committed_before_push(self):
        self.happy(status=" M apps.json\n")
        self.assertEqual(0, self.runner.run_once())
        self.assertTrue(self.fake.called("git", "add", "-A"))
        commits = [call for call in self.fake.calls if "commit" in call["argv"]]
        self.assertTrue(commits)
        self.assertTrue(any("user.name=takuto277" in call["argv"] for call in commits))

    def test_dirty_tree_commit_failure_marks_failed(self):
        def git_commit(argv, cwd=None):
            return ar.Result(1, "", "hook rejected")

        self.happy(status=" M apps.json\n")
        self.fake.on(["git", "-c", "core.hooksPath=/dev/null",
                      "-c", "core.fsmonitor=false",
                      "-c", "user.name=takuto277"], git_commit)
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
        self.assertTrue(any("--delete" in call["argv"] and "agent/issue-12" in call["argv"]
                            for call in self.pushes()))
        self.assertTrue(self.fake.called("gh", "pr", "create"))

    def test_pause_before_push_stops_publication(self):
        def verify(argv, cwd=None):
            (self.cfg.state_dir / "pause").touch()
            return ar.Result(0, "ok", "")

        self.happy(verify=verify)
        self.assertEqual(1, self.runner.run_once())
        self.assertFalse(self.pushes())
        self.assertFalse(self.fake.called("gh", "pr", "create"))

    def test_explicit_issue_uses_view_not_queue(self):
        self.happy()
        self.assertEqual(0, self.runner.run_once(issue_number=12))
        self.assertTrue(self.fake.called("gh", "issue", "view"))
        ready_calls = [call for call in self.fake.find("gh", "issue", "list")
                       if "agent:ready" in call["argv"]]
        self.assertFalse(ready_calls)

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

    def fix_happy(self, **overrides):
        pr = {
            "number": 12, "title": "test: 修正対象", "state": "OPEN",
            "isDraft": False, "headRefName": "feat/fix-me",
            "headRefOid": "abc123def456", "baseRefName": "main",
            "url": "https://github.com/takuto277/universe/pull/12",
            "labels": overrides.get("labels", []),
            "headRepositoryOwner": {"login": "takuto277"},
            "headRepository": {"name": "universe"},
        }
        marker = ('<!-- ai-pr-review {"version":1,"head":"abc123def456",'
                  '"blockers":1,"findings":1,"reviewer":"opencode"} -->')
        review_body = marker + "\n\n**Blocker: 1件**\n\n- リンクを直す"
        login = overrides.get("review_login", "takuto277")
        review = {"user": {"login": login}, "state": "COMMENTED",
                  "commit_id": overrides.get("review_commit", "abc123def456"),
                  "body": review_body}
        self.fake.on(["gh", "label", "list"],
                     ar.Result(0, json.dumps([{"name": n} for n in ar.LABELS]), ""))
        self.fake.on(["gh", "pr", "view"], ar.Result(0, json.dumps(pr), ""))
        self.fake.on(["gh", "api", "user"], ar.Result(0, "takuto277\n", ""))
        reviews = overrides.get("reviews", [review])
        self.fake.on(
            ["gh", "api", "repos/takuto277/universe/pulls/12/reviews"],
            ar.Result(0, "\n".join(json.dumps(r) for r in reviews) + "\n", ""))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        self.fake.on(["git", "fetch"], ar.Result(0))
        self.fake.on(["git", "rev-parse", "FETCH_HEAD"], ar.Result(0, "abc123def456\n"))
        self.fake.on(["git", "merge-base"], ar.Result(0, "basesha\n"))
        self.fake.on(["git", "rev-parse", "--absolute-git-dir"],
                     ar.Result(0, "/tmp/fake-git-dir\n"))
        self.fake.on(["git", "status", "--porcelain"], ar.Result(0, ""))
        git_dir_calls = {"count": 0}

        def git_dir_handler(argv):
            git_dir_calls["count"] += 1
            if overrides.get("git_dir_change") and git_dir_calls["count"] > 1:
                return ar.Result(0, "/other/git/dir\n", "")
            return ar.Result(0, "/tmp/fake-git-dir\n", "")

        self.fake.on(["git", "rev-parse", "--absolute-git-dir"], git_dir_handler)
        self.fake.on(["git", "diff", "--name-status"],
                     ar.Result(0, overrides.get("changed", "M\0docs/README.md\0"), ""))
        self.fake.on(["git", "rev-list"],
                     ar.Result(0, overrides.get("commits", "1\n"), ""))
        self.fake.on(["bash"], overrides.get("verify", ar.Result(0, "ok", "")))
        self.fake.on(["git", "-c", "core.hooksPath=/dev/null", "push"],
                     overrides.get("push", ar.Result(0)))
        self.fake.on(["git", "rev-parse", "--short"], ar.Result(0, "newsha\n"))
        self.fake.on(["opencode", "run"], overrides.get("agent", ar.Result(0, "fixed", "")))
        self.fake.on(["gh", "pr", "comment"], ar.Result(0))
        self.fake.on(["gh", "pr", "edit"], ar.Result(0))
        self.fake.on(["osascript", "-e"], ar.Result(0))
        return pr

    def test_fix_dry_run_does_not_start_agent(self):
        self.fix_happy()
        self.assertEqual(0, self.runner.fix(12, dry_run=True))
        self.assertFalse(self.fake.called("opencode", "run"))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_fix_pushes_to_pr_head_and_records_history(self):
        self.fix_happy()
        self.assertEqual(0, self.runner.fix(12))
        self.assertTrue(any("HEAD:feat/fix-me" in call["argv"] for call in self.pushes()))
        comments = [call["argv"][-1] for call in self.fake.find("gh", "pr", "comment")]
        self.assertTrue(any("自動修正" in body for body in comments))
        label_calls = [call["argv"] for call in self.fake.find("gh", "pr", "edit")]
        self.assertTrue(any("agent-autofix" in argv for argv in label_calls))
        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("Blocker", run[-1])
        items = self.history()
        self.assertEqual("fix", items[-1]["kind"])
        self.assertEqual(12, items[-1]["pr_number"])
        attempts = json.loads((self.cfg.state_dir / "fix" / "pr-12.json").read_text())
        self.assertEqual(1, attempts["attempts"])

    def test_fix_without_blocker_review_is_rejected(self):
        self.fix_happy(reviews=[])
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_fix_ignores_reviews_from_other_users(self):
        self.fix_happy(review_login="attacker")
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_fix_ignores_reviews_for_other_commits(self):
        self.fix_happy(review_commit="deadbeef")
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_fix_skips_paused_labels_and_forks(self):
        self.fix_happy(labels=[{"name": "ai-pause"}])
        self.assertEqual(2, self.runner.fix(12))
        self.assertFalse(self.fake.called("git", "worktree", "add"))

    def test_fix_without_changes_fails(self):
        self.fix_happy(commits="0\n")
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.pushes())

    def test_fix_respects_attempt_limit(self):
        path = self.cfg.state_dir / "fix" / "pr-12.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"attempts": 3}), encoding="utf-8")
        self.fix_happy()
        self.assertEqual(3, self.runner.fix(12))
        self.assertFalse(self.fake.called("opencode", "run"))

    def test_fix_rejects_protected_changes(self):
        self.fix_happy(changed="M\0tools/agent_runner.py\0")
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.pushes())
        comments = [call["argv"][-1] for call in self.fake.find("gh", "pr", "comment")]
        self.assertTrue(any("失敗" in body for body in comments))

    def test_fix_verify_failure_does_not_push(self):
        self.fix_happy(verify=ar.Result(1, "NG", ""))
        self.assertEqual(1, self.runner.fix(12))
        self.assertFalse(self.pushes())

    def test_fix_skips_when_paused(self):
        (self.cfg.state_dir / "pause").touch()
        self.fix_happy()
        self.assertEqual(2, self.runner.fix(12))
        self.assertFalse(self.fake.called("gh", "pr", "view"))

    def test_sandbox_none_keeps_command(self):
        self.assertEqual(["opencode", "--version"],
                         self.runner.sandbox_argv(["opencode", "--version"], self.worktree))

    @unittest.skipUnless(shutil.which("sandbox-exec"), "sandbox-exec is macOS only")
    def test_sandbox_wraps_commands_and_profile(self):
        cfg = replace(self.cfg, sandbox="seatbelt")
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        argv = runner.sandbox_argv(["opencode", "--version"], self.worktree)
        self.assertEqual("sandbox-exec", Path(argv[0]).name)
        self.assertIn("-f", argv)
        profile = Path(argv[argv.index("-f") + 1]).read_text(encoding="utf-8")
        self.assertIn(str(self.worktree), profile)
        self.assertIn(".ssh", profile)
        self.assertIn("(deny default)", profile)
        self.assertNotIn('(subpath "%s")' % self.cfg.state_dir, profile)
        self.assertNotIn('(subpath "%s/.git")' % self.cfg.root, profile)
        self.assertIn('(subpath \"%s/.git\")' % self.worktree, profile)

    @unittest.skipIf(os.environ.get("UNIVERSE_AGENT_IN_SANDBOX") == "1",
                     "already inside sandbox-exec")
    @unittest.skipUnless(shutil.which("sandbox-exec"), "sandbox-exec is macOS only")
    def test_sandbox_denies_writes_outside_worktree(self):
        cfg = replace(self.cfg, sandbox="seatbelt")
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        self.worktree.mkdir(parents=True, exist_ok=True)
        tmpdir = Path(tempfile.mkdtemp(prefix="sb-test-"))
        try:
            allowed = self.worktree / "ok.txt"
            result = ar.Commands().run(
                runner.sandbox_argv(["/bin/sh", "-c", "echo ok > %s" % allowed],
                                    self.worktree, tmpdir),
                cwd=str(self.worktree), timeout=30)
            self.assertTrue(result.ok)
            denied = Path.home() / ("universe-sandbox-test-%d" % os.getpid())
            try:
                result = ar.Commands().run(
                    runner.sandbox_argv(["/bin/sh", "-c", "echo no > %s" % denied],
                                        self.worktree, tmpdir),
                    cwd=str(self.worktree), timeout=30)
                self.assertFalse(result.ok)
                self.assertFalse(denied.exists())
            finally:
                try:
                    denied.unlink()
                except OSError:
                    pass
            state_file = self.cfg.state_dir / "pause"
            result = ar.Commands().run(
                runner.sandbox_argv(["/bin/sh", "-c", "touch %s" % state_file],
                                    self.worktree, tmpdir),
                cwd=str(self.worktree), timeout=30)
            self.assertFalse(result.ok)
            self.assertFalse(state_file.exists())
            pointer = self.worktree / ".git"
            pointer.write_text("gitdir: /tmp/hijacked\n", encoding="utf-8")
            result = ar.Commands().run(
                runner.sandbox_argv(["/bin/sh", "-c", "echo bad > .git"],
                                    self.worktree, tmpdir),
                cwd=str(self.worktree), timeout=30)
            self.assertFalse(result.ok)
            self.assertEqual("gitdir: /tmp/hijacked\n",
                             pointer.read_text(encoding="utf-8"))
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    @unittest.skipIf(os.environ.get("UNIVERSE_AGENT_IN_SANDBOX") == "1",
                     "already inside sandbox-exec")
    @unittest.skipUnless(shutil.which("sandbox-exec"), "sandbox-exec is macOS only")
    def test_sandbox_allows_mktemp(self):
        cfg = replace(self.cfg, sandbox="seatbelt")
        runner = ar.Runner(cfg, cmd=ar.Commands(), log=lambda line: None)
        self.worktree.mkdir(parents=True, exist_ok=True)
        result = runner._run_sandboxed(
            ["/bin/bash", "-c",
             'd=$(mktemp -d "${TMPDIR}/universe-test.XXXXXXXXXX") || exit 1;'
             'test -d "$d" && echo "$d"'],
            self.worktree, self.worktree, 30)
        self.assertTrue(result.ok, result.stderr)
        text = result.stdout.strip()
        self.assertTrue(text, "mktemp がパスを返しませんでした")
        created = Path(text)
        self.assertTrue(str(created.parent.resolve()).startswith(
            str(Path(tempfile.gettempdir()).resolve())))

    @unittest.skipIf(os.environ.get("UNIVERSE_AGENT_IN_SANDBOX") == "1",
                     "already inside sandbox-exec")
    @unittest.skipUnless(shutil.which("sandbox-exec"), "sandbox-exec is macOS only")
    def test_sandbox_denies_reading_ssh(self):
        fake_home = Path(tempfile.mkdtemp(prefix="sb-home-"))
        (fake_home / ".ssh").mkdir()
        secret = fake_home / ".ssh" / "id_rsa"
        secret.write_text("secret", encoding="utf-8")
        tmpdir = Path(tempfile.mkdtemp(prefix="sb-test-"))
        try:
            with mock.patch("pathlib.Path.home", return_value=fake_home):
                cfg = replace(self.cfg, sandbox="seatbelt")
                runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
                self.worktree.mkdir(parents=True, exist_ok=True)
                result = ar.Commands().run(
                    runner.sandbox_argv(["/bin/cat", str(secret)],
                                        self.worktree, tmpdir),
                    cwd=str(self.worktree), timeout=30)
                self.assertFalse(result.ok)
        finally:
            shutil.rmtree(fake_home, ignore_errors=True)
            shutil.rmtree(tmpdir, ignore_errors=True)

    @unittest.skipUnless(shutil.which("sandbox-exec"), "sandbox-exec is macOS only")
    def test_run_wraps_agent_and_verify(self):
        cfg = replace(self.cfg, sandbox="seatbelt")
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        self.happy()
        self.assertEqual(0, runner.run_once())
        run_calls = [call for call in self.fake.calls
                     if "opencode" in call["argv"] and "run" in call["argv"]]
        self.assertTrue(run_calls)
        self.assertEqual("sandbox-exec", Path(run_calls[0]["argv"][0]).name)
        verify_calls = [call for call in self.fake.calls
                        if any(str(arg).endswith("verify.sh") for arg in call["argv"])]
        self.assertTrue(verify_calls)
        self.assertEqual("sandbox-exec", Path(verify_calls[0]["argv"][0]).name)

    def findings_happy(self, body, existing=(), state="MERGED"):
        pr = {"number": 33, "title": "demo", "headRefOid": "abc123",
              "url": "https://github.com/takuto277/universe/pull/33",
              "state": state}
        marker = ('<!-- ai-pr-review {"version":1,"head":"abc123","blockers":0,'
                  '"findings":3,"reviewer":"opencode"} -->')
        review = {"user": {"login": "takuto277"}, "state": "COMMENTED",
                  "commit_id": "abc123", "id": 1,
                  "html_url": "https://github.com/takuto277/universe/pull/33#review",
                  "body": marker + "\n" + body}
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))
        self.fake.on(["gh", "pr", "view"], ar.Result(0, json.dumps(pr), ""))
        self.fake.on(["gh", "api", "user"], ar.Result(0, "takuto277\n", ""))
        self.fake.on(["gh", "api", "repos/takuto277/universe/pulls/33/reviews"],
                     ar.Result(0, json.dumps(review) + "\n", ""))
        self.fake.on(["gh", "issue", "list"], ar.Result(0, json.dumps(
            [{"number": index + 1, "body": body} for index, body in enumerate(existing)]), ""))
        self.fake.on(["gh", "issue", "create"],
                     ar.Result(0, "https://github.com/takuto277/universe/issues/99\n"))

    def test_parse_findings_considers_only(self):
        body = ("**Blocker: 0件**\n\n### Consider\n- A\n- B\n\n"
                "### Nit\n- C\n\n### FYI\n- D")
        items = self.runner.parse_findings(body)
        self.assertEqual(["Consider", "Consider"], [item["type"] for item in items])
        self.assertEqual(["A", "B"], [item["text"] for item in items])

    def test_parse_findings_accepts_bold_labels(self):
        items = self.runner.parse_findings("- **Nit**: N\n- **Consider**: C")
        self.assertEqual(1, len(items))
        self.assertEqual("C", items[0]["text"])

    def test_findings_creates_one_issue_with_checklist(self):
        self.findings_happy("### Consider\n- A\n- B\n### Nit\n- C")
        self.assertEqual(0, self.runner.findings(33))
        calls = self.fake.find("gh", "issue", "create")
        self.assertEqual(1, len(calls))
        argv = calls[0]["argv"]
        self.assertIn("agent:proposed", argv)
        self.assertIn("Consider 2件", argv[argv.index("--title") + 1])
        body = argv[argv.index("--body") + 1]
        self.assertIn("- [ ] A", body)
        self.assertIn("- [ ] B", body)
        self.assertNotIn("- [ ] C", body)
        self.assertIn("review-findings pr=33", body)

    def test_findings_skips_non_merged(self):
        self.findings_happy("### Consider\n- A", state="OPEN")
        self.assertEqual(0, self.runner.findings(33))
        self.assertFalse(self.fake.called("gh", "issue", "create"))

    def test_findings_deduplicates_by_pr_marker(self):
        self.findings_happy("### Consider\n- A",
                            existing=["<!-- review-findings pr=33 head=abc -->"])
        self.assertEqual(0, self.runner.findings(33))
        self.assertFalse(self.fake.called("gh", "issue", "create"))

    def test_findings_deduplicates_old_per_finding_issue(self):
        old = ("<!-- review-finding fp=abc123 -->\n"
               "- PR: https://github.com/takuto277/universe/pull/33")
        self.findings_happy("### Consider\n- A", existing=[old])
        self.assertEqual(0, self.runner.findings(33))
        self.assertFalse(self.fake.called("gh", "issue", "create"))

    def test_findings_old_issue_for_other_pr_does_not_block(self):
        old = ("<!-- review-finding fp=abc123 -->\n"
               "- PR: https://github.com/takuto277/universe/pull/330")
        self.findings_happy("### Consider\n- A", existing=[old])
        self.assertEqual(0, self.runner.findings(33))
        self.assertEqual(1, len(self.fake.find("gh", "issue", "create")))

    def test_findings_respects_limit(self):
        cfg = replace(self.cfg, findings_max=1)
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        self.findings_happy("### Consider\n- A\n- B")
        self.assertEqual(0, runner.findings(33))
        calls = self.fake.find("gh", "issue", "create")
        self.assertEqual(1, len(calls))
        body = calls[0]["argv"][calls[0]["argv"].index("--body") + 1]
        self.assertIn("- [ ] A", body)
        self.assertNotIn("- [ ] B", body)

    def test_findings_dry_run_does_not_create(self):
        self.findings_happy("### Consider\n- A")
        self.assertEqual(0, self.runner.findings(33, dry_run=True))
        self.assertFalse(self.fake.called("gh", "issue", "create"))
        self.assertFalse(self.fake.called("gh", "label", "create"))

    def test_findings_paused_returns_skip(self):
        (self.cfg.state_dir / "pause").touch()
        self.assertEqual(2, self.runner.findings(33))
        self.assertFalse(self.fake.called("gh", "pr", "view"))

    def test_findings_without_review_is_noop(self):
        self.fake.on(["gh", "pr", "view"], ar.Result(0, json.dumps({
            "number": 33, "title": "demo", "headRefOid": "abc123",
            "url": "https://example.com/pr/33", "state": "MERGED"}), ""))
        self.fake.on(["gh", "api", "user"], ar.Result(0, "takuto277\n", ""))
        self.fake.on(["gh", "api", "repos/takuto277/universe/pulls/33/reviews"],
                     ar.Result(0, "", ""))
        self.assertEqual(0, self.runner.findings(33))
        self.assertFalse(self.fake.called("gh", "issue", "create"))

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

    def test_propose_uses_planner_model(self):
        cfg = replace(self.cfg, planner_model="provider/planner-model")
        runner = ar.Runner(cfg, cmd=self.fake, log=lambda line: None)
        self.fake.on(["gh", "label", "list"], ar.Result(0, "[]"))
        self.fake.on(["gh", "label", "create"], ar.Result(0))
        self.fake.on(["git", "worktree", "add"], ar.Result(0), effect=make_worktree)
        self.fake.on(["git", "worktree", "remove"], ar.Result(0))
        self.fake.on(["opencode", "run"], ar.Result(0, "created", ""))
        self.assertEqual(0, runner.propose(dry_run=False))
        run = self.fake.find("opencode", "run")[0]["argv"]
        self.assertIn("provider/planner-model", run)
        items = self.history()
        self.assertEqual("provider/planner-model", items[-1]["model"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
