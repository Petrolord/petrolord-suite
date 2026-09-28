// Item register import: the Ekene demo, or a pasted CSV or JSON register (SC3).
import React, { useState } from 'react';
import { Database, FileDown, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMaterialsSpares } from '@/contexts/MaterialsSparesContext';
import {
  ITEM_FIELDS, parseRegisterText, registerToCsv,
} from '@/utils/supplychain/materialsAdapters';
import { downloadText } from '@/lib/fullPrecision';
import {
  NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';
import {
  Ledger, Note, Panel, TextCell,
} from './common';

const HEAD = {
  annualUsage: 'Annual usage', unitCost: 'Unit cost', onHand: 'On hand', monthsSinceLastIssue: 'Months since last issue', monthlyUsage: 'Monthly usage',
};

const RegisterView = () => {
  const {
    inputs, items, loadEkene, importRegister, clearAll, addNotification,
  } = useMaterialsSpares();
  const [paste, setPaste] = useState('');
  const [parseError, setParseError] = useState(null);
  const scoreKeys = [...new Set(items.flatMap((it) => Object.keys(it.scores || {})))];

  const doImport = () => {
    const parsed = parseRegisterText(paste);
    if (parsed.error) { setParseError(parsed.error); return; }
    setParseError(null);
    importRegister(parsed, 'paste');
    addNotification(`Imported ${parsed.items.length} items. The policy and calculation inputs are unchanged.`, 'success');
  };

  const exportCsv = () => {
    if (!downloadText('materials-register.csv', registerToCsv(items))) addNotification('The download could not start in this browser.', 'error');
  };

  return (
    <div className="space-y-4">
      <Panel title="Load a register" testId="register-load">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={loadEkene} data-testid="load-ekene">
            <Database className="mr-1 h-4 w-4" /> Load the Ekene demo
          </Button>
          <Button size="sm" variant="outline" onClick={clearAll} data-testid="clear-all">
            <Trash2 className="mr-1 h-4 w-4" /> Clear everything
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!items.length} data-testid="export-register">
            <FileDown className="mr-1 h-4 w-4" /> Register as CSV
          </Button>
        </div>
        <Note>
          The Ekene demo is a synthetic register for block EK-11, Petrolord&apos;s fictional teaching field: 18 stock items with
          their stated criticality policy, ABC cut-offs, slow-moving bands and one stated case for each calculation. It is the
          same file the inventory engine is validated on. No real company, supplier or price appears in it.
        </Note>
        <div className="space-y-1">
          <label htmlFor="msp-register-paste" className="block text-[11px] font-medium text-pl-text">Paste a register (CSV or JSON)</label>
          <textarea
            id="msp-register-paste"
            data-testid="register-paste"
            className="h-32 w-full rounded-md border border-pl-border-strong bg-pl-surface p-2 font-mono text-xs text-pl-text placeholder:text-pl-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
            value={paste}
            placeholder={'id,name,annualUsage,unitCost,onHand,monthsSinceLastIssue,monthlyUsage,score_safety,score_production\nVALVE-1,Gate valve 2 in,12,850,6,2,1,4,3'}
            onChange={(e) => setPaste(e.target.value)}
          />
          <p className="text-[10px] leading-snug text-pl-muted">
            CSV columns: id, name, {ITEM_FIELDS.join(', ')}, and score_&lt;criterion&gt; for each criticality criterion. JSON: an
            array of items, or an object with an items array, each item {'{ id, name, ...figures, scores: { criterion: score } }'}.
            Importing replaces the items only; your policy and calculation inputs stay as they are.
          </p>
          <Button size="sm" onClick={doImport} data-testid="import-register">
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          {parseError ? <Note tone="warn" testId="register-parse-error">{parseError}</Note> : null}
        </div>
      </Panel>

      <Panel
        title={inputs.register.title || 'Item register'}
        testId="register-table"
        right={<span className="text-[11px] text-pl-muted" data-testid="register-count">{items.length} items{inputs.register.currency ? `, money in ${inputs.register.currency}` : ''}</span>}
      >
        {items.length === 0 ? (
          <Note tone="warn" testId="empty-register">The register is empty. Load the Ekene demo or paste your own register above.</Note>
        ) : (
          <Ledger data-testid="register-grid">
            <thead>
              <tr>
                <NumTh sticky>Id</NumTh>
                <NumTh>Name</NumTh>
                {ITEM_FIELDS.map((f) => <NumTh key={f} numeric>{HEAD[f]}</NumTh>)}
                {scoreKeys.map((k) => <NumTh key={k} numeric>Score: {k}</NumTh>)}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <NumRow key={it.id} data-testid={`register-row-${it.id}`}>
                  <RowLabel className="font-pl-mono">{it.id}</RowLabel>
                  <TextCell>{it.name}</TextCell>
                  {ITEM_FIELDS.map((f) => <NumCell key={f} value={it[f]} signed={false}>{String(it[f] ?? '')}</NumCell>)}
                  {scoreKeys.map((k) => <NumCell key={k} value={(it.scores || {})[k]} signed={false}>{String((it.scores || {})[k] ?? '')}</NumCell>)}
                </NumRow>
              ))}
            </tbody>
          </Ledger>
        )}
      </Panel>
    </div>
  );
};

export default RegisterView;
