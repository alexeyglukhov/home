#!/usr/bin/env python3
"""Раздаёт каталог вьювера с HTTP Basic Auth.

Пароль берётся из HOUSE_VIEWER_PASSWORD. Имя пользователя любое:
браузер показывает обычный диалог и может сохранить пару в менеджере паролей.
Своей сессии у сайта нет.
"""
import base64
import hmac
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PASSWORD = os.environ.get("HOUSE_VIEWER_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("HOUSE_VIEWER_PASSWORD is not set")

HOST = "0.0.0.0"
PORT = 8766


class Handler(SimpleHTTPRequestHandler):
    def do_HEAD(self):
        if self.allow():
            super().do_HEAD()

    def do_GET(self):
        if self.allow():
            super().do_GET()

    def allow(self):
        if self.authorized():
            return True
        body = "Требуется пароль.\n".encode()
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Dom", charset="UTF-8"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
        return False

    def authorized(self):
        header = self.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "basic" or not token.strip():
            return False
        try:
            decoded = base64.b64decode(token.strip(), validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return False
        _user, sep, password = decoded.partition(":")
        if not sep:
            return False
        return hmac.compare_digest(password.encode("utf-8"), PASSWORD.encode("utf-8"))


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
