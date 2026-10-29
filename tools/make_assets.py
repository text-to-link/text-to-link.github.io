#!/usr/bin/env python3
"""Renders favicon.ico, apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png and og-image.png.

Needs google-chrome (headless) and favicon.svg. Run: python3 tools/make_assets.py
"""
import base64
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = os.environ.get("CHROME_BIN", "google-chrome")
ICON_SIZES = [16, 32, 48, 180, 192, 512]


def chrome(*args):
    return subprocess.run(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", *args],
        check=True, capture_output=True, text=True,
    ).stdout


def render_icons(svg_text, tmp):
    data_url = "data:image/svg+xml;base64," + base64.b64encode(svg_text.encode()).decode()
    page = tmp / "icons.html"
    page.write_text(f"""<!doctype html><meta charset="utf-8"><pre id="o"></pre><script>
const sizes = {json.dumps(ICON_SIZES)};
const img = new Image();
img.onload = () => {{
  const out = {{}};
  for (const s of sizes) {{
    const c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, s, s);
    out[s] = c.toDataURL('image/png');
  }}
  // maskable: the launcher crops to a circle or squircle, so the artwork stays inside the central 60%
  const m = document.createElement('canvas'); m.width = m.height = 512;
  const mx = m.getContext('2d'); mx.imageSmoothingQuality = 'high';
  mx.fillStyle = '#0b1117'; mx.fillRect(0, 0, 512, 512);
  mx.drawImage(img, 102, 102, 308, 308);
  out.maskable = m.toDataURL('image/png');
  document.getElementById('o').textContent = JSON.stringify(out);
}};
img.src = {json.dumps(data_url)};
</script>""", encoding="utf-8")
    dom = chrome("--virtual-time-budget=4000", "--dump-dom", page.as_uri())
    raw = re.search(r'<pre id="o">(.*?)</pre>', dom, re.S).group(1)
    urls = json.loads(raw.replace("&quot;", '"'))
    return {(k if k == "maskable" else int(k)): base64.b64decode(v.split(",", 1)[1]) for k, v in urls.items()}


def write_ico(path, pngs):
    """ICO container with embedded PNG images."""
    head = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b"", b""
    for size, png in pngs:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(png), offset + len(blobs))
        blobs += png
    path.write_bytes(head + entries + blobs)


def og_html(svg_text):
    icon_path = re.search(r'<path d="([^"]+)"', svg_text).group(1)
    return f"""<!doctype html><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
body{{width:1200px;height:630px;overflow:hidden;color:#e6edf3;font-family:"Segoe UI","Noto Sans","Helvetica Neue",Arial,sans-serif;
background:radial-gradient(900px 500px at 85% 20%,rgba(38,218,253,.22),transparent 60%),radial-gradient(700px 400px at 0% 100%,rgba(38,218,253,.10),transparent 60%),#0b1117;position:relative}}
.grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(38,218,253,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(38,218,253,.07) 1px,transparent 1px);background-size:48px 48px}}
.left{{position:absolute;left:80px;top:96px;width:700px}}
.chip{{display:inline-block;padding:8px 18px;border:1px solid rgba(38,218,253,.5);color:#26dafd;font-size:22px;letter-spacing:.14em;text-transform:uppercase;border-radius:4px}}
h1{{font-size:116px;line-height:1.02;margin-top:36px;font-weight:800;letter-spacing:-.02em}}
h1 span{{display:block;color:#26dafd;text-shadow:0 0 36px rgba(38,218,253,.55)}}
.tags{{position:absolute;left:80px;bottom:84px;display:flex;gap:14px}}
.tags b{{font-weight:600;font-size:26px;padding:10px 20px;border-radius:6px;background:rgba(38,218,253,.08);border:1px solid rgba(38,218,253,.3)}}
.domain{{position:absolute;left:80px;bottom:34px;font-size:24px;color:#8b98a5}}
.frame{{position:absolute;right:90px;top:130px;width:320px;height:320px;display:grid;place-items:center}}
.frame i{{position:absolute;width:56px;height:56px;border:5px solid #26dafd;filter:drop-shadow(0 0 10px #26dafd)}}
.frame i:nth-child(1){{left:0;top:0;border-right:0;border-bottom:0}}
.frame i:nth-child(2){{right:0;bottom:0;border-left:0;border-top:0}}
.frame svg{{width:190px;height:190px;filter:drop-shadow(0 0 22px rgba(38,218,253,.8))}}
</style>
<div class="grid"></div>
<div class="left"><span class="chip">Free · No sign-up · In your browser</span><h1>Text to Link<span>Generator</span></h1></div>
<div class="frame"><i></i><i></i><svg viewBox="0 0 16 16"><path fill="#26dafd" d="{icon_path}"/></svg></div>
<div class="tags"><b>HTML</b><b>Markdown</b><b>BBCode</b><b>Highlight links</b><b>QR</b></div>
<div class="domain">text-to-link.github.io</div>"""


def shrink(path):
    """Palette-quantizes a PNG with pngquant (the OG image is ~300 KB otherwise); skipped when it is not installed."""
    if not shutil.which("pngquant"):
        print("pngquant not found, leaving", path.name, "as is")
        return
    subprocess.run(["pngquant", "--force", "--skip-if-larger", "--quality=70-95", "--output", str(path), str(path)],
                   check=False)


def main():
    svg_text = (ROOT / "favicon.svg").read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        icons = render_icons(svg_text, tmp)
        (ROOT / "apple-touch-icon.png").write_bytes(icons[180])
        (ROOT / "icon-192.png").write_bytes(icons[192])
        (ROOT / "icon-512.png").write_bytes(icons[512])
        (ROOT / "icon-maskable-512.png").write_bytes(icons["maskable"])
        write_ico(ROOT / "favicon.ico", [(s, icons[s]) for s in (16, 32, 48)])

        page = tmp / "og.html"
        page.write_text(og_html(svg_text), encoding="utf-8")
        chrome("--window-size=1200,630", f"--screenshot={ROOT / 'og-image.png'}", page.as_uri())
    shrink(ROOT / "og-image.png")
    print("wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, og-image.png")


if __name__ == "__main__":
    main()
