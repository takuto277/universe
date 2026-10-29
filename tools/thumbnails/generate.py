#!/usr/bin/env python3
"""各ゲームを実際に起動して、一覧用のゲームプレイ画像を生成する。"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def load_apps(only):
    apps = json.loads((ROOT / "apps.json").read_text(encoding="utf-8"))["apps"]
    if only:
        wanted = set(only)
        apps = [app for app in apps if app["id"] in wanted]
        missing = wanted - {app["id"] for app in apps}
        if missing:
            raise SystemExit("unknown app(s): %s" % ", ".join(sorted(missing)))
    return apps


def start_game(page):
    for selector in ("#btn-start", "#btn-tutorial", "button.primary", "button"):
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                locator.click(timeout=800)
                return
        except Exception:
            pass
    page.keyboard.press("Space")


def capture(browser, base_url, app, width, height, delay):
    url = urljoin(base_url.rstrip("/") + "/", app["path"])
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(350)
    start_game(page)
    page.wait_for_timeout(250)

    # タイトル画面のままなら、ゲーム側の公開APIでも開始する
    state = page.evaluate("() => window.__GAME__ && window.__GAME__.getState ? window.__GAME__.getState() : null")
    if isinstance(state, dict) and state.get("phase") in ("idle", "start", None):
        page.evaluate("() => { const g = window.__GAME__; if (g && g.start) g.start(); }")
        page.wait_for_timeout(250)

    end = page.evaluate("() => performance.now() + %d" % int(delay * 1000))
    while page.evaluate("() => performance.now()") < end:
        if not app.get("thumbNoAuto"):
            page.evaluate("() => { const g = window.__GAME__; if (g && g.autoPlayStep) g.autoPlayStep(); }")
        page.wait_for_timeout(120)
        state = page.evaluate("() => window.__GAME__ && window.__GAME__.getState ? window.__GAME__.getState() : null")
        if isinstance(state, dict) and state.get("over"):
            page.evaluate("() => { const g = window.__GAME__; if (g && g.start) g.start(); }")
            page.wait_for_timeout(500)
            break

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        png = Path(tmp.name)
    page.screenshot(path=str(png), full_page=False)
    context.close()
    return png, url


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--delay", type=float, default=1.2)
    parser.add_argument("--app", action="append", default=[])
    args = parser.parse_args()

    apps = load_apps(args.app)
    failures = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for app in apps:
                try:
                    png, url = capture(browser, args.base_url, app, args.width, args.height,
                                       app.get("thumbDelay", args.delay))
                    out = ROOT / app["path"] / "thumb.jpg"
                    subprocess.run(
                        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82",
                         str(png), "--out", str(out)],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    png.unlink(missing_ok=True)
                    print("OK %s -> %s" % (app["id"], out.relative_to(ROOT)))
                except Exception as exc:  # noqa: BLE001
                    failures.append("%s: %s" % (app["id"], exc))
                    print("NG %s: %s" % (app["id"], exc), file=sys.stderr)
        finally:
            browser.close()

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
