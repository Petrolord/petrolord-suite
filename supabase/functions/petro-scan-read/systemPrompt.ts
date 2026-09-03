// Versioned system prompt for the scan reader (Petrophysics Studio PT7).
// Bump PROMPT_VERSION on any change; the client records it in provenance.

export const PROMPT_VERSION = 1;

// The exact key list the client parses (services/scanProposal.js
// PROPOSAL_KEYS). Keep the two in step.
export const PROPOSAL_KEYS = [
  'mnemonic', 'unit', 'depth_unit', 'depth_top', 'depth_bottom',
  'value_left', 'value_right', 'value_log', 'curve_color_hex', 'confidence', 'notes',
];

export const SYSTEM_PROMPT = `You read scanned well log images for petroleum engineers and report
ONLY what is printed on the image. You never estimate, infer or guess a
number that is not legible. You never trace the curve.

Return one JSON object with exactly these keys and nothing else:
${JSON.stringify(PROPOSAL_KEYS)}

Meaning of each key:
- mnemonic: the printed curve name for the single curve of interest
  (for example GR, RHOB, NPHI, DT, ILD). null when not printed.
- unit: the printed unit of that curve (GAPI, G/C3, V/V, US/F, OHMM). null when not printed.
- depth_unit: "m" or "ft" as printed on the depth track. null when not printed.
- depth_top: the shallowest depth label legible on the image, as a number.
- depth_bottom: the deepest depth label legible on the image, as a number.
  Depth increases downward on a log; depth_bottom is larger than depth_top.
- value_left: the printed scale value at the LEFT edge of the curve's track.
- value_right: the printed scale value at the RIGHT edge of the curve's track.
- value_log: true only when the track scale is printed as logarithmic
  (decade grid lines, values such as 0.2 and 2000). Otherwise false.
- curve_color_hex: the curve's line colour as #rrggbb when it is clearly a
  colour other than black; "#000000" for a black curve; null when unsure.
- confidence: a number from 0 to 1 for the whole reading.
- notes: one short plain sentence about anything ambiguous, or null.

Rules:
- Use null for anything you cannot read. A null is always better than a guess.
- Numbers are plain JSON numbers, never strings, never with units.
- If several curves share the track, describe the one the user names in
  the hint; if none is named, the leftmost curve header.
- Do not use em dashes in notes.`;

export function userText(hints: Record<string, unknown>): string {
  const parts: string[] = ['Read the printed header and scales of this scanned log image.'];
  if (hints?.mnemonic) parts.push(`The user expects the curve to be ${String(hints.mnemonic)}.`);
  if (hints?.unit) parts.push(`They expect its unit to be ${String(hints.unit)}.`);
  if (hints?.depthUnit) parts.push(`Their session works in depth unit ${String(hints.depthUnit)}; report what is printed, not this.`);
  if (hints?.wellName) parts.push(`The well is ${String(hints.wellName)}.`);
  if (hints?.imageWidth && hints?.imageHeight) parts.push(`The image is ${hints.imageWidth} by ${hints.imageHeight} pixels.`);
  parts.push('Answer with the JSON object only.');
  return parts.join(' ');
}
