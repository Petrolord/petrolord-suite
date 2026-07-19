/**
 * Flowing temperature profile for the Nodal Analysis Studio (NA1).
 *
 * v1 is a linear geothermal interpolation in TVD between wellhead and
 * bottomhole temperature. Kept in its own module so a measured or
 * Ramey-style profile can slot in later without touching the traverse.
 */

/**
 * Returns tAt(tvdFt) -> degF, linear between whtF at tvd 0 and bhtF at
 * tvdMaxFt. Clamped at both ends.
 */
export const linearGeothermal = ({ whtF, bhtF, tvdMaxFt }) => {
  const span = tvdMaxFt > 0 ? tvdMaxFt : 1;
  const slope = (bhtF - whtF) / span;
  return (tvdFt) => {
    const tvd = Math.min(Math.max(tvdFt, 0), span);
    return whtF + slope * tvd;
  };
};
