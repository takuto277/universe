#!/usr/bin/env python3
"""seed.py : ゲーム案（seed）の選択をセッション間で排他する。

- docs/game-seeds.md のランキング表から候補を読む
- apps.json の実装済みIDを除外する
- .git/universe-seed-claims/<id>.lock を mkdir で原子的に確保する
- 同じリポジトリの全 worktree でロックを共有する（git-common-dir 配下）

使い方:
  ./tools/seed.sh list            # 種の一覧（実装済み/確保済み/空き）
  ./tools/seed.sh next            # 次の空きを原子的に確保
  ./tools/seed.sh claim tutor     # 指定の種を確保
  ./tools/seed.sh status          # 確保状況
  ./tools/seed.sh release tutor   # 確保を解放
  ./tools/seed.sh clean           # 24時間より古い確保を掃除
"""
import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
SEED_ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")


class SeedError(Exception):
    pass


def run_git(root, *args):
    try:
        proc = subprocess.run(
            ["git", "-C", str(root)] + list(args),
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def resolve_root(value):
    if value:
        return Path(value).expanduser().resolve()
    top = run_git(SCRIPT_ROOT, "rev-parse", "--show-toplevel")
    if top:
        return Path(top).resolve()
    return SCRIPT_ROOT


def git_common_dir(root):
    out = run_git(root, "rev-parse", "--git-common-dir")
    if not out:
        return None
    path = Path(out)
    if not path.is_absolute():
        path = (root / path).resolve()
    return path


def default_lock_dir(root):
    env = os.environ.get("UNIVERSE_SEED_LOCK_DIR")
    if env:
        return Path(env).expanduser().resolve()
    common = git_common_dir(root)
    if common:
        return common / "universe-seed-claims"
    return root / ".seed-claims"


def resolve_owner(root, explicit):
    if explicit:
        return explicit
    env = os.environ.get("UNIVERSE_SEED_OWNER")
    if env:
        return env
    branch = run_git(root, "branch", "--show-current") or "detached"
    return "%s@%s" % (branch, socket.gethostname())


def normalize_id(value):
    slug = (value or "").strip().lower()
    if not SEED_ID_RE.match(slug):
        raise SeedError("ゲームIDは小文字英数字とハイフンで指定してください: %r" % value)
    return slug


def load_apps(root):
    path = root / "apps.json"
    if not path.is_file():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SeedError("apps.json を読めません: %s" % exc)
    return {app.get("id") for app in data.get("apps", []) if app.get("id")}


def extract_slug(title):
    text = title.strip()
    for sep in (" / ", "／", "/"):
        if sep in text:
            text = text.rsplit(sep, 1)[1]
            break
    match = re.search(r"[（(]([A-Za-z0-9][A-Za-z0-9 _-]*)[）)]", text)
    if match:
        text = match.group(1)
    text = text.lower()
    if not re.search(r"[a-z]", text):
        return None
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or None


def parse_candidates(root):
    path = root / "docs" / "game-seeds.md"
    if not path.is_file():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise SeedError("docs/game-seeds.md を読めません: %s" % exc)

    found = {}
    group = None
    for line in lines:
        if line.startswith("## "):
            if "新案10" in line:
                group = ("new10", 0)
            elif "30案" in line:
                group = ("30案", 1)
            else:
                group = None
            continue
        if group is None:
            continue
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 2 or not cells[0].isdigit():
            continue
        title = cells[1]
        slug = extract_slug(title)
        if not slug:
            continue
        item = {
            "id": slug,
            "rank": int(cells[0]),
            "title": title,
            "group": group[0],
            "groupOrder": group[1],
        }
        current = found.get(slug)
        if current is None or item["groupOrder"] < current["groupOrder"]:
            found[slug] = item

    return sorted(
        found.values(),
        key=lambda item: (item["groupOrder"], item["rank"], item["id"]),
    )


def read_meta(lock_path):
    meta = {}
    files = sorted(p for p in lock_path.iterdir() if p.is_file())
    for path in files:
        name = path.name
        if name == "meta":
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    if "=" in line:
                        key, value = line.split("=", 1)
                        meta[key.strip()] = value.strip()
            except OSError:
                pass
        else:
            try:
                meta[name] = path.read_text(encoding="utf-8").strip()
            except OSError:
                pass
    return meta


def age_hours(meta):
    value = meta.get("created")
    if not value:
        return None
    try:
        created = datetime.fromisoformat(value)
    except ValueError:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - created).total_seconds() / 3600.0)


def list_claims(lock_dir):
    claims = {}
    if not lock_dir.is_dir():
        return claims
    for entry in sorted(lock_dir.iterdir()):
        if not entry.is_dir() or not entry.name.endswith(".lock"):
            continue
        slug = entry.name[: -len(".lock")]
        claims[slug] = read_meta(entry)
    return claims


