"""Golden extraction via segyio (the independent oracle).

Reads the fixture SEG-Ys written by generate_segy.py with segyio — a
completely separate implementation from both the generator and the app's
JS decoder — and emits the golden files that jest tests consume:

  test-data/seismolord/goldens/<volume>.json   decode + geometry goldens
  test-data/seismolord/surfaces/dome_surface.xyz|_cps3.dat|_zmap.dat
  test-data/seismolord/surfaces/dome_surface_meta.json (incl. GRV truth)

Trace sample values are emitted as exact float32-representable JSON
numbers: JS asserts Math.fround(x) === x and compares bit patterns.

Run: tools/validation/seismolord/.venv/bin/python extract_goldens.py
"""
import base64
import hashlib
import json
import pathlib

import numpy as np
import segyio

import model

REPO = pathlib.Path(__file__).resolve().parents[3]
SEGY_DIR = REPO / 'test-data' / 'seismolord' / 'segy'
GOLD_DIR = REPO / 'test-data' / 'seismolord' / 'goldens'
SURF_DIR = REPO / 'test-data' / 'seismolord' / 'surfaces'


def f32(x) -> float:
    """Exact double representation of a float32 (JSON round-trip safe)."""
    return float(np.float32(x))


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def array_blob(a: np.ndarray) -> dict:
    """float32 little-endian base64 blob with shape + checksum."""
    raw = np.ascontiguousarray(a, dtype='<f4').tobytes()
    return {
        'dtype': 'float32le',
        'shape': list(a.shape),
        'sha256': sha256_bytes(raw),
        'base64': base64.b64encode(raw).decode('ascii'),
    }


def array_blob64(a: np.ndarray) -> dict:
    """float64 blob — world coordinates lose cm precision in float32."""
    raw = np.ascontiguousarray(a, dtype='<f8').tobytes()
    return {
        'dtype': 'float64le',
        'shape': list(a.shape),
        'sha256': sha256_bytes(raw),
        'base64': base64.b64encode(raw).decode('ascii'),
    }


