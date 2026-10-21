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
import re
import os
import shutil
import signal
import subprocess
import sys
import tempfile
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
DEFAULT_FIX_TIMEOUT = 1500
DEFAULT_FIX_MAX = 3
LOG_RETENTION_DAYS = 14
LOG_MAX_BYTES = 2 * 1024 * 1024
LOG_TRIM_BYTES = 512 * 1024
PROTECTED_PATHS = (
    "tools/",
    ".github/workflows/",
)
REVIEW_MARKER_RE = re.compile(r"<!--\s*ai-pr-review\s*(\{.*?\})\s*-->", re.S)

LABELS = {
    "agent:ready": ("0E8A16", "無人エージェントの実装キュー"),
    "agent:running": ("FBCA04", "無人エージェントが実行中"),
    "agent:done": ("1D76DB", "実装完了・PR 作成済み"),
    "agent:failed": ("B60205", "実行失敗(Issue コメント参照)"),
    "agent:proposed": ("5319E7", "改善提案(promote で実装キューへ)"),
    "agent-generated": ("BFD4F2", "無人エージェントが作成した PR"),
    "agent-autofix": ("F9D0C4", "無人エージェントがレビュー指摘を自動修正"),
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
    notify: bool = True
    stall_minutes: int = 90
    fix_max: int = DEFAULT_FIX_MAX
    fix_timeout: int = DEFAULT_FIX_TIMEOUT
    sandbox: str = "none"
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
            notify=os.environ.get("UNIVERSE_AGENT_NOTIFY", "1") != "0",
            stall_minutes=int(os.environ.get("UNIVERSE_AGENT_STALL_MINUTES", "90")),
            fix_max=int(os.environ.get("UNIVERSE_AGENT_FIX_MAX", DEFAULT_FIX_MAX)),
            fix_timeout=int(os.environ.get(
                "UNIVERSE_AGENT_FIX_TIMEOUT", DEFAULT_FIX_TIMEOUT)),
            sandbox=os.environ.get("UNIVERSE_AGENT_SANDBOX", "none"),
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
        """読み取り専用の状態確認。旧ロックの移行は行わない。"""
        if not self.path.exists():
            return False
        if self.path.is_dir():
            return True
        try:
            fh = self.path.open("a+")
        except OSError:
            return True
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fh.close()
            return True
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        fh.close()
        return False


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

    def _sandbox_profile(self, worktree: Path, tmpdir: Path) -> Path:
        home = Path.home()
        writable = [
            worktree,
            tmpdir,
            Path("/dev"),
            home / ".local/share/opencode",
            home / ".cache/opencode",
        ]
        deny_read = [
            home / ".ssh", home / ".aws", home / ".config/gh",
            home / ".config/gcloud", home / ".kube", home / "Library/Keychains",
            home / "Documents", home / "Desktop", home / "Downloads",
            home / "Library/Messages", home / "Library/Mail",
        ]
        extra = [home / ".netrc", home / ".git-credentials"]

        def real(path: Path) -> str:
            return os.path.realpath(str(path))

        for protected in (worktree, tmpdir, self.cfg.root, self.cfg.state_dir):
            resolved = real(protected)
            for denied in deny_read:
                denied_real = real(denied)
                if resolved == denied_real or resolved.startswith(denied_real + os.sep):
                    raise TaskError(
                        "サンドボックスの拒否対象と作業パスが重なっています: %s" % protected)

        def q(path: Path) -> str:
            return '(subpath "%s")' % str(path).replace("\\", "\\\\").replace('"', '\\"')

        def expand(paths):
            out = []
            for path in paths:
                out.append(path)
                if real(path) != str(path):
                    out.append(Path(real(path)))
            return out

        expanded = expand(writable)
        denied = expand(deny_read + extra)

        git_pointer_paths = [Path(worktree) / ".git"]
        resolved_pointer = Path(real(worktree)) / ".git"
        if resolved_pointer != git_pointer_paths[0]:
            git_pointer_paths.append(resolved_pointer)

        lines = [
            "(version 1)",
            "(deny default)",
            "(allow process-exec)",
            "(allow process-fork)",
            "(allow signal)",
            "(allow sysctl-read)",
            "(allow mach-lookup)",
            "(allow ipc-posix-shm)",
            "(allow file-read*)",
            "(deny file-read* %s)" % " ".join(q(path) for path in denied),
            "(allow file-write* %s)" % " ".join(q(path) for path in expanded),
            "(deny file-write* %s)" % " ".join(
                q(path) for path in git_pointer_paths),
            "(allow network*)",
        ]
        path = self.cfg.state_dir / "sandbox" / "profile.sb"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path

    def sandbox_argv(self, argv: List[str], worktree: Path,
                     tmpdir: Optional[Path] = None) -> List[str]:
        mode = (self.cfg.sandbox or "none").lower()
        if mode in ("", "none", "off", "0"):
            return argv
        if mode != "seatbelt":
            raise TaskError("未対応のサンドボックスです: %s" % self.cfg.sandbox)
        binary = shutil.which("sandbox-exec") or "/usr/bin/sandbox-exec"
        if not Path(binary).exists():
            raise TaskError("sandbox-exec が見つかりません")
        profile = self._sandbox_profile(worktree, tmpdir or worktree)
        return [binary, "-f", str(profile)] + argv

    def _run_sandboxed(self, argv: List[str], worktree: Path, cwd: Path,
                       timeout: int, env: Optional[Dict[str, str]] = None) -> Result:
        mode = (self.cfg.sandbox or "none").lower()
        if mode in ("", "none", "off", "0"):
            return self.cmd.run(argv, cwd=str(cwd), timeout=timeout, env=env)
        tmpdir = Path(tempfile.mkdtemp(prefix="universe-agent-"))
        try:
            extra = {"TMPDIR": str(tmpdir), "TMP": str(tmpdir), "TEMP": str(tmpdir),
                     "UNIVERSE_AGENT_IN_SANDBOX": "1"}
            if env:
                extra.update(env)
            return self.cmd.run(self.sandbox_argv(argv, worktree, tmpdir),
                                cwd=str(cwd), timeout=timeout, env=extra)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def notify(self, message: str) -> None:
        """macOS の通知。UNIVERSE_AGENT_NOTIFY=0 で無効。"""
        if not self.cfg.notify:
            return
        safe = message.replace("\\", "\\\\").replace('"', "'")
        self.cmd.run(["osascript", "-e",
                      'display notification "%s" with title "universe agent"' % safe],
                     timeout=15)

    def history_path(self) -> Path:
        return self.cfg.state_dir / "history.jsonl"

    def record_history(self, record: dict) -> None:
        entry = dict(record)
        entry.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        self._append_log(self.history_path(), json.dumps(entry, ensure_ascii=False))

    def recent_history(self, limit: int = 5) -> List[dict]:
        try:
            lines = self.history_path().read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        items = []
        for line in lines[-limit:]:
            try:
                item = json.loads(line)
            except ValueError:
                continue
            if isinstance(item, dict):
                items.append(item)
        return items

    def _running_marker(self, number: int) -> Path:
        return self.cfg.state_dir / "running" / ("issue-%d.json" % number)

    def _mark_started(self, number: int, branch: str) -> None:
        path = self._running_marker(number)
        path.parent.mkdir(parents=True, exist_ok=True)
        start = time.time()
        path.write_text(json.dumps({"started": start, "notified": False,
                                    "branch": branch}), encoding="utf-8")

    def _clear_started(self, number: int) -> None:
        try:
            self._running_marker(number).unlink()
        except OSError:
            pass

    def check_stalled(self) -> None:
        if self.cfg.stall_minutes <= 0:
            return
        try:
            running = self.list_issues("agent:running")
        except TaskError as exc:
            self.log("滞留確認をスキップ: %s" % exc)
            return
        for issue in running:
            number = int(issue.get("number", 0))
            path = self._running_marker(number)
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if data.get("notified"):
                continue
            started = float(data.get("started") or 0)
            if not started or time.time() - started < self.cfg.stall_minutes * 60:
                continue
            self.notify("Issue #%d が %d 分以上 running のままです" %
                        (number, self.cfg.stall_minutes))
            if self.cfg.notify:
                data["notified"] = True
                try:
                    path.write_text(json.dumps(data), encoding="utf-8")
                except OSError:
                    pass

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
        self.check_stalled()

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
        started = time.time()

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
            self._mark_started(number, branch)
            self.comment(number, "無人エージェントが着手しました。\n対象: `%s` (%s)" %
                         (branch, cfg.base))

            base_sha = self._prepare_worktree(worktree, branch)
            git_dir = self._git_dir(worktree)
            prepared = True
            prompt = self.build_prompt(number, title, body)
            result = self._run_agent(prompt, worktree, issue_log, verbose)
            if result.timed_out:
                raise TaskError("エージェントがタイムアウトしました (%ss)" % cfg.timeout)
            if not result.ok:
                raise TaskError("エージェントが異常終了しました (exit=%s)" % result.code)

            self._assert_git_dir_unchanged(worktree, git_dir)
            self._commit_leftovers(worktree, "Issue #%d" % number)
            count = self.git("rev-list", "--count", "%s..HEAD" % base_sha,
                             cwd=worktree, timeout=60)
            try:
                commits = int((count.stdout or "0").strip() or "0")
            except ValueError:
                commits = 0
            if not count.ok or commits == 0:
                raise TaskError("origin/%s からの変更がありません" % cfg.base)

            changed = self._assert_tools_untouched(worktree, base_sha)
            verify_script = worktree / "tools" / "verify.sh"
            verify = self._run_sandboxed(
                ["bash", str(verify_script)], worktree, worktree, cfg.verify_timeout)
            self._append_log(issue_log, "\n$ ./tools/verify.sh\n" +
                             (verify.stdout or "") + (verify.stderr or ""))
            if verify.timed_out:
                raise TaskError("verify.sh がタイムアウトしました (%ss)" % cfg.verify_timeout)
            if not verify.ok:
                raise TaskError("./tools/verify.sh が失敗しました。詳細は実行ログを確認してください")
            # app のテストが tools/ を書き換えて以降のチェックを無効化していないか確認する
            self._assert_worktree_clean(worktree)
            self._assert_tools_untouched(worktree, base_sha)

            if self.paused():
                raise TaskError("pause されたため push 前に中断しました")
            latest = self.find_pr(branch)
            latest_state = (latest or {}).get("state", "").upper()
            if latest_state in ("OPEN", "MERGED"):
                raise TaskError("PR が既に存在します: %s" % latest.get("url"))
            push = self.git("-c", "core.hooksPath=/dev/null",
                            "push", "-u", "origin", branch, cwd=worktree, timeout=180)
            if not push.ok and ("non-fast-forward" in (push.stderr or "") or
                                "rejected" in (push.stderr or "")):
                # 前回の実行が PR 作成前に落ちてブランチだけ残っている場合は作り直す
                latest = self.find_pr(branch)
                if latest and (latest.get("state") or "").upper() in ("OPEN", "MERGED"):
                    raise TaskError("PR が既に存在します: %s" % latest.get("url"))
                self.git("push", "origin", "--delete", branch, cwd=worktree, timeout=120)
                push = self.git("-c", "core.hooksPath=/dev/null",
                            "push", "-u", "origin", branch, cwd=worktree, timeout=180)
            if not push.ok:
                raise TaskError("push に失敗しました: %s" % tail(push.stderr, 600))

            if self.paused():
                raise TaskError("pause されたため PR 作成前に中断しました")
            url = self.create_pr(number, title, branch, issue_log)
            if not self.edit_labels(number, add=["agent:done"],
                                    remove=["agent:running", "agent:ready", "agent:failed"]):
                self.log("Issue #%s: agent:done の付与に失敗しました" % number)
            self.comment(
                number,
                "実装が完了し、PR を作成しました: %s\n"
                "レビューとマージは五点ゲートに任せます。ログ: `%s`" % (url, issue_log),
            )
            self.log("Issue #%s: PR を作成しました %s" % (number, url))
            self._clear_started(number)
            self.record_history({
                "kind": "implement", "issue": number, "result": "success",
                "duration": round(time.time() - started, 1),
                "model": cfg.model, "pr": url, "changed": len(changed),
                "commits": commits,
            })
            self.notify("Issue #%s のPRを作成しました" % number)
            return 0
        except TaskError as exc:
            self._fail(number, issue_log, str(exc), started)
            return 1
        except Exception as exc:  # noqa: BLE001 - 無人実行を止めないため
            self._fail(number, issue_log, "予期しないエラー: %s" % exc, started)
            return 1
        finally:
            if prepared:
                self._cleanup_worktree(worktree)

    def _fail(self, number: int, issue_log: Path, reason: str,
              started: Optional[float] = None) -> None:
        self.log("Issue #%s: 失敗 - %s" % (number, reason))
        self._append_log(issue_log, "\nFAILED: " + reason + "\n")
        self._clear_started(number)
        self.edit_labels(number, add=["agent:failed"],
                         remove=["agent:running", "agent:ready"])
        self.comment(
            number,
            "実行に失敗しました。\n\n```\n%s\n```\n\nログ: `%s`" %
            (tail(reason, 1200), issue_log),
        )
        self.record_history({
            "kind": "implement", "issue": number, "result": "failed",
            "duration": round(time.time() - started, 1) if started else None,
            "model": self.cfg.model, "reason": tail(reason, 300),
        })
        self.notify("Issue #%s の実行に失敗しました" % number)

    def _issue_label_names(self, issue: dict) -> List[str]:
        names = []
        for label in issue.get("labels") or []:
            if isinstance(label, dict):
                names.append(label.get("name") or "")
            else:
                names.append(str(label))
        return [name for name in names if name]

    def _git_dir(self, worktree: Path) -> str:
        result = self.git("rev-parse", "--absolute-git-dir", cwd=worktree, timeout=60)
        if not result.ok:
            return ""
        return (result.stdout or "").strip()

    def _assert_git_dir_unchanged(self, worktree: Path, expected: str) -> None:
        current = self._git_dir(worktree)
        if not expected or current != expected:
            raise TaskError("worktree の git dir が変更されました")

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

    def _assert_worktree_clean(self, worktree: Path) -> None:
        status = self.git("status", "--porcelain", cwd=worktree, timeout=60)
        if not status.ok:
            raise TaskError("verify 後の git status に失敗しました")
        dirty = [line for line in (status.stdout or "").splitlines() if line.strip()]
        if dirty:
            raise TaskError("verify 中にファイルが変更されました: %s\n"
                            "調査するには UNIVERSE_AGENT_KEEP_WORKTREE=1 で再実行してください" %
                            ", ".join(dirty[:10]))

    def _assert_tools_untouched(self, worktree: Path, base_sha: str) -> None:
        """検証スクリプト自体を書き換えて verify を通す抜け道を塞ぐ。"""
        result = self.git("diff", "--name-status", "--no-renames", "-z",
                          "%s..HEAD" % base_sha, cwd=worktree, timeout=60)
        if not result.ok:
            raise TaskError("変更ファイルの確認に失敗しました: %s" % tail(result.stderr, 400))
        parts = (result.stdout or "").split("\0")
        changed = [parts[i + 1] for i in range(0, len(parts) - 1, 2)]
        touched = sorted({path for path in changed
                          if path in PROTECTED_PATHS or
                          path.startswith("tools/") or
                          path.startswith(".github/workflows/")})
        if touched:
            raise TaskError("検証スクリプトや CI を変更しています(人間のレビューが必要): %s\n"
                            "調査するには UNIVERSE_AGENT_KEEP_WORKTREE=1 で再実行してください" %
                            ", ".join(touched))
        return sorted(changed)

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
            "- 変更のコミットは runner が行う。git add / git commit はしない",
            "- push、PR 作成、マージ、Issue のクローズはしない(runner が行う)",
            "- 最後に、変更点・テスト結果・残課題を短くまとめる",
        ])

    def _run_agent(self, prompt: str, worktree: Path, issue_log: Path,
                   verbose: bool, timeout: Optional[int] = None) -> Result:
        argv = [
            self.cfg.opencode_bin, "run",
            "--agent", self.cfg.agent,
            "--model", self.cfg.model,
            "--dir", str(worktree),
            "--auto",
            "--title", "universe-agent-%d" % int(time.time()),
            prompt,
        ]
        limit = timeout or self.cfg.timeout
        self.log("agent を開始します (model=%s, timeout=%ss)" % (self.cfg.model, limit))
        self._append_log(issue_log, "$ opencode run --agent %s --model %s\n" %
                         (self.cfg.agent, self.cfg.model))
        identity = {
            "GIT_AUTHOR_NAME": "takuto277",
            "GIT_AUTHOR_EMAIL": "takuto277@users.noreply.github.com",
            "GIT_COMMITTER_NAME": "takuto277",
            "GIT_COMMITTER_EMAIL": "takuto277@users.noreply.github.com",
        }
        result = self._run_sandboxed(argv, worktree, worktree, limit, env=identity)
        self._append_log(issue_log, (result.stdout or "") + (result.stderr or ""))
        self.log("agent が終了しました (exit=%s, timeout=%s)" % (result.code, result.timed_out))
        if verbose and result.stderr:
            self.log(tail(result.stderr, 400))
        return result

    def _commit_leftovers(self, worktree: Path, ref: str) -> None:
        status = self.git("status", "--porcelain", cwd=worktree, timeout=60)
        if not status.ok:
            raise TaskError("git status に失敗しました: %s" % tail(status.stderr, 400))
        if not (status.stdout or "").strip():
            return
        added = self.git("add", "-A", cwd=worktree, timeout=120)
        if not added.ok:
            raise TaskError("git add に失敗しました: %s" % tail(added.stderr, 400))
        commit = self.git("-c", "core.hooksPath=/dev/null",
                          "-c", "core.fsmonitor=false",
                          "-c", "user.name=takuto277",
                          "-c", "user.email=takuto277@users.noreply.github.com",
                          "commit", "-m", "repo: %s の残りの変更をコミット" % ref,
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

    # ---- レビュー指摘の自動修正 ----
    def _viewer_login(self) -> str:
        result = self.gh("api", "user", "--jq", ".login")
        login = (result.stdout or "").strip()
        if not result.ok or not login:
            raise TaskError("GitHub のログインユーザーを取得できませんでした")
        return login

    def latest_blocker_review(self, number: int, head: str) -> Optional[dict]:
        """自分が現在の head に投稿した最新の AI レビューだけを対象にする。

        第三者が blocker 付き marker を投稿しても builder への指示に使わない。
        """
        viewer = self._viewer_login()
        result = self.gh("api", "repos/%s/pulls/%d/reviews" % (self.cfg.repo, number),
                         "--paginate", "--jq", ".[]")
        if not result.ok:
            raise TaskError("PR のレビュー取得に失敗しました: %s" % tail(result.stderr))
        for line in reversed((result.stdout or "").splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                review = json.loads(line)
            except ValueError:
                continue
            if ((review.get("user") or {}).get("login") or "") != viewer:
                continue
            if (review.get("state") or "").upper() != "COMMENTED":
                continue
            if (review.get("commit_id") or "") != head:
                continue
            body = review.get("body") or ""
            match = REVIEW_MARKER_RE.search(body)
            if not match:
                continue
            try:
                marker = json.loads(match.group(1))
            except ValueError:
                continue
            try:
                if int(marker.get("version") or 0) != 1:
                    continue
            except (TypeError, ValueError):
                continue
            if str(marker.get("head") or "") != head:
                continue
            try:
                blockers = int(marker.get("blockers") or 0)
            except (TypeError, ValueError):
                continue
            if blockers <= 0:
                return None
            findings = REVIEW_MARKER_RE.sub("", body).strip()
            return {"blockers": blockers, "body": findings}
        return None

    def comment_pr(self, number: int, body: str) -> None:
        result = self.gh("pr", "comment", str(number), "--repo", self.cfg.repo,
                         "--body", body)
        if not result.ok:
            self.log("PR #%s のコメントに失敗: %s" % (number, tail(result.stderr, 400)))

    def _fix_attempts_path(self, number: int) -> Path:
        return self.cfg.state_dir / "fix" / ("pr-%d.json" % number)

    def _read_fix_attempts(self, number: int) -> int:
        try:
            data = json.loads(self._fix_attempts_path(number).read_text(encoding="utf-8"))
            return int(data.get("attempts") or 0)
        except (OSError, ValueError, TypeError):
            return 0

    def _bump_fix_attempts(self, number: int) -> None:
        path = self._fix_attempts_path(number)
        path.parent.mkdir(parents=True, exist_ok=True)
        attempts = self._read_fix_attempts(number) + 1
        path.write_text(json.dumps({"attempts": attempts, "updated": int(time.time())}),
                        encoding="utf-8")

    def _prepare_fix_worktree(self, worktree: Path, number: int, head: str) -> str:
        if worktree.exists():
            self.git("worktree", "remove", "--force", str(worktree))
        self.git("worktree", "prune")
        shutil.rmtree(worktree, ignore_errors=True)
        fetched = self.git("fetch", "origin", self.cfg.base, timeout=180)
        if not fetched.ok:
            raise TaskError("origin/%s の取得に失敗しました" % self.cfg.base)
        pr_fetch = self.git("fetch", "origin", "pull/%d/head" % number, timeout=180)
        if not pr_fetch.ok:
            raise TaskError("PR #%d の head を取得できませんでした" % number)
        head_sha = (self.git("rev-parse", "FETCH_HEAD", timeout=60).stdout or "").strip()
        if not head_sha:
            raise TaskError("PR #%d の head SHA を取得できませんでした" % number)
        if head and head_sha != head:
            raise TaskError("PR #%d の head が確認中に変わりました" % number)
        base = self.git("merge-base", "origin/%s" % self.cfg.base, head_sha, timeout=60)
        base_sha = (base.stdout or "").strip()
        if not base.ok or not base_sha:
            raise TaskError("PR #%d の merge-base を取得できませんでした" % number)
        worktree.parent.mkdir(parents=True, exist_ok=True)
        added = self.git("worktree", "add", "--detach", str(worktree), head_sha, timeout=180)
        if not added.ok:
            raise TaskError("修正用 worktree の作成に失敗しました: %s" % tail(added.stderr, 600))
        return head_sha

    def build_fix_prompt(self, number: int, title: str, review: dict) -> str:
        return "\n".join([
            "あなたは universe リポジトリの無人修正エージェント(builder)です。",
            "PR #%d「%s」の最新レビューで Blocker が %d 件指摘されました。修正してください。" %
            (number, title, review.get("blockers", 0)),
            "",
            "--- レビュー指摘 ---",
            tail(review.get("body") or "", 8000),
            "---",
            "",
            "作業ルール:",
            "- カレントディレクトリは PR head の専用 worktree。ここだけを編集する",
            "- 指摘された Blocker の修正に集中し、無関係な変更をしない",
            "- tools/ と .github/workflows/ は変更しない(保護対象。必要なら修正せず理由を報告する)",
            "- ./tools/verify.sh を通す。失敗したら原因を直す",
            "- 変更のコミットは runner が行う。git add / git commit はしない",
            "- push、PR 作成、マージはしない(runner が行う)",
            "- 最後に、直した点とテスト結果を短くまとめる",
        ])

    def fix(self, number: int, dry_run: bool = False) -> int:
        if self.paused():
            self.log("pause 中のため修正しません")
            return 2
        result = self.gh("pr", "view", str(number), "--repo", self.cfg.repo,
                         "--json", "number,title,state,isDraft,headRefName,headRefOid,"
                         "baseRefName,url,labels,headRepositoryOwner,headRepository")
        if not result.ok:
            raise TaskError("PR #%d を取得できません: %s" % (number, tail(result.stderr)))
        try:
            data = json.loads(result.stdout or "{}")
        except ValueError as exc:
            raise TaskError("PR の JSON を解釈できません: %s" % exc)
        if (data.get("state") or "").upper() != "OPEN":
            self.log("PR #%d は open ではありません" % number)
            return 1
        if data.get("isDraft"):
            self.log("PR #%d は Draft です" % number)
            return 1
        if (data.get("baseRefName") or "") != self.cfg.base:
            self.log("PR #%d の base が %s ではありません" % (number, self.cfg.base))
            return 1
        labels = {item.get("name") for item in (data.get("labels") or [])
                  if isinstance(item, dict)}
        if labels & {"ai-pause", "do-not-merge"}:
            self.log("PR #%d は pause ラベルが付いています" % number)
            return 2
        owner, name = (self.cfg.repo.split("/", 1) + [""])[:2]
        head_owner = (data.get("headRepositoryOwner") or {}).get("login")
        head_name = (data.get("headRepository") or {}).get("name")
        if head_owner and (head_owner != owner or head_name != name):
            self.log("PR #%d は fork 由来のため自動修正しません" % number)
            return 2
        head_ref = data.get("headRefName") or ""
        head = data.get("headRefOid") or ""
        if not head_ref or head_ref == self.cfg.base:
            raise TaskError("修正対象の head ブランチが不正です")
        review = self.latest_blocker_review(number, head)
        if not review:
            self.log("PR #%d: 現在の head に Blocker レビューがありません" % number)
            return 1
        attempts = self._read_fix_attempts(number)
        if attempts >= self.cfg.fix_max:
            exhausted = self.cfg.state_dir / "fix" / ("pr-%d.exhausted" % number)
            if not exhausted.exists():
                exhausted.parent.mkdir(parents=True, exist_ok=True)
                exhausted.write_text(str(attempts), encoding="utf-8")
                self.notify("PR #%d の自動修正が上限に達しました" % number)
            self.log("PR #%d: 自動修正の上限(%d)に達しています" % (number, self.cfg.fix_max))
            return 3
        if dry_run:
            self.log("dry-run: PR #%d の Blocker %d件を修正します" %
                     (number, review.get("blockers", 0)))
            return 0

        self.ensure_labels()
        self._bump_fix_attempts(number)
        worktree = self.cfg.state_dir / "worktrees" / ("pr-%d-fix" % number)
        fix_log = self.cfg.state_dir / "logs" / ("fix-pr-%d-%d.log" %
                                                 (number, int(time.time())))
        started = time.time()
        try:
            head_sha = self._prepare_fix_worktree(worktree, number, head)
            git_dir = self._git_dir(worktree)
            prompt = self.build_fix_prompt(number, data.get("title") or "", review)
            agent = self._run_agent(prompt, worktree, fix_log, False,
                                    timeout=self.cfg.fix_timeout)
            if agent.timed_out:
                raise TaskError("修正エージェントがタイムアウトしました (%ss)" % self.cfg.fix_timeout)
            if not agent.ok:
                raise TaskError("修正エージェントが異常終了しました (exit=%s)" % agent.code)

            self._assert_git_dir_unchanged(worktree, git_dir)
            self._commit_leftovers(worktree, "PR #%d" % number)
            count = self.git("rev-list", "--count", "%s..HEAD" % head_sha,
                             cwd=worktree, timeout=60)
            try:
                commits = int((count.stdout or "0").strip() or "0")
            except ValueError:
                commits = 0
            if not count.ok or commits == 0:
                raise TaskError("レビュー指摘に対する変更がありませんでした(人の対応が必要です)")
            changed = self._assert_tools_untouched(worktree, head_sha)
            verify = self._run_sandboxed(
                ["bash", str(worktree / "tools" / "verify.sh")],
                worktree, worktree, self.cfg.verify_timeout)
            self._append_log(fix_log, "\n$ ./tools/verify.sh\n" +
                             (verify.stdout or "") + (verify.stderr or ""))
            if verify.timed_out:
                raise TaskError("verify.sh がタイムアウトしました (%ss)" % self.cfg.verify_timeout)
            if not verify.ok:
                raise TaskError("./tools/verify.sh が失敗しました。詳細は実行ログを確認してください")
            self._assert_worktree_clean(worktree)
            self._assert_tools_untouched(worktree, head_sha)
            if self.paused():
                raise TaskError("pause されたため push 前に中断しました")

            push = self.git("-c", "core.hooksPath=/dev/null",
                            "push", "origin", "HEAD:%s" % head_ref,
                            cwd=worktree, timeout=180)
            if not push.ok:
                raise TaskError("push に失敗しました: %s" % tail(push.stderr, 600))
            short = (self.git("rev-parse", "--short", "HEAD", cwd=worktree).stdout or "").strip()
            self.comment_pr(
                number,
                "レビューの Blocker を自動修正しました (head `%s`, %d files)。最新 head で再レビューします。" %
                (short, len(changed)),
            )
            self.gh("pr", "edit", str(number), "--repo", self.cfg.repo,
                    "--add-label", "agent-autofix")
            self.record_history({"kind": "fix", "pr_number": number, "result": "success",
                                 "duration": round(time.time() - started, 1),
                                 "model": self.cfg.model, "changed": len(changed),
                                 "pr": data.get("url")})
            self.notify("PR #%d のBlockerを自動修正しました" % number)
            self.log("PR #%d: Blockerを自動修正しました (head %s)" % (number, short))
            return 0
        except TaskError as exc:
            self._fail_fix(number, fix_log, str(exc), started)
            return 1
        except Exception as exc:  # noqa: BLE001 - watcher を落とさないため
            self._fail_fix(number, fix_log, "予期しないエラー: %s" % exc, started)
            return 1
        finally:
            self._cleanup_worktree(worktree)

    def _fail_fix(self, number: int, fix_log: Path, reason: str, started: float) -> None:
        self.log("PR #%d: 自動修正に失敗 - %s" % (number, reason))
        self._append_log(fix_log, "\nFAILED: " + reason + "\n")
        self.record_history({"kind": "fix", "pr_number": number, "result": "failed",
                             "duration": round(time.time() - started, 1),
                             "model": self.cfg.model, "reason": tail(reason, 300)})
        self.notify("PR #%d の自動修正に失敗しました" % number)
        self.comment_pr(number, "自動修正に失敗しました。\n\n```\n%s\n```\n\nログ: `%s`" %
                       (tail(reason, 800), fix_log))

    def cleanup_old_files(self) -> None:
        cutoff = time.time() - LOG_RETENTION_DAYS * 86400
        for path in sorted((self.cfg.state_dir / "logs").glob("*")):
            try:
                info = path.stat()
                if info.st_mtime < cutoff:
                    path.unlink()
                    continue
                if info.st_size > LOG_MAX_BYTES:
                    with path.open("rb") as fh:
                        fh.seek(max(0, info.st_size - LOG_TRIM_BYTES))
                        tail_bytes = fh.read()
                    with path.open("wb") as fh:
                        fh.write(("[truncated to last %d bytes]\n" % LOG_TRIM_BYTES).encode())
                        fh.write(tail_bytes)
            except OSError:
                pass
        for path in sorted((self.cfg.state_dir / "fix").glob("*")):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
            except OSError:
                pass
        try:
            lines = self.history_path().read_text(encoding="utf-8").splitlines()
            if len(lines) > 200:
                self.history_path().write_text(
                    "\n".join(lines[-200:]) + "\n", encoding="utf-8")
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
            self.record_history({"kind": "propose", "result": "success",
                                 "model": self.cfg.model, "label": label})
            self.notify("改善提案を作成しました")
            return 0
        except TaskError as exc:
            self.log("提案に失敗: %s" % exc)
            self.record_history({"kind": "propose", "result": "failed",
                                 "model": self.cfg.model, "reason": tail(str(exc), 300)})
            self.notify("改善提案の作成に失敗しました")
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
                                remove=["agent:proposed", "agent:done",
                                        "agent:failed", "agent:running"]):
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
        print("notify:  %s" % ("on" if self.cfg.notify else "off"))
        print("sandbox: %s" % (self.cfg.sandbox or "none"))
        plist = Path.home() / "Library/LaunchAgents/com.takuto277.universe-agent-runner.plist"
        print("launchd: %s" % ("installed" if plist.exists() else "not installed"))
        recent = self.recent_history(5)
        if recent:
            print("recent runs:")
            for item in recent:
                clock = (item.get("ts") or "")[11:16]
                if item.get("issue"):
                    target = "#%s" % item["issue"]
                elif item.get("pr_number"):
                    target = "PR#%s" % item["pr_number"]
                else:
                    target = item.get("kind", "-")
                duration = item.get("duration")
                duration_text = ("%ss" % duration) if duration is not None else "-"
                model = str(item.get("model") or "-").split("/")[-1]
                changed = item.get("changed")
                changed_text = ("%s files" % changed) if changed is not None else "-"
                detail = item.get("pr") or item.get("reason") or ""
                print("  %s %-7s %-6s %-6s %-8s %-18s %s" %
                      (clock, item.get("result", "?"), target, duration_text,
                       changed_text, model, tail(str(detail), 50)))
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

    fixp = sub.add_parser("fix", help="PR の Blocker を自動修正する")
    fixp.add_argument("--pr", type=int, required=True)
    fixp.add_argument("--dry-run", action="store_true")

    propose = sub.add_parser("propose", help="改善提案 Issue を作る")
    propose.add_argument("--dry-run", action="store_true")

    sub.add_parser("pause", help="実行を止める")
    sub.add_parser("resume", help="実行を再開する")

    if not argv:
        print("""universe 無人実装ランナー

使い方:
  ./tools/agent.sh enqueue "タイトル" --body "依頼内容"   実装キューに追加
  ./tools/agent.sh propose                               改善提案を Issue 化
  ./tools/agent.sh promote <番号>                         提案を実装キューへ
  ./tools/agent.sh status                                状態確認
  ./tools/agent.sh pause / resume                        停止 / 再開
  ./tools/agent.sh run --dry-run                         次の対象を確認
  ./tools/agent.sh fix --pr <番号>                       PRのBlockerを自動修正

詳しい説明: docs/unattended-agents.md
すべてのオプション: ./tools/agent.sh --help""")
        return 0
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
    if args.command == "fix":
        lock = Lock(cfg.state_dir)
        if not lock.acquire():
            if lock.error:
                runner.log("ロックを取得できません: %s" % lock.error)
                return 1
            runner.log("別の実行が進行中のためスキップします")
            return 2
        try:
            try:
                return runner.fix(args.pr, dry_run=args.dry_run)
            except TaskError as exc:
                runner.log("自動修正を中止しました: %s" % exc)
                return 1
            except Exception as exc:  # noqa: BLE001 - watcher を落とさないため
                runner.log("自動修正で予期しないエラー: %s" % exc)
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
