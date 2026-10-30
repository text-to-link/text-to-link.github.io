#!/usr/bin/env python3
"""Generates the static pages (home and privacy, one per language), 404.html,
sitemap.xml, robots.txt and the service worker sw.js.

Usage: python3 build.py

Sources: src/layout.html + src/pages/*.html + src/i18n/<lang>.json + src/sw.js.
The output is plain HTML committed to the repository root, so GitHub Pages
serves it as is. The build is deterministic: the same sources give the same files.
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_URL = "https://text-to-link.github.io"
LANGS = ["en", "uk", "es", "pt", "de", "fr", "pl"]  # the first one is the default (x-default, served at /)
PLACEHOLDER = re.compile(r"\{\{([\w.]+)\}\}")
PAGES = ["home", "privacy"]
PAGE_DIRS = {"home": "", "privacy": "privacy/"}
PRIVACY_UPDATED = "2026-10-29"
# plain-text placeholders, escaped on output (all other injected values are ready-made markup)
PLAIN = {"page_url", "site_url", "home", "privacy_href", "page_title", "page_description", "privacy_updated"}


def lang_path(lang, page="home"):
    base = "/" if lang == LANGS[0] else f"/{lang}/"
    return base + PAGE_DIRS[page]


def lang_url(lang, page="home"):
    return SITE_URL + lang_path(lang, page)


def esc(value):
    return html.escape(str(value), quote=True)


def file_hash(rel):
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]


def flat_keys(obj, prefix=""):
    """Key paths of a translation file, to check that all languages match."""
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys |= flat_keys(v, f"{prefix}{k}.")
    elif isinstance(obj, list):
        keys.add(f"{prefix}[{len(obj)}]")
    else:
        keys.add(prefix.rstrip("."))
    return keys


def load_translations():
    data = {}
    for lang in LANGS:
        data[lang] = json.loads((ROOT / "src" / "i18n" / f"{lang}.json").read_text(encoding="utf-8"))
    base = flat_keys(data[LANGS[0]])
    ok = True
    for lang in LANGS[1:]:
        keys = flat_keys(data[lang])
        for missing in sorted(base - keys):
            print(f"[{lang}] missing or different: {missing}", file=sys.stderr)
            ok = False
        for extra in sorted(keys - base):
            print(f"[{lang}] extra: {extra}", file=sys.stderr)
            ok = False
    if not ok:
        sys.exit("Translation files are out of sync")
    return data


FEATURES = {
    "en": [
        "HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile and Org-mode links",
        "Text fragment (highlight) links",
        "Tracking parameter removal",
        "QR code generator",
    ],
    "uk": [
        "Посилання HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile та Org-mode",
        "Посилання на виділений текст",
        "Видалення параметрів трекінгу",
        "Генератор QR-кодів",
    ],
    "es": [
        "Enlaces HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile y Org-mode",
        "Enlaces a texto resaltado",
        "Eliminación de parámetros de seguimiento",
        "Generador de códigos QR",
    ],
    "pt": [
        "Links HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile e Org-mode",
        "Links para texto destacado",
        "Remoção de parâmetros de rastreamento",
        "Gerador de códigos QR",
    ],
    "de": [
        "HTML-, Markdown-, BBCode-, reStructuredText-, AsciiDoc-, Slack-, Textile- und Org-Mode-Links",
        "Links zu hervorgehobenem Text",
        "Entfernung von Tracking-Parametern",
        "QR-Code-Generator",
    ],
    "fr": [
        "Liens HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile et Org-mode",
        "Liens vers du texte surligné",
        "Suppression des paramètres de suivi",
        "Générateur de codes QR",
    ],
    "pl": [
        "Linki HTML, Markdown, BBCode, reStructuredText, AsciiDoc, Slack, Textile i Org-mode",
        "Linki do wyróżnionego tekstu",
        "Usuwanie parametrów śledzenia",
        "Generator kodów QR",
    ],
}


def build_jsonld(t, lang):
    graph = [
        {
            "@type": "WebApplication",
            "@id": lang_url(lang) + "#app",
            "name": "Text to Link",
            "url": lang_url(lang),
            "description": t["meta"]["description"],
            "applicationCategory": "UtilitiesApplication",
            "operatingSystem": "Any",
            "browserRequirements": "Requires JavaScript",
            "inLanguage": t["meta"]["lang"],
            "image": SITE_URL + "/og-image.png",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
            "featureList": FEATURES.get(lang, FEATURES["en"]),
        },
        {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": item["q"],
                    "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
                }
                for item in t["faq"]
            ],
        },
    ]
    text = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)
    return text.replace("</", "<\\/")


def build_fragments(data, lang, page):
    t = data[lang]
    frags = {}

    frags["hreflang_links"] = "\n".join(
        [f'<link rel="alternate" hreflang="{l}" href="{lang_url(l, page)}">' for l in LANGS]
        + [f'<link rel="alternate" hreflang="x-default" href="{lang_url(LANGS[0], page)}">']
    )
    frags["og_locale_alternates"] = "\n".join(
        f'<meta property="og:locale:alternate" content="{data[l]["meta"]["locale"]}">'
        for l in LANGS if l != lang
    )

    def lang_link(l):
        current = ' aria-current="page"' if l == lang else ""
        return f'<a href="{lang_path(l, page)}" hreflang="{l}" lang="{l}"{current}>{esc(data[l]["meta"]["native"])}</a>'

    frags["lang_menu_items"] = "\n".join(f"          <li>{lang_link(l)}</li>" for l in LANGS)
    frags["lang_footer_items"] = "\n".join(f"      <li>{lang_link(l)}</li>" for l in LANGS)

    frags["how_items"] = "\n".join(
        f"      <li><div><strong>{esc(i['t'])}</strong><span>{esc(i['d'])}</span></div></li>" for i in t["how"]
    )
    frags["about_paragraphs"] = "\n".join(f"    <p>{esc(p)}</p>" for p in t["about"])
    frags["hl_paragraphs"] = "\n".join(f"    <p>{esc(p)}</p>" for p in t["hl_text"])
    frags["faq_items"] = "\n".join(
        f'    <details class="faq-item"><summary>{esc(i["q"])}</summary><p>{esc(i["a"])}</p></details>'
        for i in t["faq"]
    )
    frags["privacy_sections"] = "\n".join(
        f"    <h2>{esc(sec['h'])}</h2>\n" + "\n".join(f"    <p>{esc(p)}</p>" for p in sec["p"])
        for sec in t["privacy"]["sections"]
    )
    return frags


def render(template, data, lang, versions, page, extra=None):
    t = data[lang]
    raw = build_fragments(data, lang, page)
    raw.update({
        "page_url": lang_url(lang, page),
        "site_url": SITE_URL,
        "home": lang_path(lang),
        "privacy_href": lang_path(lang, "privacy"),
        "privacy_updated": PRIVACY_UPDATED,
        **versions,
        **(extra or {}),
    })

    def sub(match):
        key = match.group(1)
        if key in raw:
            return esc(raw[key]) if key in PLAIN else raw[key]
        node = t
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                raise KeyError(f"[{lang}] unknown placeholder {{{{{key}}}}}")
            node = node[part]
        return esc(node)

    return PLACEHOLDER.sub(sub, template)


def render_page(layout, pages, data, lang, versions, page):
    t = data[lang]
    if page == "home":
        meta = {"page_title": t["meta"]["title"], "page_description": t["meta"]["description"]}
        jsonld = '<script type="application/ld+json">' + build_jsonld(t, lang) + "</script>"
        i18n = json.dumps(t["js"], ensure_ascii=False).replace("</", "<\\/")
        scripts = (
            f"<script>window.TTL_I18N = {i18n};</script>\n"
            f'<script src="/assets/core.js?v={versions["core_v"]}"></script>\n'
            f'<script src="/assets/app.js?v={versions["app_v"]}"></script>'
        )
    else:
        meta = {"page_title": t["privacy"]["title"], "page_description": t["privacy"]["description"]}
        jsonld = ""
        scripts = ""
    main = render(pages[page], data, lang, versions, page)
    return render(layout, data, lang, versions, page, {**meta, "main": main, "jsonld_block": jsonld, "scripts": scripts})


def build_sw(versions):
    """Service worker: precaches the pages and assets of this build, network first at runtime."""
    precache = [lang_path(l, p) for l in LANGS for p in PAGES]
    precache += [
        f"/assets/style.css?v={versions['css_v']}",
        f"/assets/chrome.js?v={versions['chrome_v']}",
        f"/assets/core.js?v={versions['core_v']}",
        f"/assets/app.js?v={versions['app_v']}",
        f"/assets/qrcode.js?v={versions['qr_v']}",
        "/favicon.svg",
    ]
    version = hashlib.md5("".join(precache).encode()).hexdigest()[:8]
    text = (ROOT / "src" / "sw.js").read_text(encoding="utf-8")
    return text.replace("__VERSION__", version).replace("__PRECACHE__", json.dumps(precache, indent=2))


def build_404(versions):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found – Text to Link</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script>try{{var t=localStorage.getItem('ttl-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<link rel="stylesheet" href="/assets/style.css?v={versions['css_v']}">
</head>
<body>
<main class="wrap center-page">
  <h1>404</h1>
  <p class="lead">This page does not exist.</p>
  <p><a class="btn btn-primary" href="/">Text to Link Generator</a></p>
</main>
</body>
</html>
"""


