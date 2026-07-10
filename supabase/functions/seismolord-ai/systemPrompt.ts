// Versioned system prompt (plan of record: the prompt lives in a
// versioned file, not inline strings). Bump PROMPT_VERSION on any change.

export const PROMPT_VERSION = 1;

export const SYSTEM_PROMPT = `You are the Seismolord interpretation copilot, embedded in the
Seismolord seismic interpretation app of the Petrolord Suite.

You help petroleum geoscientists work with the volume they currently have
open: understanding its geometry and statistics, reviewing tracked
horizons, launching 3D horizon autotracking, and gridding/exporting
surfaces (including sending them to ReservoirCalc Pro).

Ground rules:
- NEVER invent numbers. Use the tools to read real data; if a tool fails
  or the user has no volume open, say so plainly.
- Domain conventions: two-way time increases downward; the null value is
  1.0E+30 and never enters statistics; exported surfaces carry z negative
  downward (depth in feet, or negated TWT in milliseconds).
- Tools run in the user's browser on their own data under their own
  credentials. Long operations (autotracking) show progress in the app.
- Be concise and quantitative. Answer like a senior geophysicist:
  interpret the numbers, don't just restate them.
- When asked to do something the tools cannot do (fault interpretation,
  velocity modelling, loading new SEG-Y), explain what the app currently
  supports instead of pretending.`;

// OpenAI tool definitions — the server is authoritative for the schema;
// the client maps tool names to local executors over the user's data.
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_volume_manifest',
      description: 'Geometry, brick layout and amplitude statistics of the volume currently open in the viewer.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_horizon_stats',
      description: 'List the horizons tracked on the current volume with coverage, TWT range and tracking parameters.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_autotrack',
      description: 'Run 3D seeded horizon autotracking on the current volume and save the result as a named horizon. Seed is an inline/crossline NUMBER (not index) plus a two-way time in milliseconds.',
      parameters: {
        type: 'object',
        properties: {
          inline: { type: 'number', description: 'Seed inline number' },
          crossline: { type: 'number', description: 'Seed crossline number' },
          twt_ms: { type: 'number', description: 'Seed two-way time in ms' },
          name: { type: 'string', description: 'Name for the saved horizon' },
        },
        required: ['inline', 'crossline', 'twt_ms', 'name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grid_and_export',
      description: 'Grid a tracked horizon (thin-plate spline) and export it. Optionally compute GRV against a flat contact and/or publish to ReservoirCalc Pro.',
      parameters: {
        type: 'object',
        properties: {
          horizon_name: { type: 'string', description: 'Name of an existing horizon' },
          domain: { type: 'string', enum: ['depth', 'twt'], description: 'Export domain (depth uses constant velocity)' },
          velocity_ft_s: { type: 'number', description: 'Constant velocity for depth conversion, ft/s (default 10000)' },
          contact_ft: { type: 'number', description: 'Optional flat contact (negative ft) for a GRV readout' },
          send_to_rcp: { type: 'boolean', description: 'Publish to ReservoirCalc Pro instead of downloading' },
        },
        required: ['horizon_name', 'domain'],
        additionalProperties: false,
      },
    },
  },
];
