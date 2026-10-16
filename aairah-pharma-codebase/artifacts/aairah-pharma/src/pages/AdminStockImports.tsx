/**
 * AdminStockImports — Monthly Spreadsheet Restock Screen
 * Upload → Preview → Confirm → History
 */

import { useState, useEffect } from 'react';
import {
  UploadCloud, FileCheck2, AlertCircle, CheckCircle2, Clock,
  RefreshCcw, Download, ChevronRight, ChevronDown, X, Loader2,
  PackageCheck, ArrowRight, History, FileText, Info
} from 'lucide-react';
import { API_BASE_URL, authHeaders as sharedAuthHeaders } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/* ─── helpers ─────────────────────────────────────────────── */

function buildAuthHeaders(token?: string | null): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` };
  // Fallback: read from shared auth helper (localStorage)
  return sharedAuthHeaders();
}

async function apiFetch(path: string, opts: RequestInit = {}, token?: string | null) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...opts,
    headers: { ...buildAuthHeaders(token), ...(opts.headers as Record<string, string> || {}) },
  });
  // Session expired or invalid — clear stale auth and redirect to login
  if (res.status === 401) {
    localStorage.removeItem('aayerah_token');
    localStorage.removeItem('aairah_token');
    window.location.href = '/admin/login';
    throw new Error('Session expired — redirecting to login…');
  }
  const json = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) throw new Error(json.error || json.detail || `HTTP ${res.status}`);
  return json;
}

/* ─── status badge ─────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    uploaded:     { bg: '#e0f2fe', text: '#0369a1', icon: <UploadCloud size={12} /> },
    ready:        { bg: '#dcfce7', text: '#15803d', icon: <FileCheck2 size={12} /> },
    needs_review: { bg: '#fef9c3', text: '#92400e', icon: <AlertCircle size={12} /> },
    posted:       { bg: '#d1fae5', text: '#065f46', icon: <CheckCircle2 size={12} /> },
    cancelled:    { bg: '#f3f4f6', text: '#6b7280', icon: <X size={12} /> },
    failed:       { bg: '#fee2e2', text: '#991b1b', icon: <AlertCircle size={12} /> },
  };
  const s = styles[status] ?? { bg: '#f3f4f6', text: '#374151', icon: <Clock size={12} /> };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {s.icon} {status.replace('_', ' ')}
    </span>
  );
}

/* ─── Upload Form ──────────────────────────────────────────── */

interface UploadResult {
  id: string;
  receipt_reference: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  skipped_rows?: number;
  error_rows: number;
  errors: Array<{ row: number; sku: string; item_description?: string; messages: string[] }>;
  preview: Array<{
    row: number;
    sku: string;
    item_description?: string;
    product_name?: string;
    rate?: number;
    opening_qty?: number;
    qty: number;
    receipt_qty?: number;
    issue_qty?: number;
    closing_qty?: number;
    unit: string;
    current_stock?: number;
    product_id: string;
  }>;
}

function UploadForm({ onUploaded }: { onUploaded: (r: UploadResult) => void }) {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !ref) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('receipt_reference', ref);
      if (receivedDate) fd.append('received_date', receivedDate);
      if (month) fd.append('month', month);

      const result = await apiFetch('/admin/stock-imports', { method: 'POST', body: fd }, token);
      onUploaded(result as UploadResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/stock-imports/template`, {
      headers: buildAuthHeaders(token),
    });
    if (res.status === 401) {
      localStorage.removeItem('aayerah_token');
      localStorage.removeItem('aairah_token');
      window.location.href = '/admin/login';
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aayerah_restock_template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* template download */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'hsl(var(--muted) / 0.4)', borderRadius: '10px', border: '1px dashed hsl(var(--border))' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>Strict 2-Tier Restock CSV Template</p>
          <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: '3px 0 0' }}>
            Headers: <code>ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,</code> / <code>,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE</code>
          </p>
        </div>
        <button type="button" className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={downloadTemplate}>
          <Download size={14} /> Download Template
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af' }}>
        <span><strong>Restock vs New Products:</strong> Restock adds received quantities to existing items. To register brand new products in bulk, use <strong>Inventory &gt; Add to Inventory (Excel / CSV)</strong>.</span>
        <a href="/admin/inventory" className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px', background: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          Go to Inventory <ChevronRight size={13} />
        </a>
      </div>

      {/* receipt reference */}
      <div>
        <label className="field-label" style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
          Receipt Reference <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          className="field"
          required
          placeholder="e.g. RCV-2026-10-001"
          value={ref}
          onChange={e => setRef(e.target.value)}
        />
        <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>
          Must be unique per physical delivery. Do not reuse receipt numbers.
        </p>
      </div>

      {/* dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>Received Date</label>
          <input className="field" type="date" max={today} value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label" style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>Reporting Month</label>
          <input className="field" type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>

      {/* file dropzone */}
      <div>
        <label className="field-label" style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
          Spreadsheet File (.xlsx / .csv) <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('restock-file-input')?.click()}
          style={{
            border: `2px dashed ${dragging ? 'hsl(var(--primary))' : file ? '#16a34a' : 'hsl(var(--border))'}`,
            borderRadius: '12px',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? '#f0fdf4' : dragging ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--muted) / 0.3)',
            transition: 'all 0.2s',
          }}
        >
          {file ? (
            <>
              <CheckCircle2 size={28} color="#16a34a" style={{ marginBottom: '8px' }} />
              <p style={{ fontWeight: 600, fontSize: '13px', color: '#15803d', margin: 0 }}>{file.name}</p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>
                {(file.size / 1024).toFixed(1)} KB · Click to replace
              </p>
            </>
          ) : (
            <>
              <UploadCloud size={28} color="hsl(var(--muted-foreground))" style={{ marginBottom: '8px' }} />
              <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>Drag & drop file here</p>
              <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', margin: '4px 0 0' }}>
                or click to browse · .xls, .xlsx or .csv · max 10 MB
              </p>
            </>
          )}
        </div>
        <input
          id="restock-file-input"
          type="file"
          accept=".xls,.xlsx,.csv"
          style={{ display: 'none' }}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={loading || !file || !ref} style={{ width: '100%', justifyContent: 'center' }}>
        {loading ? <><Loader2 size={16} className="animate-spin" /> Uploading &amp; Parsing...</> : <><UploadCloud size={16} /> Upload &amp; Parse Spreadsheet</>}
      </button>
    </form>
  );
}

