#!/usr/bin/env python3
"""Servidor estático endurecido para el portfolio de Hsoja.

Sustituye a `python -m http.server`, que no envía cabeceras de seguridad,
lista directorios y sirve cualquier archivo de la carpeta (incluidos .env o .git).

Diseño (fail-closed):
- Lista blanca: solo se sirven los archivos del sitio; todo lo demás es 404.
- Solo GET y HEAD; cualquier otro método recibe 405.
- Cabeceras de seguridad en todas las respuestas (incluidos los errores).
- Escucha en 127.0.0.1 por defecto; exponerlo en la red exige --host explícito.
- Los logs no registran IPs ni cadenas de consulta.

Uso:
    python serve.py                 # http://127.0.0.1:8000
    python serve.py --port 8080
"""
from __future__ import annotations

import argparse
import mimetypes
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent

# Lista blanca explícita de rutas públicas → archivo en disco.
# Una ruta nueva debe añadirse aquí a propósito (y en tests/test_serve.py).
PUBLIC_FILES: dict[str, str] = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/main.js": "main.js",
    "/fonts/instrument-serif-latin-400-normal.woff2": "fonts/instrument-serif-latin-400-normal.woff2",
    "/fonts/instrument-serif-latin-400-italic.woff2": "fonts/instrument-serif-latin-400-italic.woff2",
    "/fonts/manrope-latin-wght-normal.woff2": "fonts/manrope-latin-wght-normal.woff2",
    "/fonts/jetbrains-mono-latin-400-normal.woff2": "fonts/jetbrains-mono-latin-400-normal.woff2",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".woff2": "font/woff2",
}

# Misma política que la meta CSP de index.html, más las directivas que solo
# funcionan como cabecera (frame-ancestors).
CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


def _load_site() -> dict[str, tuple[bytes, str]]:
    """Carga los archivos permitidos en memoria al arrancar.

    Falla al iniciar (fail-closed) si falta alguno o si alguna ruta escapa de ROOT.
    """
    site: dict[str, tuple[bytes, str]] = {}
    for route, rel in PUBLIC_FILES.items():
        path = (ROOT / rel).resolve()
        if ROOT not in path.parents or not path.is_file():
            raise SystemExit(f"Archivo público inválido o ausente: {rel}")
        ctype = CONTENT_TYPES.get(path.suffix) or mimetypes.guess_type(path.name)[0]
        if not ctype:
            raise SystemExit(f"Tipo de contenido desconocido: {rel}")
        site[route] = (path.read_bytes(), ctype)
    return site


class SecureHandler(BaseHTTPRequestHandler):
    site: dict[str, tuple[bytes, str]] = {}
    server_version = "static"   # no revela versión de Python
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # ---------- utilidades ----------
    def _security_headers(self) -> None:
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)

    def _send(self, status: HTTPStatus, body: bytes, ctype: str, head_only: bool, cache: str) -> None:
        self.send_response(status)
        self._security_headers()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _error(self, status: HTTPStatus, head_only: bool = False) -> None:
        body = f"{status.value} {status.phrase}\n".encode()
        self._send(status, body, "text/plain; charset=utf-8", head_only, "no-store")

    # ---------- métodos ----------
    def _serve(self, head_only: bool) -> None:
        raw = urlsplit(self.path).path  # descarta ?query y #fragment
        path = unquote(raw)
        if "\x00" in path or "\\" in path or ".." in path:
            return self._error(HTTPStatus.NOT_FOUND, head_only)
        entry = self.site.get(path)
        if entry is None:
            return self._error(HTTPStatus.NOT_FOUND, head_only)
        body, ctype = entry
        cache = "no-cache" if ctype.startswith("text/html") else "public, max-age=3600"
        self._send(HTTPStatus.OK, body, ctype, head_only, cache)

    def do_GET(self) -> None:  # noqa: N802
        self._serve(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(head_only=True)

    def _not_allowed(self) -> None:
        self.send_response(HTTPStatus.METHOD_NOT_ALLOWED)
        self._security_headers()
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_TRACE = do_CONNECT = _not_allowed

    # Los errores internos de http.server (400, 414, 501…) también llevan cabeceras.
    def send_error(self, code, message=None, explain=None):  # type: ignore[override]
        try:
            status = HTTPStatus(code)
        except ValueError:
            status = HTTPStatus.BAD_REQUEST
        self.close_connection = True
        self._error(status, head_only=self.command == "HEAD")

    # Log sin IP ni query string.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def log_request(self, code="-", size="-") -> None:  # type: ignore[override]
        route = urlsplit(getattr(self, "path", "")).path[:200]
        status = code.value if isinstance(code, HTTPStatus) else code
        sys.stderr.write(f"{getattr(self, 'command', '-')} {route} {status}\n")


def make_server(host: str, port: int) -> ThreadingHTTPServer:
    SecureHandler.site = _load_site()
    httpd = ThreadingHTTPServer((host, port), SecureHandler)
    httpd.daemon_threads = True
    return httpd


def main() -> None:
    ap = argparse.ArgumentParser(description="Servidor estático seguro del portfolio")
    ap.add_argument("--host", default="127.0.0.1", help="interfaz (por defecto solo local)")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("Puerto inválido")
    httpd = make_server(args.host, args.port)
    print(f"Portfolio en http://{args.host}:{args.port}  (Ctrl+C para salir)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
