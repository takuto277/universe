#!/usr/bin/env python3
"""test_seed.py : tools/seed.py の確保・解放・掃除を検証する。"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "tools" / "seed.py"

MARKDOWN = """# ゲーム案の種

## 30案ランキング（2026-11-11）

| 順位 | 仮題 | 元ネタ | 独自性 | 実装 |
| --- | --- | --- | --- | --- |
| 1 | 残像足場 / AFTERIMAGE | x | y | S |
| 2 | しりとり陣取り / WORD FRONT | x | y | M |
| 3 | 見ていない部屋 / SHIFT ROOM | x | y | M |
| 4 | 静止 / STILL | x | y | S |
| 5 | 盤面回転テトリス / GRAVITY WELL | x | y | S |
| 6 | 漏水テトリス / LEAK | x | y | S |
| 25 | 線が体力 / ONE LINE HP | x | y | S |

## 新案10（2026-11-24）

| 順位 | 仮題 | 元ネタ | 壊す前提 | 独自性 | 実装 |
| --- | --- | --- | --- | --- | --- |
| 1 | 間違えると時が進む / OOPS | x | y | z | S |
| 2 | 弾は敵のもの / AMMO SHARE | x | y | z | S |
| 3 | 借金で強くなる / DEBT | x | y | z | S |
| 4 | 一人二役 / TWIN | x | y | z | M |
| 5 | 教えてロボ / TUTOR | x | y | z | M |
| 6 | 地図は自分で描く / MAPLESS | x | y | z | M |
| 7 | 重心トラック / CARGO | x | y | z | M |
| 8 | 一行直すと世界が変わる / EDIT | x | y | z | M |
"""

APPS = {
    "apps": [
        {"id": "afterimage"},
        {"id": "word-front"},
        {"id": "shift-room"},
        {"id": "oops"},
        {"id": "ammo-share"},
        {"id": "debt"},
        {"id": "twin"},
    ]
}

passed = 0


def check(cond, message):
    global passed
    if not cond:
        raise AssertionError(message)
    passed += 1


def main():
    tmp = tempfile.TemporaryDirectory(prefix="universe-seed-test-")
    root = Path(tmp.name) / "repo"
    lock = Path(tmp.name) / "locks"
    (root / "docs").mkdir(parents=True)
    (root / "apps.json").write_text(json.dumps(APPS), encoding="utf-8")
    (root / "docs" / "game-seeds.md").write_text(MARKDOWN, encoding="utf-8")

    def run(*args):
        proc = subprocess.run(
            [
                sys.executable,
                str(SEED),
                "--root",
                str(root),
                "--lock-dir",
                str(lock),
                "--owner",
                "tester",
            ]
            + list(args),
            capture_output=True,
            text=True,
        )
        return proc.returncode, proc.stdout, proc.stderr

    # 1) 空き一覧
    code, out, err = run("list", "--available")
    check(code == 0, "list --available が失敗: " + err)
    check("tutor" in out, "tutor が空き一覧にない")
    check("still" in out, "still が空き一覧にない")
    check("oops" not in out, "実装済みの oops が空き一覧に出た")
    check("afterimage" not in out, "実装済みの afterimage が空き一覧に出た")
    check(out.index("tutor") < out.index("still"), "新案の空きが30案より先に来ていない")

    # 2) JSON一覧
    code, out, err = run("list", "--json")
    check(code == 0, "list --json が失敗: " + err)
    data = json.loads(out)
    rows = {row["id"]: row for row in data["seeds"]}
    check(rows["tutor"]["status"] == "available", "tutor の status が available でない")
    check(rows["oops"]["status"] == "implemented", "oops の status が implemented でない")
    check(rows["one-line-hp"]["group"] == "30案", "30案のグループ判定が不正")

    # 3) next が原子的に確保する
    code, out, err = run("next")
    check(code == 0, "next が失敗: " + err)
    check("tutor" in out, "next が tutor を返さない: " + out)
    check((lock / "tutor.lock").is_dir(), "tutor.lock がない")
    meta = (lock / "tutor.lock" / "meta").read_text(encoding="utf-8")
    check("owner=tester" in meta, "meta の owner が不正: " + meta)

    # 4) 2回目の next は別の種
    code, out, err = run("next")
    check(code == 0, "2回目の next が失敗: " + err)
    check("mapless" in out, "2回目の next が mapless でない: " + out)
    check((lock / "mapless.lock").is_dir(), "mapless.lock がない")

    # 5) 同じ種の二重確保は失敗
    code, out, err = run("claim", "tutor")
    check(code != 0, "確保済みの tutor を再確保できてしまう")
    check("tutor" in err, "エラーに tutor が出ない: " + err)
    check("tester" in err, "エラーに確保者が出ない: " + err)

    # 6) status
    code, out, err = run("status", "--json")
    check(code == 0, "status --json が失敗: " + err)
    data = json.loads(out)
    ids = {row["id"] for row in data["claims"]}
    check(ids == {"tutor", "mapless"}, "status の確保一覧が不正: " + str(ids))

    # 7) release
    code, out, err = run("release", "tutor")
    check(code == 0, "release が失敗: " + err)
    check(not (lock / "tutor.lock").exists(), "release 後も tutor.lock が残る")

    # 8) 任意のIDを確保できる
    code, out, err = run("claim", "still")
    check(code == 0, "still を確保できない: " + err)
    check((lock / "still.lock").is_dir(), "still.lock がない")

    # 9) 実装済みIDは --force なしでは確保できない
    code, out, err = run("claim", "afterimage")
    check(code != 0, "実装済みの afterimage を確保できてしまう")
    check("実装済み" in err, "実装済みのエラー文言がない: " + err)
    code, out, err = run("claim", "afterimage", "--force")
    check(code == 0, "--force で実装済みIDを確保できない: " + err)

    # 10) 不正なID
    code, out, err = run("claim", "../evil")
    check(code != 0, "不正なIDを確保できてしまう")

    # 11) clean
    code, out, err = run("clean", "--hours", "0")
    check(code == 0, "clean が失敗: " + err)
    check(not (lock / "mapless.lock").exists(), "clean 後も mapless.lock が残る")
    check(not (lock / "still.lock").exists(), "clean 後も still.lock が残る")
    check(not (lock / "afterimage.lock").exists(), "clean 後も afterimage.lock が残る")

    # 12) --no-claim は確保しない
    code, out, err = run("next", "--no-claim")
    check(code == 0, "next --no-claim が失敗: " + err)
    check("tutor" in out, "next --no-claim が tutor を返さない")
    check("not claimed" in out, "next --no-claim の表示が不正: " + out)
    check(not (lock / "tutor.lock").exists(), "next --no-claim がロックを作った")

    # 13) next --json
    code, out, err = run("next", "--json")
    check(code == 0, "next --json が失敗: " + err)
    data = json.loads(out)
    check(data["id"] == "tutor" and data["claimed"] is True, "next --json の結果が不正: " + out)

    # 14) グローバルオプションをコマンドの後ろに置いても効く
    proc = subprocess.run(
        [
            sys.executable,
            str(SEED),
            "status",
            "--root",
            str(root),
            "--lock-dir",
            str(lock),
            "--owner",
            "tester",
            "--json",
        ],
        capture_output=True,
        text=True,
    )
    check(proc.returncode == 0, "コマンド後のグローバル指定が失敗: " + proc.stderr)
    data = json.loads(proc.stdout)
    check(
        Path(data["lockDir"]).resolve() == lock.resolve(),
        "コマンド後の --lock-dir が効いていない",
    )

    # 15) 同時に next しても同じIDを二重に確保しない
    code, out, err = run("clean", "--hours", "0")
    check(code == 0, "並行テスト前の clean が失敗: " + err)
    procs = [
        subprocess.Popen(
            [
                sys.executable,
                str(SEED),
                "--root",
                str(root),
                "--lock-dir",
                str(lock),
                "--owner",
                "parallel-" + str(i),
                "next",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for i in range(2)
    ]
    outputs = []
    for i, proc in enumerate(procs):
        stdout, stderr = proc.communicate()
        check(proc.returncode == 0, "並行 next が失敗: " + stderr)
        outputs.append(stdout)
    ids = []
    for stdout in outputs:
        match = re.search(r"claimed #\d+ ([a-z0-9-]+)", stdout)
        check(match is not None, "並行 next の出力を解析できない: " + stdout)
        ids.append(match.group(1))
    check(len(set(ids)) == 2, "並行 next が同じIDを確保した: " + str(ids))
    check(set(ids) == {"tutor", "mapless"}, "並行 next の確保先が想定外: " + str(ids))

    print("seed tests OK (%d assertions)" % passed)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print("seed tests NG: %s" % exc, file=sys.stderr)
        sys.exit(1)
