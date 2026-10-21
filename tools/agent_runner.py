#!/usr/bin/env python3
"""agent_runner.py : GitHub Issue をキューにしてエージェントを無人実行する

流れ:
  1. `agent:ready` ラベルの Issue を1件取り、`agent:running` に付け替える
  2. origin/main から専用 worktree とブランチ `agent/issue-<n>` を作る
  3. opencode の builder エージェントをタイムアウト付きで実行する
  4. 変更をコミットし、./tools/verify.sh を通して push する
  5. PR を作成し、Issue を `agent:done` にする

安全:
  - 1回1件・排他ロック・pause ファイル・環境変数で停止できる
  - main へは push しない。マージはしない(五点ゲートと watcher に任せる)
  - 失敗時は `agent:failed` とコメント、ログを残して worktree を片付ける

ラベル:
  agent:ready     実装待ち(メンテナが付ける)
  agent:running   実行中(runner が付ける)
  agent:done      実装完了・PR 作成済み
  agent:failed    失敗(理由は Issue コメントとログ)
  agent:proposed  提案(planner が作る。promote で ready にする)
  agent-generated 無人エージェントが作成した PR
"""

import argparse
import fcntl
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence

DEFAULT_REPO = "takuto277/universe"
DEFAULT_BASE = "main"
DEFAULT_MODEL = "opencode/deepseek-v4.1-flash-free"
DEFAULT_AGENT = "builder"
DEFAULT_PLANNER = "planner"
DEFAULT_TIMEOUT = 2700
DEFAULT_VERIFY_TIMEOUT = 600
LOG_RETENTION_DAYS = 14
PROTECTED_PATHS = (
    "tools/verify.sh",
    "tools/run-tests.sh",
    "tools/check_site.py",
    "tools/harness.js",
    "tools/test_agent_runner.py",
    "tools/pr_gate.py",
    "tools/pr_review.py",
    "tools/pr_merge.py",
    ".github/workflows/",
)

LABELS = {
    "agent:ready": ("0E8A16", "無人エージェントの実装キュー"),
    "agent:running": ("FBCA04", "無人エージェントが実行中"),
    "agent:done": ("1D76DB", "実装完了・PR 作成済み"),
    "agent:failed": ("B60205", "実行失敗(Issue コメント参照)"),
    "agent:proposed": ("5319E7", "改善提案(promote で実装キューへ)"),
    "agent-generated": ("BFD4F2", "無人エージェントが作成した PR"),
}


@dataclass
class Result:
    code: int
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.code == 0


def tail(text: str, limit: int = 2000) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return "..." + text[-limit:]


class TaskError(Exception):
    """実行を中止して Issue を failed にするためのエラー。"""


class Commands:
    """外部コマンド実行。テストではこのクラスを差し替える。"""

    def __init__(self, env: Optional[Dict[str, str]] = None) -> None:
        self.env = dict(os.environ if env is None else env)

    def run(self, argv: Sequence[str], cwd: Optional[str] = None,
            timeout: Optional[int] = None,
            env: Optional[Dict[str, str]] = None) -> Result:
        merged_env = self.env if not env else {**self.env, **env}
        try:
            proc = subprocess.Popen(
                list(argv),
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=merged_env,
                start_new_session=True,
            )
        except (FileNotFoundError, OSError) as exc:
            return Result(127, "", str(exc))
        try:
            out, err = proc.communicate(timeout=timeout)
            return Result(proc.returncode or 0, out or "", err or "")
        except subprocess.TimeoutExpired as exc:
            partial = exc.stdout or ""
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except OSError:
                pass
            try:
                out, err = proc.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except OSError:
                    pass
                try:
                    out, err = proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    out, err = "", ""
                    for stream in (proc.stdout, proc.stderr):
                        try:
                            stream.close()
                        except OSError:
                            pass
            return Result(124, out or partial or "", err or "", timed_out=True)