def claim_lock(lock_dir, slug, owner, root, force=False):
    lock_path = lock_dir / ("%s.lock" % slug)
    if lock_path.exists():
        if not force:
            raise SeedError(
                "%s は既に確保されています (%s)。release するか --force を付けてください。"
                % (slug, describe_claim(lock_path, read_meta(lock_path)))
            )
        shutil.rmtree(lock_path)

    try:
        lock_dir.mkdir(parents=True, exist_ok=True)
        os.mkdir(lock_path)
    except FileExistsError:
        raise SeedError(
            "%s は他のセッションに先に確保されました (%s)。"
            % (slug, describe_claim(lock_path, read_meta(lock_path)))
        )
    except OSError as exc:
        raise SeedError("ロックを作成できません: %s" % exc)

    meta = {
        "owner": owner,
        "branch": run_git(root, "branch", "--show-current") or "detached",
        "worktree": str(root),
        "host": socket.gethostname(),
        "created": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "pid": str(os.getpid()),
    }
    try:
        (lock_path / "meta").write_text(
            "\n".join("%s=%s" % (key, value) for key, value in meta.items()) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        shutil.rmtree(lock_path, ignore_errors=True)
        raise SeedError("ロックのメタ情報を書けません: %s" % exc)
    return meta


def describe_claim(lock_path, meta):
    owner = meta.get("owner") or "unknown"
    age = age_hours(meta)
    age_text = "?" if age is None else "%.1fh" % age
    worktree = meta.get("worktree") or "?"
    return "owner=%s, age=%s, worktree=%s" % (owner, age_text, worktree)


def status_of(item, apps, claims):
    if item["id"] in apps:
        return "implemented"
    if item["id"] in claims:
        return "claimed"
    return "available"


def print_json(payload):
    print(json.dumps(payload, ensure_ascii=False, indent=2))


# ---------- commands ----------


def cmd_list(args, ctx):
    candidates = parse_candidates(ctx["root"])
    apps = load_apps(ctx["root"])
    claims = list_claims(ctx["lock_dir"])
    rows = []
    for item in candidates:
        status = status_of(item, apps, claims)
        if args.available and status != "available":
            continue
        meta = claims.get(item["id"]) or {}
        rows.append(
            {
                "id": item["id"],
                "rank": item["rank"],
                "title": item["title"],
                "group": item["group"],
                "status": status,
                "owner": meta.get("owner"),
                "ageHours": age_hours(meta) if meta else None,
            }
        )

    if args.json:
        print_json({"lockDir": str(ctx["lock_dir"]), "seeds": rows})
        return 0

    print("lock: %s" % ctx["lock_dir"])
    print("%3s  %-16s %-12s %s" % ("#", "ID", "STATUS", "TITLE"))
    for row in rows:
        extra = ""
        if row["status"] == "claimed":
            extra = "  (%s)" % (row["owner"] or "unknown")
        print(
            "%3d  %-16s %-12s %s%s"
            % (row["rank"], row["id"], row["status"], row["title"], extra)
        )
    if not rows:
        print("(候補がありません。docs/game-seeds.md の表を確認してください)")
    return 0


def cmd_next(args, ctx):
    candidates = parse_candidates(ctx["root"])
    apps = load_apps(ctx["root"])
    claims = list_claims(ctx["lock_dir"])

    for item in candidates:
        if item["id"] in apps:
            continue
        if item["id"] in claims:
            continue
        if args.no_claim:
            if args.json:
                print_json({"id": item["id"], "title": item["title"], "rank": item["rank"], "claimed": False})
            else:
                print("next: #%d %s  %s (not claimed)" % (item["rank"], item["id"], item["title"]))
            return 0
        try:
            meta = claim_lock(ctx["lock_dir"], item["id"], ctx["owner"], ctx["root"])
        except SeedError:
            # 別セッションに先を越された場合だけ次へ進む。それ以外は表示して終了。
            claims = list_claims(ctx["lock_dir"])
            if item["id"] in claims:
                continue
            raise
        if args.json:
            print_json(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "rank": item["rank"],
                    "claimed": True,
                    "owner": meta["owner"],
                    "lock": str(ctx["lock_dir"] / ("%s.lock" % item["id"])),
                }
            )
        else:
            print("claimed #%d %s  %s" % (item["rank"], item["id"], item["title"]))
            print("  owner: %s" % meta["owner"])
            print("  release: ./tools/seed.sh release %s" % item["id"])
        return 0

    raise SeedError(
        "空きの種がありません。`./tools/seed.sh list` と `status` を確認し、"
        "古い確保は `clean` で掃除してください。"
    )


def cmd_claim(args, ctx):
    slug = normalize_id(args.id)
    apps = load_apps(ctx["root"])
    if slug in apps and not args.force:
        raise SeedError(
            "%s は apps.json に実装済みです。v2 として確保するなら --force を付けてください。" % slug
        )
    meta = claim_lock(ctx["lock_dir"], slug, ctx["owner"], ctx["root"], force=args.force)
    if args.json:
        print_json(
            {
                "id": slug,
                "claimed": True,
                "owner": meta["owner"],
                "lock": str(ctx["lock_dir"] / ("%s.lock" % slug)),
            }
        )
    else:
        print("claimed %s" % slug)
        print("  owner: %s" % meta["owner"])
        print("  release: ./tools/seed.sh release %s" % slug)
    return 0


