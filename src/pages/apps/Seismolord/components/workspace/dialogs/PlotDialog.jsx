// Plot to PDF (W1.4): true-scale paper plots of the Map or Section
// window. The window snapshot arrives georeferenced through its
// cameraApi (metersPerPx, and msPerPx for sections); plotComposer owns
// the paper/scale math; jsPDF renders frame, image, scale bar and title
// block. One plotted millimetre equals exactly scale/1000 ground
// metres (sections: the chosen ms per cm vertically). The map image
// carries its own north arrow, so the plot inherits it.

import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Printer } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  PAPER_SIZES, SCALE_CHOICES, paperLayout, suggestScale, cropForScale,
  plotScaleBar, titleBlockRows,
} from '../../../lib/plotComposer';

const MS_PER_CM_CHOICES = [25, 50, 100, 200, 500];

const selCls = 'mt-1 w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 text-sm';

export default function PlotDialog({
  open, onOpenChange, sectionCameraApi, mapCameraApi, volume, crsName,
}) {
  const { toast } = useToast();
  const [source, setSource] = useState('map');
  const [paper, setPaper] = useState('a4');
  const [orient, setOrient] = useState('landscape');
  const [scale, setScale] = useState(25000);
  const [msPerCm, setMsPerCm] = useState(100);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const apiFor = (src) => (src === 'map' ? mapCameraApi : sectionCameraApi);

  // Suggest a fitting scale whenever source/paper changes while open
  useEffect(() => {
    if (!open) return;
    const snap = apiFor(source)?.current?.snapshot?.();
    if (!snap || !snap.metersPerPx) return;
    const layout = paperLayout(paper, orient);
    const s = suggestScale({
      widthPx: snap.canvas.width,
      heightPx: snap.kind === 'section'
        ? 1 : snap.canvas.height,          // sections: fit width only
      metersPerPx: snap.metersPerPx,
    }, layout.imageBox);
    setScale(SCALE_CHOICES.includes(s) ? s : SCALE_CHOICES.find((c) => c >= s) || s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, paper, orient]);

  const generate = async () => {
    setBusy(true);
    try {
      const api = apiFor(source)?.current;
      const snap = api?.snapshot?.();
      if (!snap) {
        throw new Error(source === 'map'
          ? 'Open the Map window with a volume loaded first.'
          : 'Open the Section window with a slice on screen first.');
      }
      if (!snap.metersPerPx) {
        throw new Error('This view has no ground coordinates, so a true-scale plot is not possible.');
      }
      const layout = paperLayout(paper, orient);
      const isSection = snap.kind === 'section';
      const crop = cropForScale(
        {
          widthPx: snap.canvas.width,
          heightPx: snap.canvas.height,
          metersPerPx: snap.metersPerPx,
          msPerPx: snap.msPerPx,
        },
        { scale, msPerCm: isSection ? msPerCm : null },
        layout.imageBox,
      );
      const cut = document.createElement('canvas');
      cut.width = Math.max(1, Math.round(crop.sw));
      cut.height = Math.max(1, Math.round(crop.sh));
      cut.getContext('2d').drawImage(
        snap.canvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cut.width, cut.height,
      );

      const { default: JsPdf } = await import('jspdf');
      const pdf = new JsPdf({
        orientation: layout.wMm > layout.hMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [layout.wMm, layout.hMm],
      });

      // frame + image (centered in the image box at exact scale)
      pdf.setDrawColor(30);
      pdf.setLineWidth(0.4);
      pdf.rect(layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h);
      const ix = layout.imageBox.x + (layout.imageBox.w - crop.wMm) / 2;
      const iy = layout.imageBox.y + (layout.imageBox.h - crop.hMm) / 2;
      pdf.addImage(cut.toDataURL('image/png'), 'PNG', ix, iy, crop.wMm, crop.hMm);
      pdf.setLineWidth(0.2);
      pdf.rect(ix, iy, crop.wMm, crop.hMm);

      // title block: divider, rows, scale bar
      const tb = layout.titleBlock;
      pdf.setLineWidth(0.4);
      pdf.line(tb.x, tb.y, tb.x + tb.w, tb.y);
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: {} }));
      const scaleText = `1:${scale.toLocaleString('en-US')}`
        + (isSection ? `, ${msPerCm} ms/cm vertical` : '');
      const rows = titleBlockRows({
        title: title.trim() || null,
        volumeName: volume?.name || null,
        crsName,
        scaleText,
        author: user?.email || null,
        dateStr: new Date().toISOString().slice(0, 10),
        extra: [['View', snap.label]],
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(String(rows[0][1]), tb.x + 2, tb.y + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      rows.slice(1).forEach(([k, v], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        pdf.text(`${k}: ${v}`, tb.x + 2 + col * (tb.w / 2 - 40), tb.y + 11 + row * 4.5);
      });

      // scale bar, right side of the title block (ground scale)
      const bar = plotScaleBar(scale, Math.min(60, tb.w / 3));
      const bx = tb.x + tb.w - bar.mm - 4;
      const by = tb.y + tb.h - 8;
      pdf.setFillColor(0);
      pdf.rect(bx, by, bar.mm / 2, 2, 'F');
      pdf.rect(bx + bar.mm / 2, by, bar.mm / 2, 2);
      pdf.setFontSize(7.5);
      pdf.text('0', bx, by - 1.5);
      pdf.text(bar.label, bx + bar.mm, by - 1.5, { align: 'right' });

      const safe = (volume?.name || 'plot').replace(/[^\w-]+/g, '_').toLowerCase();
      pdf.save(`seismolord-${safe}-${source}.pdf`);
      toast({ title: 'Plot ready', description: `${scaleText} on ${PAPER_SIZES[paper].label} ${orient}.` });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Plot failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Printer className="w-5 h-5 mr-2 text-cyan-400" />
            Plot to PDF
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-400">Window</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={selCls}>
                <option value="map">Map (plan view)</option>
                <option value="section">Section / traverse</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Paper</span>
              <select value={paper} onChange={(e) => setPaper(e.target.value)} className={selCls}>
                {Object.entries(PAPER_SIZES).map(([k, p]) => (
                  <option key={k} value={k}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Orientation</span>
              <select value={orient} onChange={(e) => setOrient(e.target.value)} className={selCls}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Ground scale</span>
              <select value={String(scale)} onChange={(e) => setScale(Number(e.target.value))} className={selCls}>
                {(SCALE_CHOICES.includes(scale) ? SCALE_CHOICES
                  : [...SCALE_CHOICES, scale].sort((a, b) => a - b)).map((s) => (
                    <option key={s} value={String(s)}>{`1:${s.toLocaleString('en-US')}`}</option>
                ))}
              </select>
            </label>
            {source === 'section' && (
              <label className="block">
                <span className="text-xs text-slate-400">Vertical (time)</span>
                <select value={String(msPerCm)} onChange={(e) => setMsPerCm(Number(e.target.value))} className={selCls}>
                  {MS_PER_CM_CHOICES.map((v) => (
                    <option key={v} value={String(v)}>{`${v} ms/cm`}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block col-span-2">
              <span className="text-xs text-slate-400">Plot title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={volume?.name || 'Seismic plot'}
                className={selCls}
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500 flex items-start gap-1">
            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            The plot is centered on the current view and clipped to the paper
            at the chosen scale. Title block carries volume, CRS, scale,
            author and date; the scale bar is exact on paper.
          </p>
          <div className="flex justify-end">
            <Button onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
              Generate PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