def build_sitemap():
    urls = []
    for page in PAGES:
        for lang in LANGS:
            alternates = "\n".join(
                f'    <xhtml:link rel="alternate" hreflang="{l}" href="{lang_url(l, page)}"/>' for l in LANGS
            )
            alternates += (
                f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{lang_url(LANGS[0], page)}"/>'
            )
            urls.append(f"  <url>\n    <loc>{lang_url(lang, page)}</loc>\n{alternates}\n  </url>")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(urls) + "\n</urlset>\n"
    )


def main():
    data = load_translations()
    layout = (ROOT / "src" / "layout.html").read_text(encoding="utf-8")
    pages = {p: (ROOT / "src" / "pages" / f"{p}.html").read_text(encoding="utf-8") for p in PAGES}
    versions = {
        "css_v": file_hash("assets/style.css"),
        "chrome_v": file_hash("assets/chrome.js"),
        "core_v": file_hash("assets/core.js"),
        "app_v": file_hash("assets/app.js"),
        "qr_v": file_hash("assets/qrcode.js"),
    }

    for lang in LANGS:
        for page in PAGES:
            out = ROOT / lang_path(lang, page).strip("/") / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(render_page(layout, pages, data, lang, versions, page), encoding="utf-8")
            print("wrote", out.relative_to(ROOT))

    (ROOT / "404.html").write_text(build_404(versions), encoding="utf-8")
    (ROOT / "sitemap.xml").write_text(build_sitemap(), encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8"
    )
    (ROOT / "sw.js").write_text(build_sw(versions), encoding="utf-8")
    print("wrote 404.html, sitemap.xml, robots.txt, sw.js")


if __name__ == "__main__":
    main()
