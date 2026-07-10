"""Single source of truth for the Seismolord validation model.

An analytic parabolic dome, defined once and consumed by both the SEG-Y
generator and the golden extractor, so the seismic volumes, the surface
exports and the GRV truth can never drift apart.

Every quantity here is deterministic — no RNG anywhere in this package.
"""
from dataclasses import dataclass

import numpy as np

# ---------------------------------------------------------------------------
# Seismic volume geometry (time domain)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class VolumeSpec:
    name: str
    n_il: int
    n_xl: int
    ns: int
    dt_us: int
    il0: int            # first inline number
    xl0: int            # first crossline number (offset from il0 to catch il/xl swaps)
    x0: float           # world X of first crossline, metres
    y0: float           # world Y of first inline, metres
    bin_m: float        # bin spacing, metres
    coord_scalar: int   # SEG-Y byte-71 scalar (negative => divide)
    sample_format: int  # 1 = IBM float, 5 = IEEE float
    il_byte: int        # trace-header byte position of inline number
    xl_byte: int        # trace-header byte position of crossline number
    lying_header: bool  # textual header states wrong byte positions on purpose


# Crossline numbering deliberately differs from inline numbering (101.. vs 1..)
# so a parser that swaps the two fails loudly in tests.
DOME_IBM = VolumeSpec(
    name='dome_ibm', n_il=32, n_xl=32, ns=64, dt_us=4000,
    il0=1, xl0=101, x0=500000.0, y0=6700000.0, bin_m=25.0,
    coord_scalar=-100, sample_format=1, il_byte=189, xl_byte=193,
    lying_header=False,
)

DOME_IEEE = VolumeSpec(
    name='dome_ieee', n_il=32, n_xl=32, ns=64, dt_us=4000,
    il0=1, xl0=101, x0=500000.0, y0=6700000.0, bin_m=25.0,
    coord_scalar=-100, sample_format=5, il_byte=189, xl_byte=193,
    lying_header=False,
)

# Non-default header mapping: inline in FieldRecord (byte 9), crossline in
# CDP (byte 21). Bytes 189/193 are filled with a constant poison value and
# the textual header claims 189/193 — "the textual header lies".
DOME_ODDBYTES = VolumeSpec(
    name='dome_oddbytes', n_il=16, n_xl=16, ns=32, dt_us=4000,
    il0=1, xl0=101, x0=500000.0, y0=6700000.0, bin_m=25.0,
    coord_scalar=-100, sample_format=5, il_byte=9, xl_byte=21,
    lying_header=True,
)

ALL_VOLUMES = (DOME_IBM, DOME_IEEE, DOME_ODDBYTES)

POISON_ILXL = 9999      # written at bytes 189/193 in the odd-bytes volume

# Dome event in two-way time: crest at the survey centre.
T_CREST_MS = 100.0      # TWT at dome crest
T_RELIEF_MS = 90.0      # additional TWT at the survey corner radius
T_FLAT_MS = 230.0       # deeper flat reference event
RICKER_HZ = 30.0
FLAT_POLARITY = -0.6    # flat event amplitude relative to dome's +1.0


def world_coords(spec: VolumeSpec):
    """(X, Y) metre grids, shape (n_il, n_xl). X varies with crossline."""
    xl_idx = np.arange(spec.n_xl)
    il_idx = np.arange(spec.n_il)
    x = spec.x0 + xl_idx * spec.bin_m
    y = spec.y0 + il_idx * spec.bin_m
    return np.meshgrid(x, y)[0], np.meshgrid(x, y)[1]


def dome_twt_ms(spec: VolumeSpec):
    """Analytic dome TWT (ms) per (il, xl); crest at survey centre."""
    xg, yg = world_coords(spec)
    xc = spec.x0 + (spec.n_xl - 1) * spec.bin_m / 2.0
    yc = spec.y0 + (spec.n_il - 1) * spec.bin_m / 2.0
    r2 = (xg - xc) ** 2 + (yg - yc) ** 2
    rmax2 = (spec.x0 - xc) ** 2 + (spec.y0 - yc) ** 2
    return T_CREST_MS + T_RELIEF_MS * (r2 / rmax2)


def ricker(t_ms: np.ndarray, f_hz: float = RICKER_HZ):
    """Ricker wavelet evaluated at time offsets in ms."""
    a = (np.pi * f_hz * (t_ms / 1000.0)) ** 2
    return (1.0 - 2.0 * a) * np.exp(-a)