def cmd_release(args, ctx):
    slug = normalize_id(args.id)
    lock_path = ctx["lock_dir"] / ("%s.lock" % slug)
    if not lock_path.exists():
        print("%s は確保されていません" % slug)
        return 0
    meta = read_meta(lock_path)
    if meta.get("owner") and meta["owner"] != ctx["owner"] and not args.force:
        raise SeedError(
            "%s は %s が確保しています。自分の確保でない場合は --force を付けてください。"
            % (slug, describe_claim(lock_path, meta))
        )
    shutil.rmtree(lock_path)
    print("released %s (%s)" % (slug, meta.get("owner") or "unknown"))
    return 0


def cmd_status(args, ctx):
    claims = list_claims(ctx["lock_dir"])
    rows = []
    for slug in sorted(claims):
        meta = claims[slug]
        rows.append(
            {
                "id": slug,
                "owner": meta.get("owner"),
                "branch": meta.get("branch"),
                "worktree": meta.get("worktree"),
                "ageHours": age_hours(meta),
                "created": meta.get("created"),
            }
        )
    if args.json:
        print_json({"lockDir": str(ctx["lock_dir"]), "claims": rows})
        return 0
    print("lock: %s" % ctx["lock_dir"])
    print("claims: %d" % len(rows))
    for row in rows:
        age = "?" if row["ageHours"] is None else "%.1fh" % row["ageHours"]
        print(
            "- %-16s owner=%-24s age=%-6s worktree=%s"
            % (row["id"], row["owner"] or "unknown", age, row["worktree"] or "?")
        )
    return 0


def cmd_clean(args, ctx):
    claims = list_claims(ctx["lock_dir"])
    removed = []
    for slug in sorted(claims):
        meta = claims[slug]
        age = age_hours(meta)
        if age is None or age >= args.hours:
            removed.append(slug)
            if not args.dry_run:
                shutil.rmtree(ctx["lock_dir"] / ("%s.lock" % slug), ignore_errors=True)
    if args.json:
        print_json({"lockDir": str(ctx["lock_dir"]), "removed": removed, "dryRun": args.dry_run})
        return 0
    verb = "would remove" if args.dry_run else "removed"
    if not removed:
        print("掃除する確保はありません (%.1f時間以上)" % args.hours)
    else:
        for slug in removed:
            print("%s %s" % (verb, slug))
    return 0


def make_common(suppress):
    # サブコマンド側は SUPPRESS にして、コマンド前後どちらの指定でも上書きしない。
    default = argparse.SUPPRESS if suppress else None
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--root", default=default, help="リポジトリのルート（既定: git toplevel）")
    common.add_argument("--lock-dir", default=default, help="ロック置き場（既定: git-common-dir/universe-seed-claims）")
    common.add_argument("--owner", default=default, help="確保者の表示名（既定: branch@host）")
    common.add_argument(
        "--json",
        action="store_true",
        default=(argparse.SUPPRESS if suppress else False),
        help="JSONで出力する",
    )
    return common


def build_parser():
    common_main = make_common(False)
    common_sub = make_common(True)

    parser = argparse.ArgumentParser(
        description="ゲーム案（seed）の選択をセッション間で排他する",
        parents=[common_main],
    )
    sub = parser.add_subparsers(dest="command")

    p_list = sub.add_parser("list", parents=[common_sub], help="種の一覧を表示する")
    p_list.add_argument("--available", action="store_true", help="空きだけ表示する")
    p_list.set_defaults(func=cmd_list)

    p_next = sub.add_parser("next", parents=[common_sub], help="次の空きを確保する")
    p_next.add_argument("--no-claim", action="store_true", help="確保せずに次の空きを表示する")
    p_next.set_defaults(func=cmd_next)

    p_claim = sub.add_parser("claim", parents=[common_sub], help="指定の種を確保する")
    p_claim.add_argument("id", help="ゲームID（例: tutor）")
    p_claim.add_argument("--force", action="store_true", help="既存の確保/実装済みでも上書きする")
    p_claim.set_defaults(func=cmd_claim)

    p_release = sub.add_parser("release", parents=[common_sub], help="確保を解放する")
    p_release.add_argument("id", help="ゲームID")
    p_release.add_argument("--force", action="store_true", help="他人の確保でも解放する")
    p_release.set_defaults(func=cmd_release)

    p_status = sub.add_parser("status", parents=[common_sub], help="確保状況を表示する")
    p_status.set_defaults(func=cmd_status)

    p_clean = sub.add_parser("clean", parents=[common_sub], help="古い確保を掃除する")
    p_clean.add_argument("--hours", type=float, default=24.0, help="この時間より古い確保を消す（既定: 24）")
    p_clean.add_argument("--dry-run", action="store_true", help="消さずに対象だけ表示する")
    p_clean.set_defaults(func=cmd_clean)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0

    root = resolve_root(args.root)
    lock_dir = (
        Path(args.lock_dir).expanduser().resolve()
        if args.lock_dir
        else default_lock_dir(root)
    )
    ctx = {
        "root": root,
        "lock_dir": lock_dir,
        "owner": resolve_owner(root, args.owner),
    }
    try:
        return args.func(args, ctx)
    except SeedError as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
