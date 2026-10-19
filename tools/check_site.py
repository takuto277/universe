#!/usr/bin/env python3
import json
import re
import sys
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ERRORS = []
REQUIRED = ("id", "path", "tag", "title", "description")


def error(message):
    ERRORS.append(message)


def read(path):
    return path.read_text(encoding="utf-8")


def normalize(text):
    return re.sub(r"\s+", " ", text)


class RefCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.refs.append(value)


def load_apps():
    try:
        data = json.loads(read(ROOT / "apps.json"))
    except (OSError, json.JSONDecodeError) as exc:
        error(f"apps.json を読めません: {exc}")
        return []

    apps = data.get("apps")
    if not isinstance(apps, list):
        error("apps.json: apps は配列にしてください")
        return []

    valid = []
    seen_ids = set()
    seen_paths = set()

    for index, app in enumerate(apps):
        label = f"apps.json[{index}]"
        if not isinstance(app, dict):
            error(f"{label}: オブジェクトにしてください")
            continue

        missing = [key for key in REQUIRED if not isinstance(app.get(key), str) or not app[key].strip()]
        if missing:
            error(f"{label}: 必須項目がありません: {', '.join(missing)}")
            continue

        app_id = app["id"]
        path = app["path"]
        app_dir = ROOT / path

        if app_id in seen_ids:
            error(f"{label}: id が重複しています: {app_id}")
        seen_ids.add(app_id)

        if path in seen_paths:
            error(f"{label}: path が重複しています: {path}")
        seen_paths.add(path)

        if not path.endswith("/"):
            error(f"{label}: path は / で終えてください: {path}")
        if path.startswith("/") or "\\" in path or ".." in Path(path).parts:
            error(f"{label}: path はリポジトリ内の相対パスにしてください: {path}")

        if not app_dir.is_dir():
            error(f"{label}: ディレクトリがありません: {path}")
            continue
        if not (app_dir / "index.html").is_file():
            error(f"{label}: index.html がありません: {path}")
        if not (app_dir / "README.md").is_file():
            error(f"{label}: README.md がありません: {path}")
        if not list(app_dir.glob("test-*.js")):
            error(f"{label}: test-*.js がありません: {path}")

        valid.append(app)

    return valid


def check_index(apps):
    index_path = ROOT / "index.html"
    if not index_path.is_file():
        error("index.html がありません")
        return

    html = normalize(read(index_path))

    for app in apps:
        href = f'href="{app["path"]}"'
        count = html.count(href)
        if count != 1:
            error(f'index.html: {app["path"]} へのリンクが {count} 個あります（1個にしてください）')

        tag = escape(app["tag"])
        if f'class="tag">{tag}</span>' not in html:
            error(f'index.html: タグが一致しません: {app["tag"]}')

        title = escape(app["title"])
        if f"<h2>{title}</h2>" not in html:
            error(f'index.html: タイトルが一致しません: {app["title"]}')

        description = normalize(app["description"])
        if description not in html and escape(description) not in html:
            error(f'index.html: 説明が一致しません: {app["id"]}')


def check_registered_apps(apps):
    registered = {app["path"] for app in apps}
    reserved = {"docs", "tools"}

    for child in sorted(ROOT.iterdir()):
        if not child.is_dir() or child.name.startswith(".") or child.name in reserved:
            continue
        if (child / "index.html").is_file() and f"{child.name}/" not in registered:
            error(f"apps.json に登録されていないアプリがあります: {child.name}/")


def check_refs(html_path, base_dir):
    parser = RefCollector()
    parser.feed(read(html_path))

    for ref in parser.refs:
        if ref.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue

        parts = urlsplit(ref)
        if parts.scheme:
            continue

        raw_path = unquote(parts.path)
        if not raw_path:
            continue

        if raw_path.startswith("/"):
            target = ROOT / raw_path.lstrip("/")
        else:
            target = base_dir / raw_path

        if raw_path.endswith("/") or target.is_dir():
            target = target / "index.html"

        if not target.is_file():
            error(f"{html_path.relative_to(ROOT)}: リンク先がありません: {ref}")


def main():
    apps = load_apps()
    check_index(apps)
    check_registered_apps(apps)

    check_refs(ROOT / "index.html", ROOT)
    for app in apps:
        app_dir = ROOT / app["path"]
        if (app_dir / "index.html").is_file():
            check_refs(app_dir / "index.html", app_dir)

    if ERRORS:
        for message in ERRORS:
            print(f"NG: {message}", file=sys.stderr)
        print(f"site check NG ({len(ERRORS)} 件)", file=sys.stderr)
        return 1

    print(f"site check OK ({len(apps)} app(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
