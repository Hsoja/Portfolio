# Security Report

**Project:** Hsoja portfolio (static single page)
**Date:** 2026-11-10
**Scope:** `index.html`, `styles.css`, `main.js`, `fonts/`, `_headers`, `serve.py` (local server), tests, scripts and CI workflows.
**Verdict:** 🟡 **Approved with risks** (one low, accepted residual risk; see below).

## Owner requirements

Read-only page: no forms, no inputs, no passwords, no APIs, no photo of the owner and no precise location. Enforced by tests 10 and 11.

## Threat model (STRIDE, short)

The site is static: no server code, no accounts, no forms, no database, no secrets and no runtime network requests. The realistic threats are content injection (XSS through a future edit), loading third-party code, clickjacking, leaking personal data in the published files, and a compromised CI pipeline.

## Results by tool

| Check | Result |
| --- | --- |
| Front-end security tests (`node --test`, 11 tests, incl. read-only page: no forms, inputs, iframes, photos, location or device APIs) | ✅ Pass |
| Server + front-end tests (`pytest`, 51 tests: route allow-list, path traversal, `.env`/`.git` → 404, 405 on other methods, headers on errors, oversized request line) | ✅ Pass |
| Bandit (`serve.py`, medium+) | ✅ No issues |
| gitleaks (`dir`, working tree) | ✅ No leaks |
| gitleaks (`git`, full history) | ✅ No leaks (run before the first push and in CI) |
| `scripts/scan_exposed_files.sh` | ✅ OK |
| Manual search (password, token, api_key, secret, smtp, e-mails, phone numbers) | ✅ Nothing found |
| Semgrep (`p/javascript`, `p/python`, `p/secrets`) | ✅ No findings (GitHub Actions, run on every push) |
| `npm audit` | ➖ Not applicable (zero dependencies) |
| Browser check (Chromium, desktop and mobile) | ✅ No console errors or CSP violations |
| Anti-framing check (page loaded inside a foreign iframe) | ✅ Page hidden |
| OWASP ZAP (DAST) | ⚠️ Not verified |

## Backdoor review

- [x] The deployed site has no server code. `serve.py` is a local-only static server: explicit route allow-list (a new route fails the tests), GET/HEAD only, binds `127.0.0.1` by default, no query strings or IPs in logs, no `exec`/`subprocess`/network calls. Reviewed line by line.
- [x] No hard-coded credentials, tokens or "admin mode".
- [x] No `eval`, `new Function`, string timers, `innerHTML`, `document.write`.
- [x] No network calls (`fetch`, XHR, WebSocket, beacons); enforced by CSP `connect-src 'none'` and by tests.
- [x] No third-party scripts or CDNs; fonts are self-hosted woff2 files from `@fontsource` (OFL).
- [x] No new dependencies (no `package-lock.json`, no install scripts).
- [x] CI: `permissions: contents: read` by default, actions pinned by SHA, no `pull_request_target`; Pages write permission only in the deploy job.
- [x] No logs, binaries or minified files of unclear origin.
- [x] `.gitignore` covers `.env*`, `secrets/`, keys and build output.

## Findings

| ID | Severity | File | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | Low | `index.html` | `X-Content-Type-Options` was set in a `<meta>` tag, where browsers ignore it. | Removed from the meta; sent from `_headers` on hosts that support it. | Fixed |
| F-02 | Low | `index.html` | `frame-ancestors` cannot be set in a `<meta>` CSP, and GitHub Pages cannot send custom headers (clickjacking). | JavaScript guard hides the page inside foreign iframes; full headers in `_headers`. | Fixed (partial, see R-01) |
| F-03 | Info | CSP | `object-src` relied on `default-src` only. | Added `object-src 'none'` explicitly (page, `_headers` and `serve.py`). | Fixed |
| F-04 | Low | local use | `python -m http.server` sends no security headers, lists directories and serves any file (e.g. `.git`). | `serve.py` with an allow-list; documented as the way to run locally. | Fixed |

## Residual risks

- **R-01 (Low, accepted):** on GitHub Pages there is no `frame-ancestors`/`X-Frame-Options` header and no HSTS preload control. The anti-framing script mitigates it, and the page has no actions or data to steal. Moving to Cloudflare Pages or Netlify would apply `_headers` in full.
- **R-02 (Low):** the project previews are illustrations, not live data, so there is no data exposure.

## Not verified

- OWASP ZAP scan against the live site.
