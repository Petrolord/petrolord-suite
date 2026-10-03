// The composition door (FLUID-U2-009): a feed composition from a file, an
// Excel sheet or a pasted block, read back before it replaces the typed one.
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload } from 'lucide-react';
import { readTabularFile } from '@/lib/tabularFile';
import { sheetText } from '@/utils/fluidstudio/labData';
import { readComposition } from '@/utils/fluidstudio/compositionImport';

/** @param {{onApply: function({zPct: object, plus: object}): void}} props */
const CompositionDoor = ({ onApply }) => {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [basis, setBasis] = useState('auto');
  const [decimal, setDecimal] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const read = useMemo(() => (text.trim() ? readComposition(text, { basis, ...(decimal ? { decimal } : {}) }) : null), [text, basis, decimal]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const res = await readTabularFile(file);
      setName(file.name);
      setText(res.kind === 'workbook' ? sheetText(res.sheets[0]?.rows || []) : res.text);
    } catch (err) {
      setError(err?.message || 'The file could not be read.');
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-pl-border p-3" data-testid="composition-door">
      <h4 className="text-sm font-semibold text-pl-text">Load a composition</h4>
      <p className="text-xs text-pl-muted">One row per component with its mole percent or mole fraction; the C7+ molecular weight and gravity as columns of the C7+ row or as rows of their own. Laboratory names are understood.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.dat,.prn,.asc,.xlsx,.xlsm,.xls" className="hidden" data-testid="composition-file" onChange={onFile} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Choose a file</Button>
        {name && <span className="text-xs text-pl-muted">{name}</span>}
      </div>
      {error && <p className="text-xs text-pl-warning-text">{error}</p>}
      <Label htmlFor="composition-paste" className="text-xs text-pl-muted">Or paste the table</Label>
      <Textarea id="composition-paste" value={text} onChange={(e) => { setText(e.target.value); setName(''); setDecimal(''); }} className="h-24 font-pl-mono text-sm" placeholder={'Component, mol%\nC1, 36.47\nC7+, 33.29'} />
      <div>
        <Label className="text-xs text-pl-muted">Basis of the amounts</Label>
        <Select value={basis} onValueChange={setBasis}>
          <SelectTrigger className="mt-1 h-8" data-testid="composition-basis"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">From the header or the total</SelectItem>
            <SelectItem value="percent">Mole percent</SelectItem>
            <SelectItem value="fraction">Mole fraction</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {read && (
        <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid="composition-readback" data-ok={read.ok ? 'yes' : 'no'}>
          <p className={read.ok ? '' : 'text-pl-warning-text'}>{read.summary}</p>
          {read.needsAnswer && (
            <div className="flex gap-2">
              {read.questions.map((q) => <p key={q} className="text-pl-warning-text">{q}</p>)}
              <Button size="sm" variant="outline" onClick={() => setDecimal('.')}>Point is the decimal mark</Button>
              <Button size="sm" variant="outline" onClick={() => setDecimal(',')}>Comma is the decimal mark</Button>
            </div>
          )}
          {read.ok && !read.needsAnswer && (
            <Button size="sm" data-testid="composition-apply" onClick={() => { onApply({ zPct: read.zPct, plus: read.plus }); setText(''); setName(''); }}>Use this composition</Button>
          )}
        </div>
      )}
    </div>
  );
};

export default CompositionDoor;
