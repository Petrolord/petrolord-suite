"""Booth QR codes for the NAPE lead form (petrolord.com/nape).

Writes SVG (for print) and PNG (for screens and quick checks) for:
  nape-qr.svg / .png        https://petrolord.com/nape?src=qr      (posters, roll-ups, flyers)
  nape-tablet.svg / .png    https://petrolord.com/nape?src=tablet  (the booth tablet's home screen)
  nape-quiz.svg / .png      https://petrolord.com/nape/quiz        (the Petrolord Upstream Challenge; the
                            SVG is also copied to public/event/nape-quiz-qr.svg for the TV and lobby)

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
    "nape-quiz": "https://petrolord.com/nape/quiz",
}
PUBLIC = HERE.parent.parent / "public" / "event"

for name, url in TARGETS.items():
    qr = segno.make(url, error="h")
    qr.save(HERE / f"{name}.svg", scale=10, border=4, dark="#0b1f2a", light="#ffffff")
    qr.save(HERE / f"{name}.png", scale=20, border=4, dark="#0b1f2a", light="#ffffff")
    print(f"{name}: version {qr.version}, {qr.symbol_size(scale=1, border=4)[0]} modules with the quiet zone, {url}")

PUBLIC.mkdir(parents=True, exist_ok=True)
(PUBLIC / "nape-quiz-qr.svg").write_bytes((HERE / "nape-quiz.svg").read_bytes())
