#!/usr/bin/env python3
"""HTTP/1.1で静的ファイルを配信する（Chromiumのkeep-alive対策）。"""
import argparse
import functools
import http.server


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default=".")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=args.directory)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
