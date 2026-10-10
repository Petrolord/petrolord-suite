# NAPE booth QR codes

| File | Opens | Use |
|---|---|---|
| `nape-qr.svg` / `.png` | https://petrolord.com/nape?src=qr | posters, roll-up banners, flyers, table cards |
| `nape-tablet.svg` / `.png` | https://petrolord.com/nape?src=tablet | the booth tablet: after each lead it shows "Next visitor" and does not jump to WhatsApp |

Print the **SVG**: it scales without blur.
- **At least 15 cm square** on a banner, so it scans from 1 to 2 m.
- **At least 4 cm** on a table card or flyer, which is read at arm's length.
- Keep the white border (the quiet zone) and print dark on white.
- Error correction is H, so a small logo sticker in the centre (under 15 percent of the area) still scans.

Both codes were checked by decoding the PNGs. Regenerate with `python tools/nape/make_qr.py`; the header of that script says how.
