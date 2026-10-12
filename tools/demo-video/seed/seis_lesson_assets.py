# Lesson files for "Seismic Interpretation with Petrolord" that are not in the
# Ekene kit. Writes EKENE3D-v4-vendor.sgy: the v4 small cube (IEEE, 4 ms, bytes
# 189/193, in time) under a textual header copied from another job, which
# claims PSDM, 2 ms, IBM float and bytes 9/21 (lessons A1 and A2).
# python3 -I seis_lesson_assets.py <ekene-demo-v4 kit dir> <out dir>
import os, sys

kit, out = sys.argv[1], sys.argv[2]
src = os.path.join(kit, '04-seismic', 'EKENE3D-v4-small.sgy')
b = bytearray(open(src, 'rb').read())
lines = [
    'CLIENT Petrolord Demonstration Data',
    'SURVEY EKENE 3D 2024 REPROCESSING PSDM - SYNTHETIC DEMO DATA',
    'AREA Block EK-11 (fictional acreage)  Nigeria (fictional offshore)',
    'CRS EPSG:32632 WGS 84 / UTM zone 32N',
    'BIN 25 M X 25 M   INLINE AZIMUTH 20 DEG',
    'INLINE RANGE 1001 TO 1128',
    'CROSSLINE RANGE 1960 TO 2127',
    'SAMPLES 1751  INTERVAL 2 MS',
    'FORMAT IBM FLOAT  4 BYTE',
    'BYTE POSITIONS INLINE 9  CROSSLINE 21  CDPX 181  CDPY 185  SCALAR 71',
    'POLARITY SEG NORMAL - IMPEDANCE INCREASE IS A PEAK',
    'DATUM MEAN SEA LEVEL',
    'PROCESSING PRE STACK DEPTH MIGRATION',
    '',
    'LESSON FILE: THIS HEADER WAS COPIED FROM AN OLDER JOB AND IS WRONG.',
    'THE TRACES ARE THE EKENE 3D V4 SMALL CUBE, IN TIME.',
    'IT IS NOT DATA FROM ANY REAL FIELD.',
]
text = ''.join((('C%2d ' % (i + 1)) + (lines[i] if i < len(lines) else '')).ljust(80)[:80] for i in range(40))
assert len(text) == 3200
b[:3200] = text.encode('cp037')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'EKENE3D-v4-vendor.sgy'), 'wb').write(b)
print('wrote', os.path.join(out, 'EKENE3D-v4-vendor.sgy'))

# ---- the 2D line (lesson F18) ----
import struct
full = open(os.path.join(kit, '04-seismic', 'EKENE3D-v4-full.sgy'), 'rb').read()
ns = struct.unpack('>H', full[3220:3222])[0]
tl = 240 + ns * 4
ntr = (len(full) - 3600) // tl
idx = {}
for k in range(ntr):
    h = full[3600 + k * tl:3600 + k * tl + 240]
    il, xl = struct.unpack('>i', h[188:192])[0], struct.unpack('>i', h[192:196])[0]
    idx[(il, xl)] = k
# three legs, inline/crossline vertices: south-west to the crest, along strike, out east
legs = [(1010, 1975), (1054, 2035), (1100, 2060), (1120, 2120)]
pts = []
for (a, b), (c, e) in zip(legs, legs[1:]):
    n = int(max(abs(c - a), abs(e - b)) * 2)
    for i in range(n):
        f = i / n
        pts.append((round(a + f * (c - a)), round(b + f * (e - b))))
pts.append(legs[-1])
txt = ['CLIENT Petrolord Demonstration Data',
       'LINE EKENE-2D-L1  2D LINE CUT FROM EKENE 3D V4 FULL STACK - SYNTHETIC',
       'CRS EPSG:32632 WGS 84 / UTM zone 32N',
       'CDP BYTE 21  CDPX 181  CDPY 185  SCALAR 71 (VALUE -100)',
       'SAMPLES %d  INTERVAL 4 MS  FORMAT IBM FLOAT' % ns,
       'IT IS NOT DATA FROM ANY REAL FIELD.']
th = ''.join((('C%2d ' % (i + 1)) + (txt[i] if i < len(txt) else '')).ljust(80)[:80] for i in range(40))
out2 = bytearray(th.encode('cp037')) + bytearray(full[3200:3600])
for cdp, (il, xl) in enumerate(pts, start=1):
    k = idx[(il, xl)]
    h = bytearray(full[3600 + k * tl:3600 + k * tl + 240])
    struct.pack_into('>i', h, 0, cdp)      # tracl
    struct.pack_into('>i', h, 4, cdp)      # tracr
    struct.pack_into('>i', h, 8, 1)        # fldr
    struct.pack_into('>i', h, 20, cdp)     # cdp
    struct.pack_into('>i', h, 188, 0)      # no 3D inline
    struct.pack_into('>i', h, 192, 0)      # no 3D crossline
    out2 += h + full[3600 + k * tl + 240:3600 + (k + 1) * tl]
open(os.path.join(out, 'EKENE-2D-L1.sgy'), 'wb').write(out2)
print('wrote', os.path.join(out, 'EKENE-2D-L1.sgy'), len(pts), 'traces')