@dataclass
class Config:
    root: Path
    repo: str = DEFAULT_REPO
    base: str = DEFAULT_BASE
    state_dir: Path = Path.home() / ".local/state/universe-agent-runner"
    log_file: Path = Path.home() / "Library/Logs/universe-agent-runner.log"
    model: str = DEFAULT_MODEL
    agent: str = DEFAULT_AGENT
    planner_agent: str = DEFAULT_PLANNER
    timeout: int = DEFAULT_TIMEOUT
    verify_timeout: int = DEFAULT_VERIFY_TIMEOUT
    branch_prefix: str = "agent/"
    auto_ready_proposals: bool = False
    keep_worktree: bool = False
    gh_bin: str = "gh"
    git_bin: str = "git"
    opencode_bin: str = "opencode"

    @classmethod
    def from_env(cls, root: Path) -> "Config":
        home = Path.home()
        state = Path(os.environ.get(
            "UNIVERSE_AGENT_STATE_DIR", home / ".local/state/universe-agent-runner"))
        log = Path(os.environ.get(
            "UNIVERSE_AGENT_LOG", home / "Library/Logs/universe-agent-runner.log"))
        return cls(
            root=root,
            repo=os.environ.get("UNIVERSE_AGENT_REPO", DEFAULT_REPO),
            base=os.environ.get("UNIVERSE_AGENT_BASE", DEFAULT_BASE),
            state_dir=state,
            log_file=log,
            model=os.environ.get("UNIVERSE_AGENT_MODEL", DEFAULT_MODEL),
            agent=os.environ.get("UNIVERSE_AGENT_AGENT", DEFAULT_AGENT),
            planner_agent=os.environ.get("UNIVERSE_AGENT_PLANNER_AGENT", DEFAULT_PLANNER),
            timeout=int(os.environ.get("UNIVERSE_AGENT_TIMEOUT", DEFAULT_TIMEOUT)),
            verify_timeout=int(os.environ.get(
                "UNIVERSE_AGENT_VERIFY_TIMEOUT", DEFAULT_VERIFY_TIMEOUT)),
            branch_prefix=os.environ.get("UNIVERSE_AGENT_BRANCH_PREFIX", "agent/"),
            auto_ready_proposals=os.environ.get(
                "UNIVERSE_AGENT_AUTO_READY_PROPOSALS", "0") == "1",
            keep_worktree=os.environ.get("UNIVERSE_AGENT_KEEP_WORKTREE", "0") == "1",
            gh_bin=os.environ.get("GH_BIN", "gh"),
            git_bin=os.environ.get("GIT_BIN", "git"),
            opencode_bin=os.environ.get("OPENCODE_BIN", "opencode"),
        )


class Lock:
    """flock による排他ロック。プロセス終了時に OS が自動で解放する。"""

    def __init__(self, state_dir: Path) -> None:
        self.path = state_dir / "lock"
        self.fh = None
        self.error = ""

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_dir():
            # 旧実装 (mkdir ロック) の残骸だけを移行する
            if not ((self.path / "pid").exists() or (self.path / "token").exists()):
                self.error = "lock がディレクトリですが旧ロックの形式ではありません: %s" % self.path
                return False
            shutil.rmtree(self.path, ignore_errors=True)
            if self.path.is_dir():
                self.error = "旧ロックを削除できません: %s" % self.path
                return False
        try:
            fh = self.path.open("a+")
        except OSError as exc:
            self.error = "lock を開けません: %s" % exc
            return False
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fh.close()
            return False
        fh.seek(0)
        fh.truncate()
        fh.write(str(os.getpid()))
        fh.flush()
        self.fh = fh
        return True

    def release(self) -> None:
        if not self.fh:
            return
        try:
            fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
        finally:
            self.fh.close()
            self.fh = None

    def held(self) -> bool:
        probe = Lock(self.path.parent)
        if probe.acquire():
            probe.release()
            return False
        return probe.fh is None and self.path.exists()


