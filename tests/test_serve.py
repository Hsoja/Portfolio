"""Pruebas de seguridad del servidor estático y del front-end."""
from __future__ import annotations

import http.client
import re
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import serve  # noqa: E402

# Lista de rutas esperadas: una ruta pública nueva que no esté aquí hace fallar la prueba.
EXPECTED_ROUTES = {
    "/", "/index.html", "/styles.css", "/main.js",
    "/fonts/instrument-serif-latin-400-normal.woff2",
    "/fonts/instrument-serif-latin-400-italic.woff2",
    "/fonts/manrope-latin-wght-normal.woff2",
    "/fonts/jetbrains-mono-latin-400-normal.woff2",
}


@pytest.fixture(scope="module")
def server():
    httpd = serve.make_server("127.0.0.1", 0)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield httpd.server_address[1]
    httpd.shutdown()
    httpd.server_close()


def req(port, method, path, body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    return r, data


# ---------- rutas ----------
def test_routes_are_exactly_the_expected_ones():
    assert set(serve.PUBLIC_FILES) == EXPECTED_ROUTES


@pytest.mark.parametrize("path", sorted(EXPECTED_ROUTES))
def test_public_files_served_with_security_headers(server, path):
    r, body = req(server, "GET", path)
    assert r.status == 200 and body
    for k, v in serve.SECURITY_HEADERS.items():
        assert r.getheader(k) == v
    assert "frame-ancestors 'none'" in r.getheader("Content-Security-Policy")
    assert "Python" not in (r.getheader("Server") or "")


@pytest.mark.parametrize("path", [
    "/.env", "/.git/config", "/serve.py", "/tests/test_serve.py", "/SECURITY_REPORT.md",
    "/fonts/", "/../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/..%2fserve.py",
    "/index.html%00.js", "/fonts\\..\\serve.py", "/nope",
])
def test_non_public_paths_are_404_with_headers(server, path):
    r, _ = req(server, "GET", path)
    assert r.status == 404
    assert r.getheader("Content-Security-Policy") == serve.CSP


def test_no_directory_listing(server):
    r, body = req(server, "GET", "/fonts/")
    assert r.status == 404 and b"Directory listing" not in body


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE"])
def test_only_get_and_head(server, method):
    r, _ = req(server, method, "/", body=b"x" * 10)
    assert r.status == 405 and r.getheader("Allow") == "GET, HEAD"
    assert r.getheader("X-Frame-Options") == "DENY"


def test_head_has_no_body(server):
    r, body = req(server, "HEAD", "/")
    assert r.status == 200 and body == b""


def test_query_string_is_ignored_and_not_reflected(server):
    r, body = req(server, "GET", "/?q=<script>alert(1)</script>")
    assert r.status == 200 and b"alert(1)" not in body


def test_huge_request_line_rejected(server):
    r, _ = req(server, "GET", "/" + "a" * 70000)
    assert r.status in (400, 414)


def test_binds_localhost_by_default():
    import argparse  # noqa: F401
    src = (ROOT / "serve.py").read_text()
    assert 'default="127.0.0.1"' in src


# ---------- front-end ----------
# Sin comentarios: los comentarios pueden *mencionar* patrones prohibidos.
HTML = re.sub(r"<!--.*?-->", "", (ROOT / "index.html").read_text(encoding="utf-8"), flags=re.S)
JS = re.sub(r"/\*.*?\*/|^\s*//.*$", "", (ROOT / "main.js").read_text(encoding="utf-8"), flags=re.S | re.M)


def test_meta_csp_is_strict():
    m = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', HTML)
    assert m
    csp = m.group(1)
    assert "script-src 'self'" in csp and "connect-src 'none'" in csp
    assert "unsafe-inline" not in csp and "unsafe-eval" not in csp


def test_no_inline_scripts_styles_or_handlers():
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", HTML)
    assert "<style" not in HTML
    assert not re.search(r"\sstyle=", HTML)
    assert not re.search(r"\son[a-z]+\s*=", HTML, re.I)


def test_only_same_origin_assets():
    for attr in re.findall(r'(?:src|href)="([^"]+)"', HTML):
        if attr.startswith(("http://", "https://")):
            continue  # enlaces de navegación, verificados abajo
        assert not attr.startswith("//")
    assert not re.search(r'<(?:script|link)[^>]+(?:src|href)="https?://', HTML)


def test_external_links_are_safe_and_documented():
    allowed = ("https://github.com/Hsoja", "https://hsoja.github.io/TradePro/")
    for tag in re.findall(r"<a\s[^>]*href=\"https?://[^\"]+\"[^>]*>", HTML):
        href = re.search(r'href="([^"]+)"', tag).group(1)
        assert href.startswith("https://") and href.startswith(allowed), href
        assert 'rel="noopener noreferrer"' in tag


@pytest.mark.parametrize("pattern", [
    r"\beval\s*\(", r"new\s+Function", r"innerHTML", r"outerHTML", r"insertAdjacentHTML",
    r"document\.write", r"\bfetch\s*\(", r"XMLHttpRequest", r"WebSocket", r"localStorage",
    r"sessionStorage", r"document\.cookie", r"setTimeout\s*\(\s*['\"]", r"postMessage",
])
def test_js_has_no_dangerous_sinks(pattern):
    assert not re.search(pattern, JS)


def test_server_csp_matches_headers_file():
    line = next(l for l in (ROOT / "_headers").read_text().splitlines() if "Content-Security-Policy:" in l)
    assert line.split(":", 1)[1].strip() == serve.CSP
