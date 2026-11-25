# Hsoja · Portfolio

**A single-page personal portfolio with a light, warm, editorial design and a pixel-art chef as its mascot, built with plain HTML, CSS and JavaScript.**

Spanish-language site for Katherine González (Hsoja), a Software Engineering student looking for an internship. It tells the story in one scroll: hero, four featured projects written as mini case studies (problem → what I built → how I made it secure → results), about, learning, stack, goals and contact. No frameworks, no build step, no third-party scripts and no network requests at runtime.

🔗 **Live site:** https://hsoja.github.io/Portfolio/

![Portfolio hero: "Hola, soy Katherine" and "Software seguro, diseñado con intención." next to the pixel-art chef avatar](docs/hero.jpg)

## Features

- 🍳 **Personal brand**: the pixel-art chef avatar (an inline SVG built from rectangles), "ingredient" badges for the stack and "probado / escaneado / documentado" stamps.
- 🎨 **Light and tidy**: cream background, peach/coral accent, and one soft color per project (peach, sky, lilac, mint). Instrument Serif for headlines, Manrope for body text.
- 🧩 **Case studies, not identical cards**: every project has its own color, a CSS/SVG mockup (no images) and its stack as ingredient badges.
- 🌊 **Soft motion**: smooth scroll, fade-up reveals, 4 px card lift on hover, very subtle hero parallax, and a micro-interaction on the avatar. Only `transform` and `opacity` are animated, with one `requestAnimationFrame` loop that runs only while something moves.
- ♿ **Accessible**: WCAG 2.1 AA contrast (checked), semantic landmarks, skip link, visible focus, and a fully static version under `prefers-reduced-motion`. 0 axe-core violations on desktop and mobile.
- 📱 **Responsive**: mobile-first, from 360 px phones to wide screens.
- 🔐 **Secure static site**: see [Security](#security).

## Featured projects

| Project | What it is |
| --- | --- |
| [Operativa.ia](https://github.com/Hsoja/Operativa.ia) | Multi-user AI operations platform for small service businesses (FastAPI, React, TypeScript, Streamlit). In development. |
| [Gloz](https://github.com/Hsoja/Gloz) | Secure property search web app (Flask, SQLite, Argon2id). |
| [TradePro](https://github.com/Hsoja/TradePro) | Live market news and quotes portal (Astro, TypeScript). [Live site](https://hsoja.github.io/TradePro/). |
| Quant-lab | Separates facts verified in official filings (with exact citations) from simulated Monte Carlo scenarios. Links will be added when the repository is public. |

## Tech stack

| Layer | Technologies |
| --- | --- |
| Page | Semantic HTML, hand-written CSS (custom properties, no framework), vanilla JavaScript |
| Fonts | Self-hosted Instrument Serif, Manrope and JetBrains Mono (SIL OFL) |
| Local server | Python standard library (`http.server`), allow-listed routes |
| Testing & QA | Node's built-in test runner, pytest, Bandit, gitleaks, Semgrep |
| CI/CD | GitHub Actions with pinned action SHAs and read-only permissions, Dependabot, GitHub Pages |

## Project structure

```
├── index.html               The page (strict CSP in a <meta> tag)
├── serve.py                 Hardened local static server (not deployed)
├── styles.css               Design tokens, layout, mockups and the avatar palette
├── main.js                  Reveals, nav highlight, subtle parallax, avatar interaction
├── fonts/                   Self-hosted woff2 fonts
├── _headers                 Security headers for hosts that support them (Netlify, Cloudflare Pages)
├── robots.txt
├── tests/                   Security regression tests (node --test, pytest)
├── scripts/                 build.sh (copies public files to _site/), scan_exposed_files.sh
├── docs/                    Screenshot
├── .github/                 CI security pipeline, Pages deployment, Dependabot
└── SECURITY_REPORT.md       Latest audit results
```

## Run it locally

No dependencies are needed. Use the hardened local server (security headers, allow-listed files only, GET/HEAD only, bound to `127.0.0.1`):

```bash
git clone https://github.com/Hsoja/Portfolio.git
cd Portfolio
python3 serve.py                # then open http://127.0.0.1:8000
```

`python3 -m http.server` also works, but it sends no security headers and lists directories.

| Command | What it does |
| --- | --- |
| `npm test` | Run the front-end security regression tests |
| `python3 -m pytest -q` | Run the local server and front-end tests (needs `pytest`) |
| `npm run build` | Copy only the public files to `_site/` |
| `npm run verify` | Tests, build and the exposed-files check |

## Security

- **Strict Content Security Policy**: `default-src 'none'`, scripts and styles only from the same origin, `connect-src 'none'` (the page makes no network requests), no `unsafe-inline` or `unsafe-eval`.
- **No third-party code**: no CDNs, analytics, cookies or storage. Fonts are self-hosted.
- **No dangerous sinks**: no `eval`, `innerHTML` or `document.write`; dynamic values are set through the CSSOM.
- **Safe links**: every external link uses `rel="noopener noreferrer"` and points to an allow-listed host (GitHub, the TradePro Pages site and LinkedIn).
- **Clickjacking**: GitHub Pages cannot send `frame-ancestors`, so the page hides itself when loaded inside a foreign iframe. `_headers` sends the full header set on hosts that support it.
- **Regression tests** enforce all of the above on every push, alongside gitleaks (full history) and Semgrep in CI.
- Only the public files are deployed (to the `gh-pages` branch, after the tests pass); tests, scripts, docs and `serve.py` never reach the live site.

Details and results are in [SECURITY_REPORT.md](SECURITY_REPORT.md).

## License

[MIT](LICENSE). Fonts are licensed under the SIL Open Font License 1.1.

## Author

Built by [Hsoja](https://github.com/Hsoja).