class Runner:
    def __init__(self, cfg: Config, cmd: Optional[Commands] = None,
                 log: Optional[Callable[[str], None]] = None) -> None:
        self.cfg = cfg
        self.cmd = cmd or Commands()
        self._external_log = log
        self.cfg.state_dir.mkdir(parents=True, exist_ok=True)
        (self.cfg.state_dir / "logs").mkdir(exist_ok=True)
        self.cfg.log_file.parent.mkdir(parents=True, exist_ok=True)

    # ---- 基本 ----
    def log(self, message: str) -> None:
        line = "%s %s" % (time.strftime("%Y-%m-%dT%H:%M:%S%z"), message)
        try:
            with self.cfg.log_file.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass
        if self._external_log:
            self._external_log(line)
        else:
            sys.stderr.write(line + "\n")

    def gh(self, *args: str, timeout: Optional[int] = 120) -> Result:
        return self.cmd.run([self.cfg.gh_bin, *args], timeout=timeout)

    def git(self, *args: str, cwd: Optional[Path] = None,
            timeout: Optional[int] = 120) -> Result:
        return self.cmd.run(
            [self.cfg.git_bin, *args],
            cwd=str(cwd) if cwd else str(self.cfg.root),
            timeout=timeout,
        )

    def paused(self) -> bool:
        if os.environ.get("UNIVERSE_AGENT_DISABLE") == "1":
            return True
        return (self.cfg.state_dir / "pause").exists()

    # ---- GitHub ----
    def ensure_labels(self) -> None:
        result = self.gh("label", "list", "--repo", self.cfg.repo,
                         "--limit", "200", "--json", "name")
        existing = set()
        if result.ok:
            try:
                existing = {item["name"] for item in json.loads(result.stdout or "[]")}
            except (ValueError, KeyError, TypeError):
                existing = set()
        for name, (color, description) in LABELS.items():
            if name in existing:
                continue
            self.gh("label", "create", name, "--repo", self.cfg.repo,
                    "--color", color, "--description", description, "--force")

    def list_issues(self, label: str) -> List[dict]:
        result = self.gh("issue", "list", "--repo", self.cfg.repo,
                         "--state", "open", "--label", label, "--limit", "20",
                         "--json", "number,title,body,labels,url")
        if not result.ok:
            raise TaskError("Issue 一覧の取得に失敗しました: %s" % tail(result.stderr))
        try:
            issues = json.loads(result.stdout or "[]")
        except ValueError as exc:
            raise TaskError("Issue 一覧の JSON を解釈できません: %s" % exc)
        return sorted(issues, key=lambda item: item.get("number", 0))

    def view_issue(self, number: int) -> dict:
        result = self.gh("issue", "view", str(number), "--repo", self.cfg.repo,
                         "--json", "number,title,body,state,labels,url")
        if not result.ok:
            raise TaskError("Issue #%s を取得できません: %s" % (number, tail(result.stderr)))
        try:
            return json.loads(result.stdout or "{}")
        except ValueError as exc:
            raise TaskError("Issue の JSON を解釈できません: %s" % exc)

    def edit_labels(self, number: int, add: Iterable[str] = (),
                    remove: Iterable[str] = ()) -> bool:
        args = ["issue", "edit", str(number), "--repo", self.cfg.repo]
        for name in add:
            args += ["--add-label", name]
        for name in remove:
            args += ["--remove-label", name]
        if len(args) == 5:
            return True
        result = self.gh(*args)
        if not result.ok:
            self.log("label 更新に失敗 (issue #%s): %s" % (number, tail(result.stderr, 400)))
            return False
        return True

    def comment(self, number: int, body: str) -> None:
        result = self.gh("issue", "comment", str(number), "--repo", self.cfg.repo,
                         "--body", body)
        if not result.ok:
            self.log("コメントに失敗 (issue #%s): %s" % (number, tail(result.stderr, 400)))

    def find_pr(self, branch: str) -> Optional[dict]:
        for state in ("open", "all"):
            result = self.gh("pr", "list", "--repo", self.cfg.repo, "--head", branch,
                             "--state", state, "--limit", "20",
                             "--json", "number,state,url")
            if not result.ok:
                raise TaskError("PR 一覧の取得に失敗しました: %s" % tail(result.stderr))
            try:
                items = json.loads(result.stdout or "[]")
            except ValueError as exc:
                raise TaskError("PR 一覧の JSON を解釈できません: %s" % exc)
            if items:
                return items[0]
        return None

    # ---- 実行 ----
    def run_once(self, dry_run: bool = False, issue_number: Optional[int] = None,
                 verbose: bool = False) -> int:
        if self.paused():
            if verbose:
                self.log("pause 中のため何もしません")
            return 0
        if verbose:
            self.log("queue を確認します (repo=%s, base=%s)" % (self.cfg.repo, self.cfg.base))

        if dry_run:
            target = None
            if issue_number is not None:
                target = self.view_issue(issue_number)
            else:
                result = self.gh("issue", "list", "--repo", self.cfg.repo,
                                 "--state", "open", "--limit", "100",
                                 "--json", "number,title,labels")
                if not result.ok:
                    raise TaskError("Issue 一覧の取得に失敗しました: %s" % tail(result.stderr))
                try:
                    issues = json.loads(result.stdout or "[]")
                except ValueError as exc:
                    raise TaskError("Issue 一覧の JSON を解釈できません: %s" % exc)
                ready = [item for item in issues
                         if "agent:ready" in self._issue_label_names(item)]
                ready.sort(key=lambda item: item.get("number", 0))
                target = ready[0] if ready else None
            if target:
                self.log("dry-run: Issue #%s「%s」を実装します" %
                         (target.get("number"), target.get("title")))
            else:
                self.log("dry-run: agent:ready の Issue はありません")
            return 0

        self.ensure_labels()

        if issue_number is not None:
            issue = self.view_issue(issue_number)
            if (issue.get("state") or "").upper() != "OPEN":
                self.log("Issue #%s は open ではありません" % issue_number)
                return 1
        else:
            ready = self.list_issues("agent:ready")
            if not ready:
                if verbose:
                    self.log("agent:ready の Issue はありません")
                return 0
            issue = ready[0]

        number = int(issue["number"])
        title = (issue.get("title") or "").strip() or ("issue-%s" % number)
        return self.process(issue, title, verbose=verbose)

    def process(self, issue: dict, title: str, verbose: bool = False) -> int:
        cfg = self.cfg
        number = int(issue["number"])
        body = issue.get("body") or ""
        branch = "%sissue-%d" % (cfg.branch_prefix, number)
        worktree = cfg.state_dir / "worktrees" / ("issue-%d" % number)
        issue_log = cfg.state_dir / "logs" / ("issue-%d-%d.log" % (number, int(time.time())))

        self.ensure_labels()

        prepared = False
        try:
            existing = self.find_pr(branch)
            existing_state = (existing or {}).get("state", "").upper()
            if existing_state in ("OPEN", "MERGED"):
                self.log("Issue #%s: 既存 PR %s があるためスキップ" % (number, existing.get("url")))
                self.edit_labels(number, add=["agent:done"],
                                 remove=["agent:running", "agent:ready", "agent:failed"])
                self.comment(number, "既存の PR があるためスキップしました: %s" % existing.get("url"))
                return 0

            if not self.edit_labels(number, add=["agent:running"], remove=["agent:ready"]):
                raise TaskError("agent:running ラベルを付けられませんでした")
            self.comment(number, "無人エージェントが着手しました。\n対象: `%s` (%s)" %
                         (branch, cfg.base))

            base_sha = self._prepare_worktree(worktree, branch)
            prepared = True
            prompt = self.build_prompt(number, title, body)
            result = self._run_agent(prompt, worktree, issue_log, verbose)
            if result.timed_out:
                raise TaskError("エージェントがタイムアウトしました (%ss)" % cfg.timeout)
            if not result.ok:
                raise TaskError("エージェントが異常終了しました (exit=%s)" % result.code)

            self._commit_leftovers(worktree, number)
            count = self.git("rev-list", "--count", "%s..HEAD" % base_sha,
                             cwd=worktree, timeout=60)
            try:
                commits = int((count.stdout or "0").strip() or "0")
            except ValueError:
                commits = 0
            if not count.ok or commits == 0:
                raise TaskError("origin/%s からの変更がありません" % cfg.base)

            self._assert_tools_untouched(worktree, base_sha)
            verify_script = worktree / "tools" / "verify.sh"
            verify = self.cmd.run(["bash", str(verify_script)],
                                  cwd=str(worktree), timeout=cfg.verify_timeout)
            self._append_log(issue_log, "\n$ ./tools/verify.sh\n" +
                             (verify.stdout or "") + (verify.stderr or ""))
            if verify.timed_out:
                raise TaskError("verify.sh がタイムアウトしました (%ss)" % cfg.verify_timeout)
            if not verify.ok:
                raise TaskError("./tools/verify.sh が失敗しました\n```\n%s\n```" %
                                tail(verify.stdout + verify.stderr, 1200))

            if self.paused():
                raise TaskError("pause されたため push 前に中断しました")
            latest = self.find_pr(branch)
            latest_state = (latest or {}).get("state", "").upper()
            if latest_state in ("OPEN", "MERGED"):
                raise TaskError("PR が既に存在します: %s" % latest.get("url"))
            push = self.git("push", "-u", "origin", branch, cwd=worktree, timeout=180)
            if not push.ok and ("non-fast-forward" in (push.stderr or "") or
                                "rejected" in (push.stderr or "")):
                # 前回の実行が PR 作成前に落ちてブランチだけ残っている場合は作り直す
                latest = self.find_pr(branch)
                if latest and (latest.get("state") or "").upper() in ("OPEN", "MERGED"):
                    raise TaskError("PR が既に存在します: %s" % latest.get("url"))
                self.git("push", "origin", "--delete", branch, cwd=worktree, timeout=120)
                push = self.git("push", "-u", "origin", branch, cwd=worktree, timeout=180)
            if not push.ok:
                raise TaskError("push に失敗しました: %s" % tail(push.stderr, 600))

            if self.paused():
                raise TaskError("pause されたため PR 作成前に中断しました")
            url = self.create_pr(number, title, branch, issue_log)
            if not self.edit_labels(number, add=["agent:done"],
                                    remove=["agent:running", "agent:failed"]):
                self.log("Issue #%s: agent:done の付与に失敗しました" % number)
            self.comment(
                number,
                "実装が完了し、PR を作成しました: %s\n"
                "レビューとマージは五点ゲートに任せます。ログ: `%s`" % (url, issue_log),
            )
            self.log("Issue #%s: PR を作成しました %s" % (number, url))
            return 0
        except TaskError as exc:
            self._fail(number, issue_log, str(exc))
            return 1
        except Exception as exc:  # noqa: BLE001 - 無人実行を止めないため
            self._fail(number, issue_log, "予期しないエラー: %s" % exc)
            return 1
        finally:
            if prepared:
                self._cleanup_worktree(worktree)

    def _fail(self, number: int, issue_log: Path, reason: str) -> None:
        self.log("Issue #%s: 失敗 - %s" % (number, reason))
        self._append_log(issue_log, "\nFAILED: " + reason + "\n")
        self.edit_labels(number, add=["agent:failed"],
                         remove=["agent:running", "agent:ready"])
        self.comment(
            number,
            "実行に失敗しました。\n\n```\n%s\n```\n\nログ: `%s`" %
            (tail(reason, 1200), issue_log),
        )

    def _issue_label_names(self, issue: dict) -> List[str]:
        names = []
        for label in issue.get("labels") or []:
            if isinstance(label, dict):
                names.append(label.get("name") or "")
            else:
                names.append(str(label))
        return [name for name in names if name]

    def _prepare_worktree(self, worktree: Path, branch: str) -> str:
        if worktree.exists():
            self.git("worktree", "remove", "--force", str(worktree))
        self.git("worktree", "prune")
        shutil.rmtree(worktree, ignore_errors=True)
        fetched = self.git("fetch", "origin", self.cfg.base, timeout=180)
        if not fetched.ok:
            raise TaskError("origin/%s の取得に失敗しました" % self.cfg.base)
        base_ref = self.git("rev-parse", "origin/%s" % self.cfg.base, timeout=60)
        base_sha = (base_ref.stdout or "").strip()
        if not base_ref.ok or not base_sha:
            raise TaskError("origin/%s の SHA を取得できませんでした" % self.cfg.base)
        worktree.parent.mkdir(parents=True, exist_ok=True)
        added = self.git("worktree", "add", "-B", branch, str(worktree),
                         base_sha, timeout=180)
        if not added.ok:
            raise TaskError("worktree の作成に失敗しました: %s" % tail(added.stderr, 600))
        return base_sha

    def _assert_tools_untouched(self, worktree: Path, base_sha: str) -> None:
        """検証スクリプト自体を書き換えて verify を通す抜け道を塞ぐ。"""
        result = self.git("diff", "--name-status", "--no-renames",
                          "%s..HEAD" % base_sha, cwd=worktree, timeout=60)
        if not result.ok:
            raise TaskError("変更ファイルの確認に失敗しました: %s" % tail(result.stderr, 400))
        touched = set()
        for line in (result.stdout or "").splitlines():
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            path = parts[-1]
            if path in PROTECTED_PATHS or any(
                    path.startswith(prefix) for prefix in PROTECTED_PATHS
                    if prefix.endswith("/")):
                touched.add(path)
        touched = sorted(touched)
        if touched:
            raise TaskError("検証スクリプトや CI を変更しています(人間のレビューが必要): %s\n"
                            "調査するには UNIVERSE_AGENT_KEEP_WORKTREE=1 で再実行してください" %
                            ", ".join(touched))

    def _cleanup_worktree(self, worktree: Path) -> None:
        if self.cfg.keep_worktree:
            self.log("worktree を残します: %s" % worktree)
            return
        self.git("worktree", "remove", "--force", str(worktree))
        self.git("worktree", "prune")
        shutil.rmtree(worktree, ignore_errors=True)

    def build_prompt(self, number: int, title: str, body: str) -> str:
        return "\n".join([
            "あなたは universe リポジトリの無人実装エージェント(builder)です。",
            "次の GitHub Issue を実装してください。",
            "",
            "Issue #%d: %s" % (number, title),
            "",
            body.strip() or "(本文なし)",
            "",
            "---",
            "作業ルール:",
            "- カレントディレクトリは origin/%s から作った専用 worktree。ここだけを編集する" % self.cfg.base,
            "- まず AGENTS.md と、関係するアプリの README.md を読む",
            "- 変更は Issue の範囲に絞る。破壊的・不可逆な変更や判断に迷う変更はせず、最後に理由を報告する",
            "- アプリを変更したら apps.json / index.html / README / テストを同じ変更で更新する",
            "- ./tools/verify.sh を通す。失敗したら原因を直して再実行する",
            "- 変更をコミットする: git commit -m \"<アプリ名または repo>: 日本語の要約\""
            " (user.name / user.email は runner が環境変数で設定済み)",
            "- push、PR 作成、マージ、Issue のクローズはしない(runner が行う)",
            "- 最後に、変更点・テスト結果・残課題を短くまとめる",
        ])

    def _run_agent(self, prompt: str, worktree: Path, issue_log: Path,
                   verbose: bool) -> Result:
        argv = [
            self.cfg.opencode_bin, "run",
            "--agent", self.cfg.agent,
            "--model", self.cfg.model,
            "--dir", str(worktree),
            "--auto",
            "--title", "universe-agent-%d" % int(time.time()),
            prompt,
        ]
        self.log("agent を開始します (model=%s, timeout=%ss)" % (self.cfg.model, self.cfg.timeout))
        self._append_log(issue_log, "$ opencode run --agent %s --model %s\n" %
                         (self.cfg.agent, self.cfg.model))
        identity = {
            "GIT_AUTHOR_NAME": "takuto277",
            "GIT_AUTHOR_EMAIL": "takuto277@users.noreply.github.com",
            "GIT_COMMITTER_NAME": "takuto277",
            "GIT_COMMITTER_EMAIL": "takuto277@users.noreply.github.com",
        }
        result = self.cmd.run(argv, cwd=str(worktree), timeout=self.cfg.timeout,
                              env=identity)
        self._append_log(issue_log, (result.stdout or "") + (result.stderr or ""))
        self.log("agent が終了しました (exit=%s, timeout=%s)" % (result.code, result.timed_out))
        if verbose and result.stderr:
            self.log(tail(result.stderr, 400))
        return result

    def _commit_leftovers(self, worktree: Path, number: int) -> None:
        status = self.git("status", "--porcelain", cwd=worktree, timeout=60)
        if not status.ok:
            raise TaskError("git status に失敗しました: %s" % tail(status.stderr, 400))
        if not (status.stdout or "").strip():
            return
        added = self.git("add", "-A", cwd=worktree, timeout=120)
        if not added.ok:
            raise TaskError("git add に失敗しました: %s" % tail(added.stderr, 400))
        commit = self.git("-c", "user.name=takuto277",
                          "-c", "user.email=takuto277@users.noreply.github.com",
                          "commit", "-m", "repo: Issue #%d の残りの変更をコミット" % number,
                          cwd=worktree, timeout=120)
        if not commit.ok:
            raise TaskError("残りの変更をコミットできませんでした: %s" %
                            tail(commit.stderr, 600))
        after = self.git("status", "--porcelain", cwd=worktree, timeout=60)
        if not after.ok or (after.stdout or "").strip():
            raise TaskError("未コミットの変更が残っています")

    def create_pr(self, number: int, title: str, branch: str,
                  issue_log: Path) -> str:
        body = "\n".join([
            "## 概要",
            "",
            "Closes #%d" % number,
            "",
            "Issue #%d「%s」を無人エージェントが実装しました。" % (number, title),
            "",
            "## 変更したもの",
            "",
            "- [x] 実装",
            "- [x] テスト",
            "- [x] README / docs",
            "- [x] `apps.json` / `index.html`",
            "",
            "## 確認",
            "",
            "- [x] `./tools/verify.sh` が通る",
            "- [ ] AI レビューの Blocker を修正し、最新 head で再レビューを受けた",
            "",
            "## 備考",
            "",
            "`tools/agent_runner.py` による自動実行です。実行ログ: `%s`" % issue_log,
            "",
        ])
        result = self.gh("pr", "create", "--repo", self.cfg.repo,
                         "--base", self.cfg.base, "--head", branch,
                         "--title", title, "--body", body,
                         "--label", "agent-generated", timeout=180)
        if result.ok:
            lines = [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]
            return lines[-1] if lines else "(URL 不明)"
        existing = self.find_pr(branch)
        if existing and (existing.get("state") or "").upper() == "OPEN" and existing.get("url"):
            return str(existing["url"])
        raise TaskError("PR の作成に失敗しました: %s" % tail(result.stderr, 800))

    def _append_log(self, path: Path, text: str) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(text if text.endswith("\n") else text + "\n")
        except OSError:
            pass

    def cleanup_old_files(self) -> None:
        cutoff = time.time() - LOG_RETENTION_DAYS * 86400
        for path in sorted((self.cfg.state_dir / "logs").glob("*")):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
            except OSError:
                pass

    # ---- 提案 ----
    def propose(self, dry_run: bool = False) -> int:
        if self.paused():
            self.log("pause 中のため提案しません")
            return 0
        label = "agent:ready" if self.cfg.auto_ready_proposals else "agent:proposed"
        worktree = self.cfg.state_dir / "worktrees" / "planner"
        if dry_run:
            self.log("dry-run: planner を実行し、Issue を %s で作成します" % label)
            return 0
        self.ensure_labels()
        planner_log = self.cfg.state_dir / "logs" / ("planner-%d.log" % int(time.time()))
        try:
            if worktree.exists():
                self.git("worktree", "remove", "--force", str(worktree))
            shutil.rmtree(worktree, ignore_errors=True)
            self.git("fetch", "origin", self.cfg.base, timeout=180)
            added = self.git("worktree", "add", "--detach", str(worktree),
                             "origin/%s" % self.cfg.base, timeout=180)
            if not added.ok:
                raise TaskError("planner 用 worktree の作成に失敗しました")
            prompt = "\n".join([
                "あなたは universe リポジトリの改善提案エージェント(planner)です。実装はしません。",
                "docs/learning-log.md、各アプリの README.md、docs/decisions/ を読み、",
                "価値の高い改善を最大3件、GitHub Issue として作成してください。",
                "",
                "ルール:",
                "- 先に `gh issue list --repo %s --state open --limit 50 --json number,title` で重複を確認する" % self.cfg.repo,
                "- 各 Issue は「背景 / 提案 / 受け入れ条件 / 対象範囲」を含める",
                "- 1 Issue = 1 つの完結した変更にする",
                "- ラベルは `%s` を付ける" % label,
                "- コード変更、PR 作成、マージ、既存 Issue のクローズはしない",
                "- 最後に作成した Issue の番号と URL を列挙する",
            ])
            result = self.cmd.run([
                self.cfg.opencode_bin, "run",
                "--agent", self.cfg.planner_agent,
                "--model", self.cfg.model,
                "--dir", str(worktree),
                "--auto",
                "--title", "universe-planner-%d" % int(time.time()),
                prompt,
            ], cwd=str(worktree), timeout=self.cfg.timeout)
            self._append_log(planner_log, (result.stdout or "") + (result.stderr or ""))
            if result.timed_out:
                raise TaskError("planner がタイムアウトしました")
            if not result.ok:
                raise TaskError("planner が異常終了しました (exit=%s)" % result.code)
            self.log("提案を作成しました (label=%s, log=%s)" % (label, planner_log))
            return 0
        except TaskError as exc:
            self.log("提案に失敗: %s" % exc)
            return 1
        finally:
            if self.cfg.keep_worktree:
                self.log("planner の worktree を残します: %s" % worktree)
            else:
                self.git("worktree", "remove", "--force", str(worktree))
                shutil.rmtree(worktree, ignore_errors=True)

    # ---- キュー操作 ----
    def enqueue(self, title: str, body: str) -> int:
        self.ensure_labels()
        result = self.gh("issue", "create", "--repo", self.cfg.repo,
                         "--title", title, "--body", body,
                         "--label", "agent:ready", timeout=120)
        if not result.ok:
            self.log("Issue の作成に失敗: %s" % tail(result.stderr))
            return 1
        url = (result.stdout or "").strip().splitlines()
        print(url[-1] if url else "created")
        return 0

    def promote(self, number: int) -> int:
        self.ensure_labels()
        if not self.edit_labels(number, add=["agent:ready"],
                                remove=["agent:proposed", "agent:done", "agent:failed"]):
            self.log("Issue #%s を実装キューに移せませんでした" % number)
            return 1
        self.comment(number, "実装キューに追加しました。")
        return 0

    def pause(self, value: bool) -> int:
        path = self.cfg.state_dir / "pause"
        if value:
            path.touch()
            print("paused: %s" % path)
        else:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            print("resumed")
        return 0

    def status(self) -> int:
        print("repo:    %s (base %s)" % (self.cfg.repo, self.cfg.base))
        print("model:   %s / agent: %s / planner: %s" %
              (self.cfg.model, self.cfg.agent, self.cfg.planner_agent))
        print("state:   %s" % self.cfg.state_dir)
        print("log:     %s" % self.cfg.log_file)
        pause = self.cfg.state_dir / "pause"
        print("paused:  %s" % ("yes" if pause.exists() else "no"))
        lock = Lock(self.cfg.state_dir)
        if lock.held():
            try:
                pid = (self.cfg.state_dir / "lock").read_text().strip()
            except OSError:
                pid = "?"
            print("lock:    held (pid %s)" % pid)
        else:
            print("lock:    free")
        for label in ("agent:proposed", "agent:ready", "agent:running",
                      "agent:failed"):
            result = self.gh("issue", "list", "--repo", self.cfg.repo,
                             "--state", "open", "--label", label, "--limit", "100",
                             "--json", "number")
            count = "?"
            if result.ok:
                try:
                    count = str(len(json.loads(result.stdout or "[]")))
                except ValueError:
                    count = "?"
            print("%-15s %s" % (label, count))
        worktrees = self.git("worktree", "list")
        if worktrees.ok:
            print("worktrees:")
            for line in (worktrees.stdout or "").splitlines():
                print("  " + line)
        plist = Path.home() / "Library/LaunchAgents/com.takuto277.universe-agent-runner.plist"
        print("launchd: %s" % ("installed" if plist.exists() else "not installed"))
        try:
            lines = self.cfg.log_file.read_text(encoding="utf-8").splitlines()[-5:]
        except OSError:
            lines = []
        if lines:
            print("recent log:")
            for line in lines:
                print("  " + line)
        return 0