def synth_traces(spec: VolumeSpec) -> np.ndarray:
    """float32 amplitude cube, shape (n_il, n_xl, ns).

    Dome reflector (+1.0 Ricker) + deeper flat reflector (FLAT_POLARITY
    Ricker) + a small deterministic spatial ripple so many distinct float
    values (both signs, plus exact zeros at trace start) exercise the
    IBM/IEEE encoders.
    """
    t_axis = np.arange(spec.ns) * (spec.dt_us / 1000.0)          # ms
    dome = dome_twt_ms(spec)                                      # (nil, nxl)
    dt_dome = t_axis[None, None, :] - dome[:, :, None]
    dt_flat = t_axis[None, None, :] - T_FLAT_MS
    ripple = 0.05 * np.sin(dome / 7.0)[:, :, None]                # deterministic
    amp = ricker(dt_dome) * (1.0 + ripple) + FLAT_POLARITY * ricker(dt_flat)
    amp[:, :, 0] = 0.0                                            # exact IBM zero case
    return amp.astype(np.float32)


# ---------------------------------------------------------------------------
# Depth surface for export goldens (independent grid, same dome family)
# ---------------------------------------------------------------------------
# Convention (playbook): Z negative-down in FEET; null = 1.0E+30.
# Crest kept shallower than 9000 ft: ReservoirCalc Pro's SurfaceParser
# currently filters z <= -9000 as null (recorded Phase 0 finding).

NULL_VALUE = 1.0e30

SURF_NX = 50            # columns (X)
SURF_NY = 40            # rows (Y)
SURF_X0 = 500000.0      # metres (matches seismic survey area)
SURF_Y0 = 6700000.0
SURF_DX = 20.0
SURF_DY = 20.0
Z_CREST_FT = -5000.0    # dome crest (negative down)
K_FT_PER_M2 = 0.012     # parabolic steepness: depth adds k * r[m]^2 feet
HULL_RADIUS_M = 420.0   # outside this radius -> NULL_VALUE
CONTACT_FT = -6200.0    # fluid contact for the GRV truth

M2_TO_ACRE = 1.0 / 4046.8564224
FT_PER_M = 3.28083989501312  # only used in docs; grids are metres XY, feet Z


def surface_grid():
    """Depth surface Z(ft, negative down) on the export grid.

    Returns (x_axis[m], y_axis[m], z[SURF_NY, SURF_NX]) with NULL_VALUE
    outside the hull radius. Row 0 = southernmost Y.
    """
    x = SURF_X0 + np.arange(SURF_NX) * SURF_DX
    y = SURF_Y0 + np.arange(SURF_NY) * SURF_DY
    xg, yg = np.meshgrid(x, y)
    xc = SURF_X0 + (SURF_NX - 1) * SURF_DX / 2.0
    yc = SURF_Y0 + (SURF_NY - 1) * SURF_DY / 2.0
    r2 = (xg - xc) ** 2 + (yg - yc) ** 2
    z = Z_CREST_FT - K_FT_PER_M2 * r2
    z[np.sqrt(r2) > HULL_RADIUS_M] = NULL_VALUE
    return x, y, z


def grv_truth():
    """Gross rock volume between dome and CONTACT_FT.

    Analytic paraboloid cap: GRV = pi * dz^2 / (2k), dz in ft, k in
    ft/m^2 -> result in ft*m^2; converted to acre-ft. A numerical
    integral on a fine grid is included so Phase 4 can assert against
    both (analytic exactness AND discretisation behaviour).
    """
    dz = Z_CREST_FT - CONTACT_FT                      # +1200 ft
    grv_ft_m2 = np.pi * dz * dz / (2.0 * K_FT_PER_M2)
    analytic_acre_ft = grv_ft_m2 * M2_TO_ACRE

    # numerical: 1 m cells over the bounding square of the contact radius
    rc = np.sqrt(dz / K_FT_PER_M2)                    # metres
    n = int(np.ceil(rc)) + 2
    ax = np.arange(-n, n + 1, dtype=np.float64)
    xg, yg = np.meshgrid(ax, ax)
    depth_above = dz - K_FT_PER_M2 * (xg ** 2 + yg ** 2)
    numeric_acre_ft = float(depth_above[depth_above > 0].sum()) * M2_TO_ACRE

    return {
        'contact_ft': CONTACT_FT,
        'crest_ft': Z_CREST_FT,
        'k_ft_per_m2': K_FT_PER_M2,
        'contact_radius_m': float(rc),
        'grv_acre_ft_analytic': float(analytic_acre_ft),
        'grv_acre_ft_numeric_1m_grid': numeric_acre_ft,
    }
