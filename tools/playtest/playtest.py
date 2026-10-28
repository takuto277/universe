#!/usr/bin/env python3
"""Playwright でアプリを実際に開き、自動操作と描画を確認する。"""
import argparse
import json
import random
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def load_apps(only):
    data = json.loads((ROOT / "apps.json").read_text(encoding="utf-8"))
    apps = data.get("apps") or []
    if only:
        wanted = set(only)
        apps = [app for app in apps if app.get("id") in wanted]
        missing = wanted - {app.get("id") for app in apps}
        if missing:
            raise SystemExit("unknown app(s): %s" % ", ".join(sorted(missing)))
    return apps


def play_app(browser, base_url, app, seconds, shots_dir):
    app_id = app["id"]
    url = urljoin(base_url.rstrip("/") + "/", app["path"])
    errors = []
    console_errors = []
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
    if response is None or response.status >= 400:
        raise RuntimeError("%s: HTTP %s" % (app_id, response.status if response else "no response"))

    page.wait_for_timeout(400)
    for selector in ("#btn-start", "#btn-tutorial", "button.primary", "button"):
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                locator.click(timeout=800)
                break
        except PlaywrightError:
            pass
    page.keyboard.press("Space")
    page.wait_for_timeout(250)

    state = page.evaluate("() => window.__GAME__ && window.__GAME__.getState ? window.__GAME__.getState() : null")
    if not isinstance(state, dict):
        raise RuntimeError("%s: window.__GAME__.getState() がありません" % app_id)
    if page.locator("body").count() == 0:
        raise RuntimeError("%s: body がありません" % app_id)

    start_state = json.dumps(state, sort_keys=True)
    changed = False
    deadline = time.time() + seconds
    while time.time() < deadline:
        page.evaluate("() => { const g = window.__GAME__; if (g && g.autoPlayStep) g.autoPlayStep(); }")
        for key in random.sample(["1", "2", "3", "Space", "ArrowUp", "ArrowLeft", "ArrowRight"], 2):
            page.keyboard.press(key)
        page.wait_for_timeout(200)
        state = page.evaluate("() => window.__GAME__ && window.__GAME__.getState ? window.__GAME__.getState() : null")
        if isinstance(state, dict) and json.dumps(state, sort_keys=True) != start_state:
            changed = True
        if isinstance(state, dict) and (state.get("over") or state.get("phase") in ("over", "clear", "ending")):
            break

    shots_dir.mkdir(parents=True, exist_ok=True)
    shot = shots_dir / ("%s.png" % app_id)
    page.screenshot(path=str(shot), full_page=True)
    context.close()

    if errors:
        raise RuntimeError("%s: page error: %s" % (app_id, " | ".join(errors[:3])))
    if console_errors:
        raise RuntimeError("%s: console error: %s" % (app_id, " | ".join(console_errors[:3])))
    if not changed:
        raise RuntimeError("%s: 自動操作しても状態が変化しません" % app_id)
    return {"app": app_id, "url": url, "screenshot": str(shot), "state": state}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--app", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--seconds", type=float, default=5)
    parser.add_argument("--screenshots", default="playtest-screenshots")
    args = parser.parse_args()

    random.seed(0)
    apps = load_apps(None if args.all or not args.app else args.app)
    shots_dir = Path(args.screenshots)
    results = []
    failures = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for app in apps:
                try:
                    result = play_app(browser, args.base_url, app, args.seconds, shots_dir)
                    results.append(result)
                    print("OK %s -> %s" % (app["id"], result["screenshot"]))
                except Exception as exc:  # noqa: BLE001
                    failures.append("%s: %s" % (app["id"], exc))
                    print("NG %s: %s" % (app["id"], exc), file=sys.stderr)
        finally:
            browser.close()

    summary = {"ok": not failures, "results": results, "failures": failures}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