/* ─── Preview / Confirm ────────────────────────────────────── */

function ImportPreview({ result, onConfirm, onDiscard }: {
  result: UploadResult;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { token } = useAuth();
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<any>(null);
  const [postError, setPostError] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const handleConfirm = async () => {
    setPosting(true);
    setPostError('');
    try {
      const r = await apiFetch(`/admin/stock-imports/${result.id}/post`, { method: 'POST' }, token);
      setPostResult(r);
      onConfirm();
    } catch (err: any) {
      setPostError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await apiFetch(`/admin/stock-imports/${result.id}/cancel`, { method: 'POST' }, token);
    } finally {
      onDiscard();
    }
  };

  if (postResult) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <CheckCircle2 size={48} color="#16a34a" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Restock Posted Successfully</h3>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '20px', fontSize: '14px' }}>
          Receipt <strong>{postResult.receipt_reference}</strong> has been committed. Stock balances updated.
        </p>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
          {postResult.movements?.map((m: any) => (
            <div key={m.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #bbf7d0', fontSize: '13px' }}>
              <span>{m.name}</span>
              <span>{m.before} → <strong>{m.after}</strong> (+{m.added})</span>
            </div>
          ))}
        </div>
        <button className="btn btn-outline" onClick={onDiscard}>Done</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: result.skipped_rows !== undefined && result.skipped_rows > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
        gap: '12px'
      }}>
        {[
          { label: 'Total rows', value: result.total_rows, color: '#1e40af' },
          { label: 'Restock rows', value: result.valid_rows, color: '#15803d' },
          ...(result.skipped_rows !== undefined && result.skipped_rows > 0
            ? [{ label: 'Unchanged (0 qty)', value: result.skipped_rows, color: '#64748b' }]
            : []
          ),
          { label: 'Error rows', value: result.error_rows, color: result.error_rows > 0 ? '#b91c1c' : '#15803d' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'hsl(var(--muted) / 0.4)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: '22px', fontWeight: 700, color, margin: 0 }}>{value}</p>
            <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* skipped rows informational note */}
      {result.skipped_rows !== undefined && result.skipped_rows > 0 && (
        <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={15} style={{ color: '#64748b', flexShrink: 0 }} />
          <span>
            <strong>{result.skipped_rows} unchanged row{result.skipped_rows !== 1 ? 's' : ''}</strong> had 0 received quantities in this delivery and will be safely skipped (not treated as errors).
          </span>
        </div>
      )}

      {/* errors section */}
      {result.error_rows > 0 && (
        <div style={{ border: '1px solid #fca5a5', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowErrors(!showErrors)}
            style={{ width: '100%', padding: '12px 16px', background: '#fef2f2', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 600, color: '#991b1b' }}
          >
            <span><AlertCircle size={14} style={{ marginRight: '6px' }} />
              {result.error_rows} row{result.error_rows !== 1 ? 's' : ''} need correction before posting
            </span>
            {showErrors ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {showErrors && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {result.errors.map((err) => (
                <div key={`${err.row}-${err.sku}`} style={{ padding: '10px 16px', borderTop: '1px solid #fca5a5', background: '#fff5f5' }}>
                  <p style={{ fontWeight: 600, fontSize: '12px', margin: '0 0 4px', color: '#7f1d1d' }}>
                    Row {err.row} · SKU: {err.sku || '—'}
                  </p>
                  {err.messages.map((m, i) => (
                    <p key={i} style={{ fontSize: '12px', margin: '2px 0', color: '#991b1b' }}>• {m}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* valid rows preview */}
      {result.valid_rows > 0 && (
        <div>
          <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Valid restock rows to post:</p>
          <div style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'hsl(var(--muted))', textAlign: 'left' }}>
                  {['Row', 'Item Description', 'Rate', 'Opening', 'Restock (Receipt)', 'Closing', 'Unit'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((r) => (
                  <tr key={`${r.row}-${r.sku}`} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                    <td style={{ padding: '8px 12px', color: 'hsl(var(--muted-foreground))' }}>{r.row}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                      {r.item_description || r.product_name || r.sku}
                      {r.sku && r.sku !== (r.item_description || r.product_name) && (
                        <span style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', display: 'block', fontFamily: 'monospace' }}>
                          SKU: {r.sku}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                      {r.rate !== undefined && r.rate !== null ? `₹${Number(r.rate).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'hsl(var(--muted-foreground))' }}>
                      {r.opening_qty ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#15803d', fontWeight: 700 }}>
                      +{r.receipt_qty ?? r.qty}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'hsl(var(--foreground))' }}>
                      {r.closing_qty ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* core rule reminder */}
      <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '12px', color: '#1e40af' }}>
        <strong>Additive-only rule:</strong> Quantities will be <em>added</em> to existing stock — existing balances are never overwritten.
      </div>

      {postError && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', gap: '8px' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />{postError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCancel} disabled={posting}>
          <X size={15} /> Discard
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, justifyContent: 'center' }}
          disabled={posting || result.status === 'needs_review'}
          onClick={handleConfirm}
        >
          {posting
            ? <><Loader2 size={15} className="animate-spin" /> Posting...</>
            : <><PackageCheck size={15} /> Confirm Restock ({result.valid_rows} rows)</>}
        </button>
      </div>

      {result.status === 'needs_review' && (
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#b91c1c', margin: 0 }}>
          Fix all errors in the source file and re-upload to enable posting.
        </p>
      )}
    </div>
  );
}

/* ─── Import History ───────────────────────────────────────── */

function ImportHistory() {
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { token } = useAuth();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/admin/stock-imports?limit=20', {}, token);
      setImports(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--muted-foreground))' }}><Loader2 size={20} className="animate-spin" /></div>;
  if (error) return <div style={{ color: '#991b1b', padding: '20px', fontSize: '13px' }}>{error} <button className="btn btn-outline" style={{ marginLeft: '12px', fontSize: '12px', padding: '4px 10px' }} onClick={load}>Retry</button></div>;
  if (!imports.length) return <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}><FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} /><p>No imports yet. Upload your first spreadsheet above.</p></div>;

  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'hsl(var(--muted) / 0.5)' }}>
        <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>Recent Imports</p>
        <button className="icon-button" title="Refresh" onClick={load}><RefreshCcw size={14} /></button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: 'hsl(var(--muted))', textAlign: 'left' }}>
            {['Receipt Ref', 'Month', 'Status', 'Received', 'Uploaded'].map(h => (
              <th key={h} style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {imports.map((i) => (
            <tr key={i.id} style={{ borderTop: '1px solid hsl(var(--border))' }}>
              <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'hsl(var(--primary))' }}>{i.receipt_reference}</td>
              <td style={{ padding: '10px 14px', color: 'hsl(var(--muted-foreground))' }}>{i.month || '—'}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge status={i.status} /></td>
              <td style={{ padding: '10px 14px', color: 'hsl(var(--muted-foreground))' }}>{i.received_date ? i.received_date.slice(0, 10) : '—'}</td>
              <td style={{ padding: '10px 14px', color: 'hsl(var(--muted-foreground))' }}>{new Date(i.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */

export default function AdminStockImportsPage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const handleUploaded = (r: UploadResult) => setUploadResult(r);

  const handleConfirmed = () => {
    setUploadResult(null);
    setHistoryKey(k => k + 1);
  };

  const handleDiscard = () => {
    setUploadResult(null);
    setHistoryKey(k => k + 1);
  };

  return (
    <main className="admin-content">
      <div className="admin-title-row">
        <div>
          <span className="eyebrow">Operations / Inventory</span>
          <h1>Monthly Restock</h1>
          <p>Upload a refill spreadsheet to parse, preview, and safely add to existing stock.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Left: Upload or Preview */}
        <div className="admin-table-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {uploadResult ? <><FileCheck2 size={16} color="hsl(var(--primary))" /> Review & Confirm</> : <><UploadCloud size={16} color="hsl(var(--primary))" /> Upload Spreadsheet</>}
          </h3>

          {uploadResult ? (
            <ImportPreview result={uploadResult} onConfirm={handleConfirmed} onDiscard={handleDiscard} />
          ) : (
            <UploadForm onUploaded={handleUploaded} />
          )}
        </div>

        {/* Right: Rules + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* rules card */}
          <div className="admin-table-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="hsl(var(--primary))" /> Import Rules
            </h3>
            {[
              ['Additive only', 'Received quantities are added to existing stock — never overwrite.'],
              ['SKU required', 'Only existing active products matched by exact SKU are accepted.'],
              ['Reject unknowns', 'Unrecognised SKUs are flagged as errors; no auto-creation.'],
              ['Unique receipt', 'Each physical delivery must have its own unique receipt reference.'],
              ['All-or-nothing', 'If any row errors remain, the entire receipt is blocked until corrected.'],
              ['Duplicate protection', 'Same file/receipt re-uploaded returns the original result.'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <ArrowRight size={13} style={{ color: 'hsl(var(--primary))', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '12px', margin: 0 }}>{title}</p>
                  <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* history */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <History size={15} color="hsl(var(--primary))" />
              <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Import History</h3>
            </div>
            <ImportHistory key={historyKey} />
          </div>
        </div>
      </div>
    </main>
  );
}
