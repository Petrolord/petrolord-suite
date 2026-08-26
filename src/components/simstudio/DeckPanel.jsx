// Deck tab: SPE template picker, deck file upload, and a plain monospace
// viewer/editor for the main .DATA file (an edit re-uploads the same
// storage object; the worker re-validates everything at claim time).
import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileText, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { TEMPLATES } from '@/lib/simService';
import { supabase } from '@/lib/customSupabaseClient';

const DeckPanel = () => {
  const { activeCase, deckText, deckLoading, busy, uploadDeck, applyTemplate, addNotification } = useSimStudio();
  const fileRef = useRef(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(deckText || ''); setDirty(false); }, [deckText]);

  if (!activeCase) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Create or open a case in the left rail to set up a deck.
        </CardContent>
      </Card>
    );
  }

  const saveDeck = async () => {
    if (!activeCase.deck_path) return;
    setSaving(true);
    try {
      const { error } = await supabase.storage.from('sim').upload(
        activeCase.deck_path,
        new Blob([draft], { type: 'text/plain' }),
        { upsert: true, contentType: 'text/plain' },
      );
      if (error) throw error;
      setDirty(false);
      addNotification('Deck saved', 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Deck save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Start from an SPE benchmark template</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <div key={t.slug} className={`rounded-lg border p-3 ${activeCase.template_slug === t.slug ? 'border-lime-500/60 bg-lime-500/5' : 'border-slate-700'}`}>
              <div className="text-sm font-semibold text-slate-200">{t.label}</div>
              <p className="text-xs text-slate-500 mt-1">{t.blurb}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={busy}
                onClick={() => applyTemplate(t)}>
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                Use template
              </Button>
            </div>
          ))}
          <p className="md:col-span-2 text-[11px] text-slate-500">
            SPE decks are Open Database License (ODbL) datasets from the OPM project (see Help for attribution).
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Deck files</CardTitle>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" multiple accept=".DATA,.data,.inc,.INC,.grdecl,.GRDECL,.txt"
              className="hidden" data-testid="deck-file-input"
              onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) uploadDeck(f); e.target.value = ''; }} />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
              onClick={() => fileRef.current?.click()}>
              <Upload className="w-3 h-3 mr-1" /> Upload deck files
            </Button>
            {dirty && (
              <Button size="sm" className="h-7 text-xs bg-lime-600 hover:bg-lime-700" onClick={saveDeck} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                Save deck
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activeCase.deck_path ? (
            deckLoading ? (
              <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading deck…
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
                spellCheck={false}
                className="w-full h-[420px] rounded-md bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-slate-300 leading-relaxed"
                data-testid="deck-editor"
              />
            )
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm text-center px-6">
              No deck yet. Upload Eclipse-format files (.DATA + includes) or install a template above.
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">
            Main deck: <span className="font-mono">{activeCase.deck_path ? activeCase.deck_path.split('/').pop() : '—'}</span>
            {' '}· Limits: 25 MB bundle, 200k cells, 5,000 report steps, 30 min wall clock. PYACTION is not allowed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeckPanel;
