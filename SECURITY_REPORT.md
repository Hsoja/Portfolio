# Security Report

**Project:** Hsoja portfolio (static single page)
**Date:** 2026-11-24 (minimal redesign, light theme)
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
| Server + front-end tests (`pytest`, 51 tests, all passing: route allow-list, path traversal, `.env`/`.git` → 404, 405 on other methods, headers on errors, oversized request line) | ✅ Pass |
| Bandit (`serve.py`, medium+) | ✅ No issues (re-run 2026-11-24) |
| gitleaks (`dir`, working tree) | ⚠️ Not run locally for this redesign (binary unavailable); replaced by the manual search below; full-history scan runs in CI |
| gitleaks (`git`, full history) | ✅ No leaks at the last full run (2026-11-10); runs again in CI on every push and PR |
| `scripts/scan_exposed_files.sh` | ✅ OK |
| Manual search (password, token, api_key, secret, smtp, e-mails, phone numbers) | ✅ Nothing found |
| Semgrep (`p/javascript`, `p/python`, `p/secrets`) | ⚠️ Not verified locally for this redesign (rules need network); runs in GitHub Actions on every push and PR |
| `npm audit` | ➖ Not applicable (zero dependencies) |
| Browser check (Chrome, 1360 px and 390 px) | ✅ No console errors or CSP violations; no horizontal overflow |
| Accessibility (axe-core, WCAG 2.0/2.1 A + AA + best practices, desktop and mobile) | ✅ 0 violations |
| Contrast (WCAG ratio computed for every text/background pair in the palette) | ✅ All pairs ≥ 4.5:1 (lowest 4.98:1) |
| `prefers-reduced-motion` emulation | ✅ Content visible, no transitions or animations, smooth scroll off |
| Anti-framing check (page loaded inside a foreign iframe) | ✅ Page hidden |
| OWASP ZAP (DAST) | ⚠️ Not verified |

## Backdoor review

- [x] The deployed site has no server code. `serve.py` is a local-only static server: explicit route allow-list (a new route fails the tests), GET/HEAD only, binds `127.0.0.1` by default, no query strings or IPs in logs, no `exec`/`subprocess`/network calls. Reviewed line by line.
- [x] No hard-coded credentials, tokens or "admin mode".
- [x] No `eval`, `new Function`, string timers, `innerHTML`, `document.write`.
- [x] No network calls (`fetch`, XHR, WebSocket, beacons); enforced by CSP `connect-src 'none'` and by tests.
- [x] No third-party scripts or CDNs; fonts are self-hosted woff2 files from `@fontsource` (OFL).
- [x] No new dependencies (no `package-lock.json`, no install scripts).
- [x] CI: `permissions: contents: read` by default, actions pinned by SHA, no `pull_request_target`; `contents: write` only in the deploy job, which pushes fast-forward commits to `gh-pages` after the tests pass (no force push).
- [x] Live site checked: only `index.html`, `styles.css`, `main.js`, `robots.txt`, `.nojekyll` and `fonts/` are published; the CSP blocks network requests on the live page.
- [x] No logs, binaries or minified files of unclear origin.
- [x] Redesign diff reviewed line by line: the only new external host is `www.linkedin.com`, as a plain navigation link (`rel="noopener noreferrer"`, allow-listed in both test suites). No new scripts, dependencies, network calls, storage, forms, images or inline styles. The avatar and every project mockup are inline SVG/CSS; the favicon is a `data:` SVG.
- [x] The page still shows no city, address, e-mail or phone number (tests 8 and 11).
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
- **R-02 (Low):** the project previews are illustrations built with CSS/SVG, not live data, and contain no figures, so there is no data exposure.
- **R-03 (Info):** the LinkedIn profile link and the Operativa.ia, Gloz and TradePro repository links were not opened from the audit environment (outbound access blocked); they match the links already published on the previous version of the site, except LinkedIn, which is new.
- **R-04 (Info):** the Quant-lab card shows no links on purpose, since its repository is not public. Add them only after the checklist before making a repository public.

## Not verified

- OWASP ZAP scan against the live site.