def extract_volume(spec: model.VolumeSpec) -> dict:
    path = SEGY_DIR / f'{spec.name}.sgy'
    file_sha = sha256_bytes(path.read_bytes())

    with segyio.open(str(path), iline=spec.il_byte, xline=spec.xl_byte) as f:
        ilines = [int(v) for v in f.ilines]
        xlines = [int(v) for v in f.xlines]
        assert ilines == list(range(
            spec.il0, spec.il0 + spec.n_il * spec.il_step, spec.il_step)), ilines
        assert xlines == list(range(
            spec.xl0, spec.xl0 + spec.n_xl * spec.xl_step, spec.xl_step)), xlines
        assert len(f.samples) == spec.ns
        dt_us = int(segyio.tools.dt(f))
        assert dt_us == spec.dt_us, dt_us

        cube = segyio.tools.cube(f).astype(np.float32)   # (n_il, n_xl, ns)

        # corner + centre world coordinates from trace headers
        def coords_at(trace_index: int) -> dict:
            h = f.header[trace_index]
            scalar = h[segyio.TraceField.SourceGroupScalar]
            div = abs(scalar) if scalar < 0 else 1
            mul = scalar if scalar > 0 else 1
            return {
                'scalar': int(scalar),
                'x': h[segyio.TraceField.CDP_X] * mul / div,
                'y': h[segyio.TraceField.CDP_Y] * mul / div,
            }

        n_traces = spec.n_il * spec.n_xl
        corner_indices = {
            'first': 0,
            'last_xline_of_first_inline': spec.n_xl - 1,
            'first_xline_of_last_inline': n_traces - spec.n_xl,
            'last': n_traces - 1,
        }
        corners = {k: coords_at(v) for k, v in corner_indices.items()}

        # full header-coordinate grids: every trace's scaled CDP X/Y as
        # segyio reads them (independent of the generator's write path)
        sc = f.attributes(segyio.TraceField.SourceGroupScalar)[:].astype(np.float64)
        cx = f.attributes(segyio.TraceField.CDP_X)[:].astype(np.float64)
        cy = f.attributes(segyio.TraceField.CDP_Y)[:].astype(np.float64)
        div = np.where(sc < 0, np.abs(sc), 1.0)
        mul = np.where(sc > 0, sc, 1.0)
        coord_x = (cx * mul / div).reshape(spec.n_il, spec.n_xl)
        coord_y = (cy * mul / div).reshape(spec.n_il, spec.n_xl)

    # golden traces: 4 corners of the survey + centre + 3 fixed interior picks
    picks = [
        (0, 0), (0, spec.n_xl - 1), (spec.n_il - 1, 0),
        (spec.n_il - 1, spec.n_xl - 1),
        (spec.n_il // 2, spec.n_xl // 2),
        (3, 7), (spec.n_il // 4, spec.n_xl - 2), (spec.n_il - 2, 5),
    ]
    traces = [{
        'il': spec.il0 + i * spec.il_step,
        'xl': spec.xl0 + j * spec.xl_step,
        'samples': [f32(v) for v in cube[i, j]],
    } for i, j in picks]

    mid_il = spec.n_il // 2
    mid_xl = spec.n_xl // 2
    mid_t = int(round(model.T_CREST_MS / (spec.dt_us / 1000.0)))  # slice at crest

    stats = {
        'min': f32(cube.min()),
        'max': f32(cube.max()),
        'mean': float(cube.astype(np.float64).mean()),
        'rms': float(np.sqrt((cube.astype(np.float64) ** 2).mean())),
    }

    dome = model.dome_twt_ms(spec)

    return {
        'file': f'segy/{spec.name}.sgy',
        'file_sha256': file_sha,
        'sample_format': spec.sample_format,
        'geometry': {
            'n_il': spec.n_il, 'n_xl': spec.n_xl, 'ns': spec.ns,
            'dt_us': spec.dt_us,
            'ilines': [spec.il0, spec.il0 + (spec.n_il - 1) * spec.il_step],
            'xlines': [spec.xl0, spec.xl0 + (spec.n_xl - 1) * spec.xl_step],
            'il_step': spec.il_step, 'xl_step': spec.xl_step,
            'il_byte': spec.il_byte, 'xl_byte': spec.xl_byte,
            'coord_scalar': spec.coord_scalar,
            'bin_m': spec.bin_m,
            'il_bin_m': spec.bin_m if spec.il_bin_m is None else spec.il_bin_m,
            'azimuth_deg': spec.azimuth_deg,
            'lying_textual_header': spec.lying_header,
            'poison_at_189_193': model.POISON_ILXL if spec.lying_header else None,
        },
        'affine_truth': model.affine_truth(spec),
        'coord_grids': {
            'x': array_blob64(coord_x),
            'y': array_blob64(coord_y),
        },
        'corner_coords': corners,
        'traces': traces,
        'slices': {
            'inline': {'il': spec.il0 + mid_il * spec.il_step,
                       **array_blob(cube[mid_il])},
            'xline': {'xl': spec.xl0 + mid_xl * spec.xl_step,
                      **array_blob(cube[:, mid_xl])},
            'time': {'sample_index': mid_t, **array_blob(cube[:, :, mid_t])},
        },
        'stats': stats,
        'dome_truth_twt_ms': {
            'crest_ms': model.T_CREST_MS,
            'relief_ms': model.T_RELIEF_MS,
            'flat_event_ms': model.T_FLAT_MS,
            'ricker_hz': model.RICKER_HZ,
            **array_blob(dome.astype(np.float32)),
        },
    }


# ---------------------------------------------------------------------------
# Surface export goldens (spec-correct XYZ / CPS-3 / ZMAP+)
# ---------------------------------------------------------------------------

def fmt(v: float) -> str:
    return f'{v:.4f}' if v != model.NULL_VALUE else '1.0000000E+30'


def write_xyz(x, y, z, path: pathlib.Path):
    """XYZ points, one node per row, nulls written as 1.0E+30."""
    lines = []
    for r in range(z.shape[0]):
        for c in range(z.shape[1]):
            lines.append(f'{x[c]:.2f} {y[r]:.2f} {fmt(z[r, c])}')
    path.write_text('\n'.join(lines) + '\n')


def column_major_north_to_south(z: np.ndarray):
    """Values per column (west->east), each column top (north, max Y) down.

    Row 0 of z is the southernmost row, so north-to-south = reversed rows.
    """
    for c in range(z.shape[1]):
        for r in range(z.shape[0] - 1, -1, -1):
            yield z[r, c]


def write_cps3(x, y, z, path: pathlib.Path):
    live = z[z != model.NULL_VALUE]
    header = [
        'FSASCI 0 1 "Computed" 0 1.0000000E+30',
        'FSATTR 0 0',
        f'FSLIMI {x[0]:.6f} {x[-1]:.6f} {y[0]:.6f} {y[-1]:.6f} '
        f'{live.min():.6f} {live.max():.6f}',
        f'FSNROW {z.shape[0]} {z.shape[1]}',
        f'FSXINC {model.SURF_DX:.6f} {model.SURF_DY:.6f}',
    ]
    vals = [fmt(v) for v in column_major_north_to_south(z)]
    body = [' '.join(vals[i:i + 5]) for i in range(0, len(vals), 5)]
    path.write_text('\n'.join(header + body) + '\n')


IRAP_NULL = 9999900.0


def write_irap(x, y, z, path: pathlib.Path):
    """Irap 'RMS classic' ASCII grid: -996 header, x-fastest south-first
    body (our storage order), 6 values per line, 9999900 sentinel."""
    header = [
        f'-996 {z.shape[0]} {model.SURF_DX:.6f} {model.SURF_DY:.6f}',
        f'{x[0]:.6f} {x[-1]:.6f} {y[0]:.6f} {y[-1]:.6f}',
        f'{z.shape[1]} {0.0:.6f} {x[0]:.6f} {y[0]:.6f}',
        '0  0  0  0  0  0  0',
    ]
    vals = []
    for r in range(z.shape[0]):
        for c in range(z.shape[1]):
            v = z[r, c]
            vals.append(f'{(IRAP_NULL if v == model.NULL_VALUE else v):.6f}')
    body = [' '.join(vals[i:i + 6]) for i in range(0, len(vals), 6)]
    path.write_text('\n'.join(header + body) + '\n')


def write_zmap(x, y, z, path: pathlib.Path):
    name = path.stem
    header = [
        f'!  ZMAP+ GRID: {name} (Seismolord validation golden)',
        f'@{name} HEADER, GRID, 5',
        '  20, 1.0000000E+30, , 7, 1',
        f'  {z.shape[0]}, {z.shape[1]}, {x[0]:.6f}, {x[-1]:.6f}, '
        f'{y[0]:.6f}, {y[-1]:.6f}',
        '  0.0, 0.0, 0.0',
        '@',
    ]
    vals = [f'{(v if v != model.NULL_VALUE else model.NULL_VALUE):>19.7E}'
            for v in column_major_north_to_south(z)]
    body = [' '.join(vals[i:i + 5]) for i in range(0, len(vals), 5)]
    path.write_text('\n'.join(header + body) + '\n')


def write_surfaces():
    SURF_DIR.mkdir(parents=True, exist_ok=True)
    x, y, z = model.surface_grid()
    write_xyz(x, y, z, SURF_DIR / 'dome_surface.xyz')
    write_cps3(x, y, z, SURF_DIR / 'dome_surface_cps3.dat')
    write_zmap(x, y, z, SURF_DIR / 'dome_surface_zmap.dat')
    write_irap(x, y, z, SURF_DIR / 'dome_surface_irap.dat')

    live = z[z != model.NULL_VALUE]
    meta = {
        'convention': 'Z negative-down, feet; XY metres; null 1.0E+30; '
                      'CPS-3/ZMAP+ bodies column-major, north-to-south',
        'grid': {
            'nx': model.SURF_NX, 'ny': model.SURF_NY,
            'x0': model.SURF_X0, 'y0': model.SURF_Y0,
            'dx': model.SURF_DX, 'dy': model.SURF_DY,
        },
        'null_value': 1.0e30,
        'live_nodes': int(live.size),
        'null_nodes': int(z.size - live.size),
        'z_min_ft': float(live.min()),
        'z_max_ft': float(live.max()),
        'z_crest_ft': model.Z_CREST_FT,
        'hull_radius_m': model.HULL_RADIUS_M,
        'grv': model.grv_truth(),
    }
    (SURF_DIR / 'dome_surface_meta.json').write_text(
        json.dumps(meta, indent=2) + '\n')
    print(f'wrote surfaces + meta to {SURF_DIR.relative_to(REPO)}')


# ---------------------------------------------------------------------------
# Horizon PICK export goldens (Charisma / il-xl-xyz / xyz writers)
# ---------------------------------------------------------------------------
# The pick lattice itself ships in the meta JSON as a float32 blob; the
# jest side runs picksToPickRows + the writers over that blob and
# byte-compares the text files. Row math here mirrors the JS
# op-for-op in scalar float64 (JS doubles == Python floats).

PICKS_DIR = REPO / 'test-data' / 'seismolord' / 'picks'
PICK_HULL_FRACTION = 0.8    # picks nulled outside this fraction of corner radius


def pick_lattice(spec: model.VolumeSpec) -> np.ndarray:
    """float32 pick-sample lattice from the analytic dome, nulled outside
    a local-frame radius so writers' null-skipping is exercised."""
    dome = model.dome_twt_ms(spec)
    dt_ms = spec.dt_us / 1000.0
    picks = (dome / dt_ms).astype(np.float32)
    bil = spec.bin_m if spec.il_bin_m is None else spec.il_bin_m
    lx, ly = model.local_coords(spec)
    lxc = (spec.n_xl - 1) * spec.bin_m / 2.0
    lyc = (spec.n_il - 1) * bil / 2.0
    r = np.sqrt((lx - lxc) ** 2 + (ly - lyc) ** 2)
    rmax = np.sqrt(lxc ** 2 + lyc ** 2)
    picks[r > PICK_HULL_FRACTION * rmax] = np.float32(model.NULL_VALUE)
    return picks


def pick_rows(spec: model.VolumeSpec, picks: np.ndarray) -> list:
    """Live picks -> (il, xl, x, y, z) rows, il-major, z = -(sample*dt_ms)
    (negative-down TWT, the suite convention)."""
    aff = model.affine_truth(spec)
    dt_ms = spec.dt_us / 1000.0
    null32 = np.float32(model.NULL_VALUE)
    rows = []
    for i in range(spec.n_il):
        for j in range(spec.n_xl):
            s = picks[i, j]
            if s == null32:
                continue
            rows.append((
                spec.il0 + i * spec.il_step,
                spec.xl0 + j * spec.xl_step,
                aff['origin']['x'] + i * aff['il_vec']['x'] + j * aff['xl_vec']['x'],
                aff['origin']['y'] + i * aff['il_vec']['y'] + j * aff['xl_vec']['y'],
                -(float(s) * dt_ms),
            ))
    return rows


def write_picks():
    PICKS_DIR.mkdir(parents=True, exist_ok=True)
    for spec in (model.DOME_IEEE, model.DOME_STEP):
        picks = pick_lattice(spec)
        rows = pick_rows(spec, picks)
        base = f'{spec.name}_picks'
        charisma = [f'INLINE :{il:>7} XLINE :{xl:>7}{x:>12.2f}{y:>12.2f}{z:>12.4f}'
                    for il, xl, x, y, z in rows]
        (PICKS_DIR / f'{base}_charisma.txt').write_text('\n'.join(charisma) + '\n')
        ilxl = [f'{il} {xl} {x:.2f} {y:.2f} {z:.4f}' for il, xl, x, y, z in rows]
        (PICKS_DIR / f'{base}_ilxl.txt').write_text('\n'.join(ilxl) + '\n')
        xyz = [f'{x:.2f} {y:.2f} {z:.4f}' for _, _, x, y, z in rows]
        (PICKS_DIR / f'{base}.xyz').write_text('\n'.join(xyz) + '\n')
        meta = {
            'convention': 'Z negative-down TWT ms; live picks only, il-major; '
                          'Charisma rows are 9 whitespace tokens',
            'geometry': {
                'n_il': spec.n_il, 'n_xl': spec.n_xl,
                'il0': spec.il0, 'il_step': spec.il_step,
                'xl0': spec.xl0, 'xl_step': spec.xl_step,
                'dt_ms': spec.dt_us / 1000.0,
            },
            'affine': model.affine_truth(spec),
            'live_rows': len(rows),
            'picks': array_blob(picks),
        }
        (PICKS_DIR / f'{base}_meta.json').write_text(json.dumps(meta, indent=1) + '\n')
    print(f'wrote pick goldens to {PICKS_DIR.relative_to(REPO)}')


if __name__ == '__main__':
    GOLD_DIR.mkdir(parents=True, exist_ok=True)
    for spec in model.ALL_VOLUMES:
        golden = extract_volume(spec)
        out = GOLD_DIR / f'{spec.name}.json'
        out.write_text(json.dumps(golden, indent=1) + '\n')
        print(f'wrote {out.relative_to(REPO)}')
    write_surfaces()
    write_picks()
