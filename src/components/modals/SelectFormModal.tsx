import * as React from 'react';
import { listForms, labelForForm } from '../../core/formsCrud';

type Props = {
  apiBase: string;
  onClose: () => void;
  onSelect: (row: any) => void;
};

export default function SelectFormModal({ apiBase, onClose, onSelect }: Props) {
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setBusy(true); setErr(null);
    try { setRows(await listForms(apiBase, q)); }
    catch (e: any) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  }, [apiBase, q]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <style>{`
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:50}
        .panel{width:min(800px,92vw);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden}
        .hd{padding:14px 16px;border-bottom:1px solid #eee;font-weight:700;display:flex;justify-content:space-between;align-items:center}
        .bd{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto}
        .row{display:flex;gap:8px;align-items:center}
        .input{height:34px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;flex:1}
        .btn{height:34px;padding:0 12px;border:1px solid #c9c9c9;border-radius:8px;background:#fff;cursor:pointer}
        .list{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
        .item{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid #f1f5f9}
        .item:first-child{border-top:none}
        .lbl{font-weight:600}
        .meta{opacity:.7;font-size:12px}
        .err{background:#fee2e2;border:1px solid #fecaca;color:#991b1b;padding:8px;border-radius:8px}
      `}</style>
      <div className="panel">
        <div className="hd">
          <span>Select a form</span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="bd">
          <div className="row">
            <input className="input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search…" />
            <button className="btn" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Search'}</button>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="list">
            {rows.map(r => (
              <div key={r.id ?? labelForForm(r)} className="item">
                <div>
                  <div className="lbl">{labelForForm(r)}</div>
                  <div className="meta">{r.id ? `id: ${r.id}` : ''}</div>
                </div>
                <div>
                  <button className="btn" onClick={()=>onSelect(r)}>Open</button>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="item">
                <em>No results</em>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
