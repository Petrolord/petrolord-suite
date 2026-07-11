import React, { useRef, useState } from 'react';
import { Sparkles, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { listHorizons, saveHorizon } from '../services/horizonsService';
import { publishSurface } from '../services/exportsService';
import { gridHorizonSurface } from '../services/surfaceWorkflow';
import { grvAcreFt } from '../engine/surfaceExport';
import { geomFromManifest } from '../engine/sliceAssembly';

const MAX_TOOL_ROUNDS = 6;

const storageBase = () => supabase.storage.from('seismic')
  .getPublicUrl('x').data.publicUrl.split('/storage/v1/')[0];

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return session.access_token;
}

const newHorizonWorker = () =>
  new Worker(new URL('../workers/horizon.worker.js', import.meta.url), { type: 'module' });

let trackJobSeq = 1000;

/**
 * AI copilot (cuttable, plan of record Phase 5): the edge function holds
 * the LLM key and versioned prompt; every tool executes HERE, in the
 * browser, over the user's own data and credentials.
 */
export default function AiPanel({ volume, manifest }) {
  const [openPanel, setOpenPanel] = useState(false);
  const [chat, setChat] = useState([]);        // display messages
  const apiMessagesRef = useRef([]);           // OpenAI-format history
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const requireVolume = () => {
    if (!volume || !manifest) throw new Error('No volume is open in the viewer.');
  };

  // ---- client-side tool executors --------------------------------------
  const tools = {
    get_volume_manifest: async () => {
      requireVolume();
      return {
        name: volume.name,
        geometry: manifest.geometry,
        brick: { size: manifest.brick.size, grid: manifest.brick.grid, count: manifest.brick.count },
        stats: manifest.stats,
        trace_count: manifest.trace_count,
      };
    },
    get_horizon_stats: async () => {
      requireVolume();
      const rows = await listHorizons(volume.id);
      return rows.map((h) => ({
        name: h.name, snap_mode: h.snap_mode, stats: h.stats, params: h.params,
        created_at: h.created_at,
      }));
    },
    run_autotrack: async ({ inline, crossline, twt_ms: twtMs, name }) => {
      requireVolume();
      // Validate LLM-supplied args explicitly: NaN passes BOTH `< min` and
      // `>= max`, so a non-numeric arg would otherwise slip the range guard
      // and persist an empty 0-coverage horizon.
      for (const [label, val] of [['inline', inline], ['crossline', crossline], ['twt_ms', twtMs]]) {
        if (!Number.isFinite(val)) throw new Error(`run_autotrack: ${label} must be a number.`);
      }
      if (!name || typeof name !== 'string' || !name.trim()) {
        throw new Error('run_autotrack: a non-empty horizon name is required.');
      }
      const g = manifest.geometry;
      const geom = geomFromManifest(manifest);
      const ilIdx = Math.round((inline - g.il.min) / g.il.step);
      const xlIdx = Math.round((crossline - g.xl.min) / g.xl.step);
      if (ilIdx < 0 || ilIdx >= geom.nIl || xlIdx < 0 || xlIdx >= geom.nXl) {
        throw new Error(`Seed IL ${inline} / XL ${crossline} is outside the survey.`);
      }
      const sample = twtMs / (g.dt_us / 1000);
      if (sample < 0 || sample >= geom.ns) {
        throw new Error(`Seed time ${twtMs} ms is outside the record length.`);
      }
      setStatus(`Autotracking "${name}"…`);
      const id = ++trackJobSeq;
      const token = await accessToken();
      const worker = newHorizonWorker();
      const picks = await new Promise((resolve, reject) => {
        worker.onmessage = async (e) => {
          const msg = e.data;
          if (msg.id !== id) return;
          if (msg.type === 'progress') setStatus(`Autotracking "${name}"… ${msg.tracked.toLocaleString()} traces`);
          else if (msg.type === 'need-token') {
            worker.postMessage({ type: 'token', nonce: msg.nonce, token: await accessToken() });
          } else if (msg.type === 'done') resolve(new Float32Array(msg.picks));
          else if (msg.type === 'error') reject(new Error(msg.message));
        };
        worker.onerror = (ev) => reject(new Error(ev.message));
        worker.postMessage({
          type: 'track3d',
          id,
          config: {
            supabaseUrl: storageBase(),
            token,
            bucket: 'seismic',
            storagePath: volume.storage_path,
            geom,
            seed: { ilIdx, xlIdx, sample },
            opts: {
              mode: 'peak', window: 3, maxJump: 4,
              minAbsAmp: (manifest.stats?.rms || 0) * 0.3,
            },
          },
        });
      }).finally(() => worker.terminate());
      const row = await saveHorizon({
        volume, name, picks,
        seed: { ilIdx, xlIdx, sample },
        params: { mode: 'peak', window: 3, maxJump: 4, via: 'ai' },
        dtUs: g.dt_us,
      });
      setStatus(null);
      return { saved: true, name: row.name, stats: row.stats };
    },
    grid_and_export: async ({
      horizon_name: horizonName, domain, velocity_ft_s: velocity = 10000,
      contact_ft: contactFt, send_to_rcp: sendToRcp = false,
    }) => {
      requireVolume();
      const rows = await listHorizons(volume.id);
      const horizon = rows.find((h) => h.name.toLowerCase() === horizonName.toLowerCase());
      if (!horizon) {
        throw new Error(`No horizon named "${horizonName}". Available: ${rows.map((h) => h.name).join(', ') || 'none'}.`);
      }
      setStatus(`Gridding "${horizon.name}"…`);
      const { g, spec, gridded, xyzText } = await gridHorizonSurface({
        manifest, horizon, domain, velocityFtS: velocity,
      });
      const grv = domain === 'depth' && contactFt != null
        ? grvAcreFt(g, spec.dx, spec.dy, contactFt)
        : null;
      let destination = 'downloaded';
      if (sendToRcp) {
        await publishSurface({
          name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
          xyzText,
          domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
          volume, horizon,
          params: {
            via: 'ai',
            velocity_model: domain === 'depth' ? (manifest.velocity || null) : null,
            velocity_ft_s: domain === 'depth' && !manifest.velocity ? velocity : null,
            cell_m: spec.dx, live_nodes: gridded.live,
            z_min: gridded.zMin, z_max: gridded.zMax,
          },
        });
        destination = 'sent to ReservoirCalc Pro';
      } else {
        const url = URL.createObjectURL(new Blob([xyzText], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${horizon.name.replace(/[^\w-]+/g, '_').toLowerCase()}_${domain}.xyz`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setStatus(null);
      return {
        destination,
        live_nodes: gridded.live,
        control_points: gridded.controlCount,
        z_min: gridded.zMin,
        z_max: gridded.zMax,
        grv_acre_ft: grv,
      };
    },
  };

  const executeToolCall = async (call) => {
    const fn = tools[call.function.name];
    let content;
    try {
      if (!fn) throw new Error(`Unknown tool: ${call.function.name}`);
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      content = JSON.stringify(await fn(args));
    } catch (e) {
      content = JSON.stringify({ error: e.message });
      setStatus(null);
    }
    return { role: 'tool', tool_call_id: call.id, content };
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setChat((c) => [...c, { who: 'user', text }]);
    apiMessagesRef.current.push({ role: 'user', content: text });
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const { data, error } = await supabase.functions.invoke('seismolord-ai', {
          body: { messages: apiMessagesRef.current },
        });
        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);
        const msg = data.message;
        apiMessagesRef.current.push(msg);
        if (msg.tool_calls?.length) {
          setChat((c) => [...c, {
            who: 'tool',
            text: `Running: ${msg.tool_calls.map((t) => t.function.name).join(', ')}…`,
          }]);
          // eslint-disable-next-line no-await-in-loop
          const results = await Promise.all(msg.tool_calls.map(executeToolCall));
          apiMessagesRef.current.push(...results);
          continue;
        }
        setChat((c) => [...c, { who: 'ai', text: msg.content || '(no reply)' }]);
        break;
      }
    } catch (e) {
      setChat((c) => [...c, { who: 'error', text: e.message }]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader
        className="flex flex-row items-center justify-between space-y-0 cursor-pointer"
        onClick={() => setOpenPanel((o) => !o)}
      >
        <CardTitle className="text-white flex items-center">
          <Sparkles className="w-5 h-5 mr-2 text-cyan-400" />
          Interpretation copilot
          <span className="ml-3 text-xs font-normal text-slate-500">
            asks before it acts on your data · tools run in your browser
          </span>
        </CardTitle>
        {openPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </CardHeader>
      {openPanel && (
        <CardContent className="space-y-3">
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {chat.length === 0 && (
              <p className="text-sm text-slate-500">
                Try: “Summarise the open volume”, “List my horizons”,
                “Autotrack a horizon at IL 16, XL 116, 110 ms named Top Dome”,
                or “Grid Top Dome in depth with a −6200 ft contact and send it
                to ReservoirCalc Pro”.
              </p>
            )}
            {chat.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${
                  m.who === 'user' ? 'bg-cyan-950/40 text-cyan-100 ml-8'
                    : m.who === 'ai' ? 'bg-slate-950/70 text-slate-200 mr-8'
                      : m.who === 'tool' ? 'text-slate-500 text-xs italic'
                        : 'bg-red-950/40 text-red-300'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="flex items-center text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {status || 'Thinking…'}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              placeholder={volume ? `Ask about ${volume.name}…` : 'Open a volume in the viewer first…'}
              className="bg-slate-950 border-slate-700 text-slate-200"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              disabled={busy}
            />
            <Button onClick={send} disabled={busy || !input.trim()} className="bg-cyan-600 hover:bg-cyan-500 text-white">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
