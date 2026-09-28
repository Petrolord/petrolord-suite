import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Download, Copy, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Logical slide size — 16:9. The node is captured at this exact size (×2 for a
// crisp 2560×1440 PNG) regardless of how the on-screen preview is scaled to fit.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

/**
 * Wraps a fixed 1280×720 white slide in a fit-to-container preview plus a capture
 * toolbar. `Copy image` puts a PNG on the clipboard so the user can paste straight
 * into a slide; `Download PNG` saves the same bitmap. `extraActions` lets a slide
 * add its own buttons (e.g. Export PDF).
 */
const SlideFrame = ({ fileName = 'reservoircalc-slide', extraActions = null, children }) => {
    const wrapRef = useRef(null);
    const scaleRef = useRef(null);
    const slideRef = useRef(null);
    const [scale, setScale] = useState(0.6);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    // Scale the preview to fill the available area (never upscale past 1.4×).
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const compute = () => {
            const pad = 48;
            const s = Math.min((el.clientWidth - pad) / SLIDE_W, (el.clientHeight - pad) / SLIDE_H);
            if (s > 0) setScale(Math.min(s, 1.4));
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const renderCanvas = useCallback(async () => {
        const node = slideRef.current;
        const wrap = scaleRef.current;
        // html2canvas mis-positions text when an ancestor is CSS-scaled (it reads
        // scaled bounding rects but paints onto an unscaled canvas). Capture the
        // slide at its true 1:1 size, then restore the fit-to-screen preview.
        const prevTransform = wrap ? wrap.style.transform : null;
        if (wrap) wrap.style.transform = 'none';
        try {
            return await html2canvas(node, {
                scale: 2,
                backgroundColor: '#ffffff',
                width: SLIDE_W,
                height: SLIDE_H,
                windowWidth: SLIDE_W,
                windowHeight: SLIDE_H,
                useCORS: true,
                logging: false,
            });
        } finally {
            if (wrap) wrap.style.transform = prevTransform;
        }
    }, []);

    const handleDownload = async () => {
        setBusy(true);
        try {
            const canvas = await renderCanvas();
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${fileName}.png`;
            a.click();
            toast({ title: 'Slide saved', description: 'A 2560×1440 PNG was downloaded.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: e?.message || 'Could not render the slide.' });
        } finally {
            setBusy(false);
        }
    };

    const handleCopy = async () => {
        setBusy(true);
        try {
            const canvas = await renderCanvas();
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2200);
                toast({ title: 'Copied to clipboard', description: 'Paste it into your slide with Ctrl / ⌘ + V.' });
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${fileName}.png`;
                a.click();
                URL.revokeObjectURL(a.href);
                toast({ title: 'Image downloaded', description: 'Clipboard access is unavailable in this browser — saved as PNG instead.' });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Copy failed', description: e?.message || 'Could not copy the slide.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full w-full flex-col bg-pl-sunken">
            {/* Capture toolbar (excluded from the screenshot) */}
            <div className="flex items-center justify-between gap-3 border-b border-pl-border bg-pl-surface px-4 py-2">
                <div className="hidden items-center gap-2 text-[11px] font-medium text-pl-muted sm:flex">
                    <span className="rounded bg-pl-text px-1.5 py-0.5 text-[10px] font-bold text-pl-surface">16:9</span>
                    Presentation slide — screenshot-ready for PowerPoint &amp; Keynote
                </div>
                <div className="flex items-center gap-2">
                    {extraActions}
                    <Button size="sm" variant="outline" className="h-8 gap-2" onClick={handleCopy} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4 text-pl-success-text" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy image'}
                    </Button>
                    <Button size="sm" className="h-8 gap-2" onClick={handleDownload} disabled={busy}>
                        <Download className="h-4 w-4" /> Download PNG
                    </Button>
                </div>
            </div>

            {/* Fit-to-screen preview */}
            <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }} className="shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10" data-canvas="chart">
                    {/* Transform on the wrapper keeps the captured node itself at 1:1 */}
                    <div ref={scaleRef} style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                        <div ref={slideRef} style={{ width: SLIDE_W, height: SLIDE_H }} className="relative bg-white text-slate-900">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SlideFrame;
