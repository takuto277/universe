#!/usr/bin/env python3
"""apps.json の createdAt / updatedAt が欠けていたらgit履歴から補完する。"""
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def git_value(args):
    return subprocess.run(
        ["git", "-C", str(ROOT)] + args,
        capture_output=True, text=True).stdout.strip()


def first_date(path):
    values = git_value(["log", "--reverse", "--format=%cI", "--", path]).splitlines()
    return values[0][:10] if values else datetime.now().astimezone().date().isoformat()


def last_time(path):
    value = git_value(["log", "-1", "--format=%cI", "--", path])
    return value or datetime.now().astimezone().isoformat(timespec="seconds")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="補完が必要なら書き換えずに失敗する")
    args = parser.parse_args()

    path = ROOT / "apps.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    missing = []
    changed = False
    for app in data.get("apps", []):
        for key in ("createdAt", "updatedAt"):
            if app.get(key):
                continue
            missing.append("%s:%s" % (app.get("id"), key))
            if not args.check:
                app[key] = first_date(app["path"]) if key == "createdAt" else last_time(app["path"])
                changed = True

    if missing and args.check:
        print("apps.json に日付がありません: %s" % ", ".join(missing), file=sys.stderr)
        print("python3 tools/sync_app_dates.py を実行して更新してください。", file=sys.stderr)
        return 1
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("updated apps.json: %s" % ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
