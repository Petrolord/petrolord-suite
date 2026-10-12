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
