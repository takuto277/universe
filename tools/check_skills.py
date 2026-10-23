#!/usr/bin/env python3
"""check_skills.py : .opencode/skills の契約を検査する

- registry.json と SKILL.md の name/version/path が一致する
- SKILL.md に frontmatter（name, description）がある
- 未登録のスキルディレクトリがない
- ホームディレクトリの絶対パスや、存在しない相対リンクがない
"""

import json
import re
import sys
from pathlib import Path

REQUIRED = ("name", "description")
HOME_PATTERNS = ("/Users/", "/home/")


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        raise ValueError("frontmatter がありません")
    end = text.find("\n---", 4)
    if end < 0:
        raise ValueError("frontmatter の終端がありません")
    data = {}
    for line in text[4:end].splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip("'\"")
    return data, text[end + 4:]


def validate(root):
    root = Path(root)
    skills_dir = root / ".opencode" / "skills"
    errors = []
    registry_path = skills_dir / "registry.json"
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return ["registry.json を読めません: %s" % exc]

    entries = registry.get("skills")
    if not isinstance(entries, list):
        return ["registry.json の skills は配列にしてください"]

    registered = set()
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("registry: 各項目はオブジェクトにしてください")
            continue
        name = entry.get("name")
        version = entry.get("version")
        path = entry.get("path")
        if not name or not path:
            errors.append("registry: name と path は必須です")
            continue
        if name in registered:
            errors.append("registry: name が重複しています: %s" % name)
        registered.add(name)
        if not isinstance(version, int) or version < 1:
            errors.append("registry: version は1以上の整数にしてください: %s" % name)
        skill_dir = skills_dir / path
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            errors.append("SKILL.md がありません: %s" % skill_md.relative_to(root))
            continue
        text = skill_md.read_text(encoding="utf-8")
        try:
            front, body = parse_frontmatter(text)
        except ValueError as exc:
            errors.append("%s: %s" % (skill_md.relative_to(root), exc))
            continue
        for key in REQUIRED:
            if not front.get(key):
                errors.append("%s: frontmatter に %s がありません" % (skill_md.relative_to(root), key))
        if front.get("name") and front["name"] != name:
            errors.append("%s: frontmatter name (%s) が registry (%s) と違います" %
                          (skill_md.relative_to(root), front["name"], name))
        for pattern in HOME_PATTERNS:
            if pattern in text:
                errors.append("%s: ホームディレクトリの絶対パスを含めないでください: %s" %
                              (skill_md.relative_to(root), pattern))
        for target in re.findall(r"\]\(([^)]+)\)", body):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            target_path = (skill_dir / target).resolve()
            if not target_path.exists():
                errors.append("%s: リンク先がありません: %s" %
                              (skill_md.relative_to(root), target))

    for child in sorted(skills_dir.iterdir()):
        if child.is_dir() and (child / "SKILL.md").is_file() and child.name not in registered:
            errors.append("registry に未登録のスキルがあります: %s" % child.name)

    return errors


def main(argv):
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parent.parent
    errors = validate(root)
    if errors:
        for message in errors:
            print("NG: %s" % message, file=sys.stderr)
        print("skills check NG (%d 件)" % len(errors), file=sys.stderr)
        return 1
    print("skills check OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