def read_body(args: argparse.Namespace) -> str:
    if getattr(args, "body_file", None):
        return Path(args.body_file).read_text(encoding="utf-8")
    return getattr(args, "body", "") or ""


def main(argv: Optional[Sequence[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    root = Path(__file__).resolve().parent.parent
    cfg = Config.from_env(root)

    parser = argparse.ArgumentParser(description="Issue キューで無人実装を回す")
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("run", help="キューから1件実行する")
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--issue", type=int)
    run.add_argument("--verbose", action="store_true")

    sub.add_parser("status", help="状態を表示する")
    sub.add_parser("ensure-labels", help="ラベルを作成する")

    add = sub.add_parser("enqueue", help="Issue を実装キューに追加する")
    add.add_argument("title")
    add.add_argument("--body", default="")
    add.add_argument("--body-file")

    promote = sub.add_parser("promote", help="提案 Issue を実装キューへ移す")
    promote.add_argument("number", type=int)

    propose = sub.add_parser("propose", help="改善提案 Issue を作る")
    propose.add_argument("--dry-run", action="store_true")

    sub.add_parser("pause", help="実行を止める")
    sub.add_parser("resume", help="実行を再開する")

    if not argv:
        argv = ["run"]
    args = parser.parse_args(argv)
    runner = Runner(cfg)

    if args.command == "run":
        lock = Lock(cfg.state_dir)
        if not lock.acquire():
            if lock.error:
                runner.log("ロックを取得できません: %s" % lock.error)
                return 1
            runner.log("別の実行が進行中のためスキップします")
            return 0
        try:
            runner.cleanup_old_files()
            try:
                return runner.run_once(dry_run=args.dry_run, issue_number=args.issue,
                                       verbose=args.verbose)
            except TaskError as exc:
                runner.log("実行を中止しました: %s" % exc)
                return 1
            except Exception as exc:  # noqa: BLE001 - LaunchAgent を落とさないため
                runner.log("予期しないエラーで中止しました: %s" % exc)
                return 1
        finally:
            lock.release()
    if args.command == "status":
        return runner.status()
    if args.command == "ensure-labels":
        runner.ensure_labels()
        return 0
    if args.command == "enqueue":
        return runner.enqueue(args.title, read_body(args))
    if args.command == "promote":
        return runner.promote(args.number)
    if args.command == "propose":
        lock = Lock(cfg.state_dir)
        if not lock.acquire():
            if lock.error:
                runner.log("ロックを取得できません: %s" % lock.error)
                return 1
            runner.log("別の実行が進行中のためスキップします")
            return 0
        try:
            try:
                return runner.propose(dry_run=args.dry_run)
            except TaskError as exc:
                runner.log("提案を中止しました: %s" % exc)
                return 1
            except Exception as exc:  # noqa: BLE001 - LaunchAgent を落とさないため
                runner.log("提案で予期しないエラーが発生しました: %s" % exc)
                return 1
        finally:
            lock.release()
    if args.command == "pause":
        return runner.pause(True)
    if args.command == "resume":
        return runner.pause(False)
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
