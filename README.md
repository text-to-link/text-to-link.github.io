# Text to Link

Free text to link generator: https://text-to-link.github.io/

HTML, Markdown, BBCode, reST, AsciiDoc, Slack, Textile and Org-mode links, text fragment (highlight) links,
tracking parameter removal, QR codes. Plain HTML, CSS and JavaScript, everything runs in the browser.
Installable as an app, works offline, accepts shared links on Android (`?url=&text=&title=&fmt=` also works by hand).

## Structure

| Path | Purpose |
| --- | --- |
| `src/layout.html` | page shell (head, header, footer, consent banner), shared by all pages and languages |
| `src/pages/home.html`, `src/pages/privacy.html` | page bodies |
| `src/i18n/<lang>.json` | translations (the build fails if the files differ in structure) |
| `src/sw.js` | service worker template, the build fills in the precache list |
| `build.py` | generates `index.html`, `privacy/index.html` and the same for each language, `404.html`, `sitemap.xml`, `robots.txt`, `sw.js` |
| `assets/core.js` | pure functions: URL normalisation, tracking removal, text fragments, formatters |
| `assets/app.js` | the tool UI |
| `assets/chrome.js` | theme, language menu, analytics consent and service worker registration on every page |
| `assets/qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), loaded on first use |
| `tools/make_assets.py` | renders favicon.ico, touch and maskable icons and og-image.png with headless Chromium |
| `tools/test.sh` | runs the browser tests (inside the Docker image) |
| `Dockerfile` | toolchain: Python, Chromium, pngquant |

The generated files are committed, GitHub Pages serves the repository root as is.

## Workflow

Everything that builds or tests runs in Docker, so you only need Docker and [just](https://github.com/casey/just).

```sh
just            # list recipes
just image      # build the toolchain image (the other recipes do it when needed)
just serve      # build and serve at http://localhost:8765/
just build      # regenerate pages after changing src/ or assets/
just assets     # re-render icons and og-image.png after changing favicon.svg or the OG design
just test       # unit tests + end-to-end tests in headless Chromium
just ci         # tests, then fail if the committed files differ from a fresh build
just watch      # rebuild and restart the server on changes (needs entr)
```

GitHub Actions runs the same build and tests on every push (`.github/workflows/ci.yml`). The build is
deterministic, so a pull request with stale generated files fails the check.

## Adding a language

1. Copy `src/i18n/en.json` to `src/i18n/<lang>.json` and translate it (keep `meta.lang` and `meta.locale` correct; use `"dir": "rtl"` for Arabic, Hebrew etc.).
2. Add the code to `LANGS` in `build.py`, add it to the `langs` list in `tests/e2e.html` and run `just build`.
3. Submit the new `sitemap.xml` in Google Search Console.

## Privacy

The tool never uploads what you type. Google Analytics is loaded in Consent Mode with storage denied until the
visitor accepts; the policy is in `src/i18n/*.json` under `privacy` and is published at `/privacy/`.
