#!/usr/bin/env python3
"""Раздаёт каталог вьювера.

Страницы открываются всегда. Авторский режим — после верного пароля (cookie).
Лайки стилей хранятся на сервере; читать может любой, писать — только автор.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

PASSWORD = os.environ.get("HOUSE_VIEWER_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("HOUSE_VIEWER_PASSWORD is not set")

HOST = "0.0.0.0"
PORT = 8766
COOKIE_NAME = "house_author"
TOKEN_TTL_SEC = 60 * 60 * 24 * 30
ROOT = Path.cwd().resolve()
LIKES_PATH = ROOT / "data" / "style-likes.json"
SECRET = hashlib.sha256(f"house-author:{PASSWORD}".encode("utf-8")).digest()


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def make_token(now: int | None = None) -> str:
    issued = int(now if now is not None else time.time())
    payload = str(issued).encode("ascii")
    sig = hmac.new(SECRET, payload, hashlib.sha256).digest()
    return f"{b64url(payload)}.{b64url(sig)}"


def token_ok(token: str) -> bool:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        payload = b64url_decode(payload_b64)
        expected = hmac.new(SECRET, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64url_decode(sig_b64)):
            return False
        issued = int(payload.decode("ascii"))
    except (ValueError, UnicodeDecodeError):
        return False
    return 0 <= time.time() - issued <= TOKEN_TTL_SEC


def read_likes() -> dict:
    try:
        raw = json.loads(LIKES_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key:
            continue
        level = int(value) if isinstance(value, (int, float, str)) else 0
        if level in (1, 2, 3):
            out[key] = level
    return out


def write_likes(data: dict) -> None:
    LIKES_PATH.parent.mkdir(parents=True, exist_ok=True)
    clean = {}
    for key, value in data.items():
        if not isinstance(key, str) or not key:
            continue
        level = int(value)
        if level in (1, 2, 3):
            clean[key] = level
    tmp = LIKES_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(clean, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(LIKES_PATH)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def is_author(self) -> bool:
        cookie = SimpleCookie()
        cookie.load(self.headers.get("Cookie", ""))
        morsel = cookie.get(COOKIE_NAME)
        return bool(morsel and token_ok(morsel.value))

    def send_json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 1_000_000:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def set_author_cookie(self, token: str | None):
        if token:
            cookie = (
                f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={TOKEN_TTL_SEC}"
            )
        else:
            cookie = f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        self.send_header("Set-Cookie", cookie)

    def password_from_request(self, data: dict) -> str:
        password = data.get("password")
        if isinstance(password, str) and password:
            return password
        header = self.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "basic" or not token.strip():
            return ""
        try:
            decoded = base64.b64decode(token.strip(), validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return ""
        _user, sep, password = decoded.partition(":")
        return password if sep else ""

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Allow", "GET, PUT, POST, DELETE, OPTIONS, HEAD")
            self.end_headers()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_HEAD(self):
        self.handle_request(body=False)

    def do_GET(self):
        self.handle_request(body=True)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/auth":
            data = self.read_json()
            password = self.password_from_request(data)
            if password and hmac.compare_digest(password.encode("utf-8"), PASSWORD.encode("utf-8")):
                token = make_token()
                body = json.dumps({"author": True}, ensure_ascii=False).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.set_author_cookie(token)
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_json(HTTPStatus.UNAUTHORIZED, {"author": False, "error": "bad_password"})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/auth":
            body = json.dumps({"author": False}, ensure_ascii=False).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.set_author_cookie(None)
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/likes":
            if not self.is_author():
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "author_required"})
                return
            data = self.read_json()
            likes = data.get("likes", data)
            if not isinstance(likes, dict):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "bad_likes"})
                return
            write_likes(likes)
            self.send_json(HTTPStatus.OK, {"likes": read_likes()})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def handle_request(self, body: bool):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/api/auth":
            self.send_json(HTTPStatus.OK, {"author": self.is_author()})
            return
        if path == "/api/likes":
            self.send_json(HTTPStatus.OK, {"likes": read_likes()})
            return
        if path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        # Обычная раздача файлов без Basic Auth — страница всегда открывается.
        if not body:
            super().do_HEAD()
        else:
            super().do_GET()


def main():
    # Соль для cookie чуть разная на каждый старт процесса не нужна — привязана к паролю.
    _ = secrets.token_hex(8)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
