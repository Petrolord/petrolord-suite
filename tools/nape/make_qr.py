"""Booth QR codes for the NAPE lead form (petrolord.com/nape).

Writes SVG (for print) and PNG (for screens and quick checks) for:
  nape-qr.svg / .png        https://petrolord.com/nape?src=qr      (posters, roll-ups, flyers)
  nape-tablet.svg / .png    https://petrolord.com/nape?src=tablet  (the booth tablet's home screen)

Development tool only; it adds no runtime dependency to the Suite.
  python3 -m venv /tmp/qr && /tmp/qr/bin/pip install segno==1.6.1
  /tmp/qr/bin/python tools/nape/make_qr.py
Error correction H (30 percent) so a logo sticker or a scuffed print still scans.
"""
from pathlib import Path

import segno

HERE = Path(__file__).resolve().parent
TARGETS = {
    "nape-qr": "https://petrolord.com/nape?src=qr",
    "nape-tablet": "https://petrolord.com/nape?src=tablet",
}

for name, url in TARGETS.items():
    qr = segno.make(url, error="h")
    qr.save(HERE / f"{name}.svg", scale=10, border=4, dark="#0b1f2a", light="#ffffff")
    qr.save(HERE / f"{name}.png", scale=20, border=4, dark="#0b1f2a", light="#ffffff")
    print(f"{name}: version {qr.version}, {qr.symbol_size(scale=1, border=4)[0]} modules with the quiet zone, {url}")
