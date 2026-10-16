import React, { useState, useEffect, useMemo } from 'react';
import {
  UploadCloud, FileCheck2, AlertCircle, CheckCircle2, Clock,
  RefreshCcw, Download, ChevronRight, ChevronDown, X, Loader2,
  PackageCheck, ArrowRight, History, FileText, DollarSign,
  TrendingUp, CreditCard, ShieldAlert, Plus, Trash2, Eye,
  RotateCcw, Ban, Search, Filter, Calendar, ExternalLink,
  Receipt, ArrowUpRight, Check, AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { API_BASE_URL, authHeaders as sharedAuthHeaders } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function buildAuthHeaders(token?: string | null): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` };
  return sharedAuthHeaders();
}

async function apiFetch(path: string, opts: RequestInit = {}, token?: string | null) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...opts,
    headers: { ...buildAuthHeaders(token), ...(opts.headers as Record<string, string> || {}) },
  });
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

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);

/* ─── Status Badge Components ────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    uploaded:           { bg: '#e0f2fe', text: '#0369a1', icon: <UploadCloud size={12} /> },
    ready:              { bg: '#dcfce7', text: '#15803d', icon: <FileCheck2 size={12} /> },
    needs_review:       { bg: '#fef9c3', text: '#92400e', icon: <AlertCircle size={12} /> },
    posted:             { bg: '#d1fae5', text: '#065f46', icon: <CheckCircle2 size={12} /> },
    partially_credited: { bg: '#e0e7ff', text: '#3730a3', icon: <RotateCcw size={12} /> },
    credited:           { bg: '#f3e8ff', text: '#6b21a8', icon: <RotateCcw size={12} /> },
    voided:             { bg: '#fee2e2', text: '#991b1b', icon: <Ban size={12} /> },
    failed:             { bg: '#fee2e2', text: '#991b1b', icon: <AlertCircle size={12} /> },
  };
  const s = styles[status] ?? { bg: '#f3f4f6', text: '#374151', icon: <Clock size={12} /> };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {s.icon} {status.replace('_', ' ').toUpperCase()}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    paid:    { bg: '#dcfce7', text: '#15803d' },
    partial: { bg: '#fef9c3', text: '#92400e' },
    unpaid:  { bg: '#fee2e2', text: '#991b1b' },
  };
  const s = styles[status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {status.toUpperCase()}
    </span>
  );
}

/* ─── Main AdminSales Component ───────────────────────────────────────────── */

export default function AdminSales() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'queue' | 'analytics' | 'transactions'>('queue');
  
  // Queue & Active Review state
  const [uploads, setUploads] = useState<any[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<any | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload Form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadHistoryOnly, setUploadHistoryOnly] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Review Form state
  const [editFields, setEditFields] = useState<any>({});
  const [editLines, setEditLines] = useState<any[]>([]);
  const [editHistoryOnly, setEditHistoryOnly] = useState(false);

  // Analytics state
  const [summary, setSummary] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartMetric, setChartMetric] = useState<'net_sales' | 'invoice_amount' | 'invoice_count' | 'units_sold'>('net_sales');
  const [chartPeriod, setChartPeriod] = useState<'3_weeks' | 'current_week' | 'last_week' | 'two_weeks_ago'>('3_weeks');
  const [topProductsBy, setTopProductsBy] = useState<'units' | 'revenue'>('units');

  // Transactions state
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null);

  // Action Modals state
  const [paymentModalSale, setPaymentModalSale] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');

  const [returnModalSale, setReturnModalSale] = useState<any | null>(null);
  const [returnLineId, setReturnLineId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnDisposition, setReturnDisposition] = useState('sellable');
  const [returnReason, setReturnReason] = useState('Customer return');

  const [voidModalSale, setVoidModalSale] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Initial Data Loading
  useEffect(() => {
    loadUploads();
    loadProducts();
    loadAnalytics();
    loadTransactions();
  }, [token]);

  const loadUploads = async () => {
    try {
      const data = await apiFetch('/admin/sales/invoice-uploads', {}, token);
      setUploads(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await apiFetch('/product/shop', {}, token);
      setProducts(data.products || data || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadAnalytics = async () => {
    try {
      const [sumData, tsData, topData] = await Promise.all([
        apiFetch(`/admin/sales-analytics/summary?period=${chartPeriod}`, {}, token),
        apiFetch(`/admin/sales-analytics/timeseries?period=${chartPeriod}`, {}, token),
        apiFetch(`/admin/sales-analytics/products?by=${topProductsBy}`, {}, token),
      ]);
      setSummary(sumData);
      setTimeseries(tsData);
      setTopProducts(topData);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      Promise.all([
        apiFetch(`/admin/sales-analytics/summary?period=${chartPeriod}`, {}, token).then(setSummary),
        apiFetch(`/admin/sales-analytics/timeseries?period=${chartPeriod}`, {}, token).then(setTimeseries),
      ]).catch(console.error);
    }
  }, [chartPeriod, activeTab, token]);

  useEffect(() => {
    apiFetch(`/admin/sales-analytics/products?by=${topProductsBy}`, {}, token)
      .then(setTopProducts)
      .catch(console.error);
  }, [topProductsBy, token]);

  const loadTransactions = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter) params.append('status', statusFilter);
      if (paymentFilter) params.append('payment_status', paymentFilter);
      const data = await apiFetch(`/admin/sales?${params.toString()}`, {}, token);
      setTransactions(data.items || []);
      setTotalCount(data.total || 0);
    } catch (e: any) {
      console.error(e);
    }
  };

  // Upload handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('history_only', String(uploadHistoryOnly));
      const res = await apiFetch('/admin/sales/invoice-uploads', { method: 'POST', body: fd }, token);
      setUploadFile(null);
      setSuccessMsg(`Invoice '${res.original_name}' uploaded and parsed successfully!`);
      await loadUploads();
      // Auto open review
      openReview(res.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Select upload for review
  const openReview = async (uploadId: string) => {
    setReviewLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const data = await apiFetch(`/admin/sales/invoice-uploads/${uploadId}`, {}, token);
      setSelectedUpload(data);
      setEditFields(data.fields || {});
      setEditLines(data.lines || []);
      setEditHistoryOnly(data.history_only || false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch upload review draft');
    } finally {
      setReviewLoading(false);
    }
  };

  // Fetch secure document blob for inline preview
  useEffect(() => {
    if (!selectedUpload?.file_url) {
      setPreviewBlobUrl(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);

    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    const fileEndpoint = `${API_BASE_URL}${selectedUpload.file_url}`;

    fetch(fileEndpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (active) {
          const objectUrl = URL.createObjectURL(blob);
          setPreviewBlobUrl(objectUrl);
        }
      })
      .catch((err) => {
        console.warn('Preview blob fetch failed, falling back to query token URL:', err);
        if (active) {
          setPreviewBlobUrl(`${fileEndpoint}${tokenQuery}`);
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedUpload?.id, selectedUpload?.file_url, token]);

  const [reextractLoading, setReextractLoading] = useState(false);

  // Re-run AI document extraction (multi-model fallback)
  const handleReExtract = async () => {
    if (!selectedUpload) return;
    setReextractLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const data = await apiFetch(`/admin/sales/invoice-uploads/${selectedUpload.id}/re-extract`, {
        method: 'POST',
      }, token);
      setSelectedUpload(data);
      setEditFields(data.fields || {});
      setEditLines(data.lines || []);
      setEditHistoryOnly(data.history_only ?? false);
      setSuccessMsg('Document successfully re-extracted with AI Vision!');
      loadUploads();
    } catch (err: any) {
      setErrorMsg(err.message || 'Re-extraction failed');
    } finally {
      setReextractLoading(false);
    }
  };

  // Save changes to review draft
  const handleSaveReview = async () => {
    if (!selectedUpload) return;
    setReviewLoading(true);
    setErrorMsg('');
    try {
      const sanitizedLines = editLines.map((l: any) => ({
        ...l,
        is_non_stock: l.product_id ? false : (l.is_non_stock ?? true),
        base_quantity: l.base_quantity || Math.round(((Number(l.input_quantity) || 1) + (Number(l.free_quantity) || 0)) * (Number(l.conversion_factor) || 1)),
      }));
      const updated = await apiFetch(`/admin/sales/invoice-uploads/${selectedUpload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: editFields,
          lines: sanitizedLines,
          history_only: editHistoryOnly,
        }),
      }, token);
      setSelectedUpload((prev: any) => ({ ...prev, ...updated, fields: editFields, lines: sanitizedLines, history_only: editHistoryOnly }));
      setEditLines(sanitizedLines);
      setSuccessMsg('Invoice changes and product mappings updated.');
      loadUploads();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save changes');
    } finally {
      setReviewLoading(false);
    }
  };

  // Post sale & deduct stock
  const handlePostSale = async () => {
    if (!selectedUpload) return;
    setPostLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const sanitizedLines = editLines.map((l: any) => ({
        ...l,
        is_non_stock: l.product_id ? false : (l.is_non_stock ?? true),
        base_quantity: l.base_quantity || Math.round(((Number(l.input_quantity) || 1) + (Number(l.free_quantity) || 0)) * (Number(l.conversion_factor) || 1)),
      }));
      const res = await apiFetch(`/admin/sales/invoice-uploads/${selectedUpload.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: editFields,
          lines: sanitizedLines,
          history_only: editHistoryOnly,
        }),
      }, token);
      setSuccessMsg(`Sale posted successfully! Invoice ${res.invoice_number} recorded. Inventory deducted.`);
      setSelectedUpload(null);
      await Promise.all([loadUploads(), loadAnalytics(), loadTransactions()]);
      setActiveTab('transactions');
    } catch (err: any) {
      setErrorMsg(err.message || 'Posting failed');
    } finally {
      setPostLoading(false);
    }
  };

  // Delete draft upload from queue
  const handleDeleteUpload = async (uploadId: string, name: string) => {
    if (!confirm(`Delete draft "${name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/admin/sales/invoice-uploads/${uploadId}`, { method: 'DELETE' }, token);
      setSuccessMsg('Draft deleted from queue.');
      await loadUploads();
      if (selectedUpload?.id === uploadId) setSelectedUpload(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete draft');
    }
  };

  // Line editing helpers
  const updateLine = (index: number, patch: Partial<any>) => {
    const updated = [...editLines];
    updated[index] = { ...updated[index], ...patch };
    // Recalculate line total & base quantity
    const inQty = Number(updated[index].input_quantity) || 1;
    const freeQty = Number(updated[index].free_quantity) || 0;
    const conv = Number(updated[index].conversion_factor) || 1.0;
    const price = Number(updated[index].unit_price) || 0;
    const disc = Number(updated[index].line_discount) || 0;
    const tax = Number(updated[index].line_tax) || 0;

    updated[index].base_quantity = Math.floor((inQty + freeQty) * conv);
    updated[index].line_total = (inQty * price) - disc + tax;

    setEditLines(updated);

    // Update grand total
    const sub = updated.reduce((acc, l) => acc + (Number(l.line_total) || 0), 0);
    setEditFields((prev: any) => ({
      ...prev,
      subtotal: sub,
      total: sub - (Number(prev.discount) || 0) + (Number(prev.tax) || 0) + (Number(prev.roundoff) || 0),
    }));
  };

  const addLine = () => {
    const firstP = products[0];
    const newLine = {
      line_index: editLines.length + 1,
      product_id: firstP ? firstP.id : null,
      sku_snapshot: firstP ? firstP.sku : '',
      name_snapshot: firstP ? firstP.name : 'Custom Line Item',
      input_quantity: 1,
      free_quantity: 0,
      input_unit: firstP ? (firstP.stock_unit || 'unit') : 'unit',
      conversion_factor: 1.0,
      base_quantity: 1,
      unit_price: firstP ? Number(firstP.price) : 0,
      line_discount: 0,
      line_tax: 0,
      line_total: firstP ? Number(firstP.price) : 0,
      is_non_stock: false,
      current_stock: firstP ? firstP.stock : 0,
      stock_available: firstP ? firstP.stock >= 1 : true,
    };
    setEditLines([...editLines, newLine]);
  };

  const removeLine = (index: number) => {
    setEditLines(editLines.filter((_, i) => i !== index));
  };

  // Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSale) return;
    try {
      await apiFetch(`/admin/sales/${paymentModalSale.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          method: paymentMethod,
          reference: paymentRef,
        }),
      }, token);
      setPaymentModalSale(null);
      setPaymentAmount('');
      setPaymentRef('');
      setSuccessMsg('Payment recorded successfully.');
      loadTransactions();
      loadAnalytics();
    } catch (err: any) {
      alert(err.message || 'Payment recording failed');
    }
  };

  // Record Return
  const handleRecordReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalSale || !returnLineId) return;
    try {
      await apiFetch(`/admin/sales/${returnModalSale.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: returnLineId,
          quantity: parseInt(returnQty),
          disposition: returnDisposition,
          reason: returnReason,
        }),
      }, token);
      setReturnModalSale(null);
      setSuccessMsg('Return processed and sellable stock updated if applicable.');
      loadTransactions();
      loadAnalytics();
    } catch (err: any) {
      alert(err.message || 'Return recording failed');
    }
  };

  // Void Sale
  const handleVoidSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalSale || !voidReason.trim()) return;
    try {
      await apiFetch(`/admin/sales/${voidModalSale.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      }, token);
      setVoidModalSale(null);
      setVoidReason('');
      setSuccessMsg('Sale voided. Inventory deductions have been reversed.');
      loadTransactions();
      loadAnalytics();
    } catch (err: any) {
      alert(err.message || 'Void operation failed');
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'hsl(var(--foreground))' }}>
              Offline Sales Register & Invoice Uploads
            </h1>
            <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '12px', fontWeight: 600 }}>
              Feature 2 • Shared Stock Ledger
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
            Internal sales recording for physical dispensing, document reading, inventory deduction, and financial analytics.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--muted)/0.5)', padding: '6px 12px', borderRadius: '8px' }}>
            Timezone: <strong>Asia/Kolkata (IST)</strong> • Currency: <strong>INR (₹)</strong>
          </span>
          <button className="btn btn-outline" onClick={() => { loadUploads(); loadAnalytics(); loadTransactions(); }} title="Refresh All Data">
            <RefreshCcw size={15} />
          </button>
        </div>
      </div>

      {/* ── Notification Banners ── */}
      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d' }}><X size={16} /></button>
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border))', marginBottom: '24px', gap: '24px' }}>
        <button
          onClick={() => setActiveTab('queue')}
          style={{
            background: 'none', border: 'none', padding: '12px 4px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            color: activeTab === 'queue' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            borderBottom: activeTab === 'queue' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <UploadCloud size={16} /> Upload & Review Queue
          {uploads.length > 0 && (
            <span style={{ background: 'hsl(var(--primary))', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>
              {uploads.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            background: 'none', border: 'none', padding: '12px 4px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            color: activeTab === 'analytics' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            borderBottom: activeTab === 'analytics' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <TrendingUp size={16} /> Sales Dashboard & Charts
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          style={{
            background: 'none', border: 'none', padding: '12px 4px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            color: activeTab === 'transactions' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            borderBottom: activeTab === 'transactions' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <History size={16} /> Previous Transactions
          <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>
            {totalCount}
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: UPLOAD & REVIEW QUEUE                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'queue' && (
        <div>
          {/* If no upload selected, show Upload form + Queue list */}
          {!selectedUpload ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '28px', alignItems: 'start' }}>
              {/* Upload Card */}
              <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UploadCloud size={20} style={{ color: 'hsl(var(--primary))' }} /> Upload Sales Invoice
                </h2>
                <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', margin: '0 0 20px' }}>
                  Select PDF or photo/scan (JPG, PNG, WebP) of an outgoing sale. System extracts lines & quantities.
                </p>

                <form onSubmit={handleUploadSubmit}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]);
                    }}
                    style={{
                      border: `2px dashed ${dragging ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                      borderRadius: '12px', padding: '32px 16px', textAlign: 'center',
                      background: dragging ? 'hsl(var(--primary)/0.05)' : 'hsl(var(--background))',
                      cursor: 'pointer', marginBottom: '18px', transition: 'all 0.15s ease'
                    }}
                    onClick={() => document.getElementById('sales-file-input')?.click()}
                  >
                    <input
                      id="sales-file-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files?.[0] && setUploadFile(e.target.files[0])}
                    />
                    <FileText size={36} style={{ color: 'hsl(var(--primary))', margin: '0 auto 10px', opacity: 0.8 }} />
                    <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>
                      {uploadFile ? uploadFile.name : 'Click to select or drag & drop'}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                      PDF, JPG, PNG, WebP up to 15 MiB (max 10 pages)
                    </p>
                  </div>

                  <div style={{ marginBottom: '18px', padding: '12px', background: 'hsl(var(--muted)/0.3)', borderRadius: '8px', fontSize: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={uploadHistoryOnly}
                        onChange={(e) => setUploadHistoryOnly(e.target.checked)}
                      />
                      <span>Historical record only (Stores sale, NO stock deduction)</span>
                    </label>
                    <p style={{ margin: '4px 0 0 24px', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                      Use only for sales predating the inventory cutoff or already deducted manually.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={!uploadFile || loading}
                    className="btn btn-primary w-full"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                    {loading ? 'Reading & Extracting Document...' : 'Upload & Extract Document'}
                  </button>
                </form>
              </div>

              {/* Review Queue List */}
              <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                    Processing & Review Queue ({uploads.length})
                  </h2>
                  <button className="btn btn-sm btn-outline" onClick={loadUploads}>
                    <RefreshCcw size={13} /> Refresh
                  </button>
                </div>

                {uploads.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px', color: 'hsl(var(--muted-foreground))' }}>
                    <PackageCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>Review Queue is Clear</p>
                    <p style={{ margin: 0, fontSize: '12px' }}>Upload an outgoing sales invoice to review and deduct stock.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {uploads.map((u) => (
                      <div
                        key={u.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 18px', borderRadius: '10px', border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <FileText size={22} style={{ color: 'hsl(var(--primary))' }} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>{u.original_name}</span>
                              <StatusBadge status={u.status} />
                              {u.history_only && (
                                <span style={{ fontSize: '10px', background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
                                  HISTORICAL ONLY
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                              Invoice: <strong>{u.fields?.invoice_number || 'Pending'}</strong> • Date: {u.fields?.invoice_date || 'N/A'} • Total: {fmtCurrency(u.fields?.total || 0)}
                            </div>
                            {u.warnings && u.warnings.length > 0 && (
                              <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={12} /> {u.warnings[0]} {u.warnings.length > 1 && `(+${u.warnings.length - 1} more)`}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            title="Delete this draft"
                            onClick={() => handleDeleteUpload(u.id, u.original_name)}
                            style={{
                              background: 'none', border: '1px solid #fca5a5', borderRadius: '8px',
                              color: '#ef4444', cursor: 'pointer', padding: '6px 8px',
                              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                          <button className="btn btn-sm btn-primary" onClick={() => openReview(u.id)}>
                            Review & Post <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Step C: Side-by-side Review Screen ── */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <button className="btn btn-sm btn-outline" onClick={() => setSelectedUpload(null)}>
                  &larr; Back to Queue
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <StatusBadge status={selectedUpload.status} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Revision {selectedUpload.revision}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 480px) 1fr', gap: '24px', alignItems: 'start' }}>
                {/* Left Pane: Document Viewer */}
                <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '16px', position: 'sticky', top: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>Original Document Preview</span>
                    <a
                      href={previewBlobUrl || `${API_BASE_URL}${selectedUpload.file_url}?token=${encodeURIComponent(token || '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                    >
                      <ExternalLink size={12} /> Open Full / New Tab
                    </a>
                  </div>

                  <div style={{ width: '100%', height: '540px', background: '#f8fafc', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {previewLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'hsl(var(--muted-foreground))' }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span style={{ fontSize: '12px' }}>Loading document preview...</span>
                      </div>
                    ) : previewBlobUrl ? (
                      selectedUpload.original_name.toLowerCase().endsWith('.pdf') ? (
                        <iframe
                          src={previewBlobUrl}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          title="Invoice PDF"
                        />
                      ) : (
                        <img
                          src={previewBlobUrl}
                          alt="Invoice scan"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            const target = e.currentTarget;
                            const fallback = `${API_BASE_URL}${selectedUpload.file_url}?token=${encodeURIComponent(token || '')}`;
                            if (target.src !== fallback) {
                              target.src = fallback;
                            }
                          }}
                        />
                      )
                    ) : (
                      <div style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '12px' }}>
                        Preview unavailable
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                    Original file preserved privately. Retained as immutable legal evidence.
                  </div>
                </div>

                {/* Right Pane: Editable Structured Review & Validation */}
                <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>Review Extracted Data</h3>
                      <p style={{ margin: 0, fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                        Deterministic business validations. Admin confirms quantities and product mappings before stock ledger update.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ color: '#0369a1', borderColor: '#bae6fd' }}
                        onClick={handleReExtract}
                        disabled={reextractLoading}
                        title="Re-run AI extraction with fallback models"
                      >
                        {reextractLoading ? (
                          <><Loader2 size={13} className="animate-spin" /> Extracting...</>
                        ) : (
                          <><RefreshCcw size={13} /> Re-extract AI</>
                        )}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={handleSaveReview} disabled={reviewLoading}>
                        {reviewLoading ? <Loader2 size={13} className="animate-spin" /> : 'Save Draft'}
                      </button>
                    </div>
                  </div>

                  {/* Header metadata fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px', padding: '16px', background: 'hsl(var(--background))', borderRadius: '10px', border: '1px solid hsl(var(--border))' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
                        Invoice Number *
                      </label>
                      <input
                        className="field w-full"
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                        value={editFields.invoice_number || ''}
                        onChange={(e) => setEditFields({ ...editFields, invoice_number: e.target.value })}
                        placeholder="e.g. AA-2026-0108"
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
                        Invoice Date *
                      </label>
                      <input
                        type="date"
                        className="field w-full"
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                        value={editFields.invoice_date || ''}
                        onChange={(e) => setEditFields({ ...editFields, invoice_date: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
                        Customer / Clinic Name
                      </label>
                      <input
                        className="field w-full"
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                        value={editFields.customer_name || ''}
                        onChange={(e) => setEditFields({ ...editFields, customer_name: e.target.value })}
                        placeholder="e.g. City Hospital Dispensary"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
                        Customer Phone / Contact
                      </label>
                      <input
                        className="field w-full"
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                        value={editFields.customer_contact || ''}
                        onChange={(e) => setEditFields({ ...editFields, customer_contact: e.target.value })}
                        placeholder="e.g. +91 98765 43210"
                      />
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>Line Items & Stock Deductions</span>
                      <button className="btn btn-sm btn-outline" onClick={addLine} style={{ fontSize: '11px', padding: '4px 8px' }}>
                        <Plus size={12} /> Add Line
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'hsl(var(--muted)/0.4)', textAlign: 'left', borderBottom: '1px solid hsl(var(--border))' }}>
                            <th style={{ padding: '8px 10px' }}>#</th>
                            <th style={{ padding: '8px 10px', minWidth: '180px' }}>Product / SKU Mapping</th>
                            <th style={{ padding: '8px 10px', width: '70px' }}>Qty</th>
                            <th style={{ padding: '8px 10px', width: '70px' }}>Free</th>
                            <th style={{ padding: '8px 10px', width: '80px' }}>Unit</th>
                            <th style={{ padding: '8px 10px', width: '90px' }}>Rate (₹)</th>
                            <th style={{ padding: '8px 10px', width: '90px' }}>Total (₹)</th>
                            <th style={{ padding: '8px 10px', width: '120px' }}>Stock Status</th>
                            <th style={{ padding: '8px 10px', width: '40px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {editLines.map((line, idx) => {
                            const matchedP = products.find(p => p.id === line.product_id);
                            const currentStock = matchedP ? matchedP.stock : (line.current_stock || 0);
                            const baseDeduct = Number(line.base_quantity) || 1;
                            const isStockSufficient = currentStock >= baseDeduct;

                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: '8px 10px' }}>
                                  <select
                                    className="field"
                                    style={{ width: '100%', padding: '4px 8px', fontSize: '12px' }}
                                    value={line.product_id || ''}
                                    onChange={(e) => {
                                      const p = products.find(prod => prod.id === e.target.value);
                                      if (p) {
                                        updateLine(idx, {
                                          product_id: p.id,
                                          sku_snapshot: p.sku,
                                          name_snapshot: p.name,
                                          unit_price: Number(p.price),
                                          input_unit: p.stock_unit || 'unit',
                                          current_stock: p.stock,
                                          is_non_stock: false,  // ← critical: unmapped → mapped
                                          stock_available: p.stock >= baseDeduct,
                                        });
                                      }
                                    }}
                                  >
                                    <option value="">-- Select Product --</option>
                                    {products.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} ({p.sku}) — Stock: {p.stock} {p.stock_unit || 'units'}
                                      </option>
                                    ))}
                                  </select>
                                  {line.raw_description && (
                                    <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                                      Extracted: <em>{line.raw_description}</em>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <input
                                    type="number"
                                    min="1"
                                    className="field"
                                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                                    value={line.input_quantity || 1}
                                    onChange={(e) => {
                                      const newQty = parseInt(e.target.value) || 1;
                                      const conv = Number(line.conversion_factor) || 1;
                                      updateLine(idx, {
                                        input_quantity: newQty,
                                        base_quantity: Math.round((newQty + (line.free_quantity || 0)) * conv),
                                      });
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    className="field"
                                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                                    value={line.free_quantity || 0}
                                    onChange={(e) => {
                                      const newFree = parseInt(e.target.value) || 0;
                                      const conv = Number(line.conversion_factor) || 1;
                                      updateLine(idx, {
                                        free_quantity: newFree,
                                        base_quantity: Math.round(((line.input_quantity || 1) + newFree) * conv),
                                      });
                                    }}
                                    title="Bonus / free units (reduces physical stock, unbilled)"
                                  />
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <input
                                    className="field"
                                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                                    value={line.input_unit || 'unit'}
                                    onChange={(e) => updateLine(idx, { input_unit: e.target.value })}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="field"
                                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                                    value={line.unit_price || 0}
                                    onChange={(e) => updateLine(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                  {fmtCurrency(Number(line.line_total) || 0)}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  {editHistoryOnly ? (
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>No Stock Effect</span>
                                  ) : isStockSufficient ? (
                                    <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <Check size={11} /> Avail ({currentStock})
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <AlertTriangle size={11} /> Short ({currentStock})
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <button
                                    onClick={() => removeLine(idx)}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                    title="Delete line"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Totals Reconciliation */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '20px', alignItems: 'start', marginBottom: '24px' }}>
                    {/* Warnings & History toggle */}
                    <div>
                      {selectedUpload.warnings && selectedUpload.warnings.length > 0 && (
                        <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '12px' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} /> Attention Needed Before Posting:
                          </span>
                          <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11px', color: '#78350f' }}>
                            {selectedUpload.warnings.map((w: string, i: number) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', padding: '10px', background: 'hsl(var(--background))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}>
                        <input
                          type="checkbox"
                          checked={editHistoryOnly}
                          onChange={(e) => setEditHistoryOnly(e.target.checked)}
                        />
                        <span>
                          <strong>Post as Historical Record Only:</strong> Stores sale for revenue metrics, but does NOT decrement current inventory.
                        </span>
                      </label>
                    </div>

                    {/* Totals Box */}
                    <div style={{ padding: '16px', background: 'hsl(var(--background))', borderRadius: '10px', border: '1px solid hsl(var(--border))' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal:</span>
                        <span>{fmtCurrency(Number(editFields.subtotal) || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Discount:</span>
                        <span>- {fmtCurrency(Number(editFields.discount) || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax (GST):</span>
                        <span>+ {fmtCurrency(Number(editFields.tax) || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, borderTop: '1px solid hsl(var(--border))', paddingTop: '8px', marginTop: '6px' }}>
                        <span>Grand Total:</span>
                        <span style={{ color: 'hsl(var(--primary))' }}>{fmtCurrency(Number(editFields.total) || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Posting Confirmation Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn btn-outline" onClick={() => setSelectedUpload(null)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handlePostSale}
                      disabled={postLoading || !editFields.invoice_number}
                      style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {postLoading ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                      {editHistoryOnly ? 'Confirm & Record Historical Sale' : 'Confirm Sale & Deduct Stock'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SALES DASHBOARD & CHARTS                                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && summary && (
        <div>
          {/* Week Cohort Selector Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '14px 18px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                Reporting Cohort
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'hsl(var(--foreground))', marginTop: '2px' }}>
                {summary.period_label || 'All 3 Weeks (Current & Past 2 Weeks)'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', background: 'hsl(var(--muted)/0.6)', padding: '4px', borderRadius: '8px' }}>
              {([
                { id: '3_weeks', label: summary?.period_label?.startsWith('All ') ? `${summary.period_label.split(' (')[0]} (Overview)` : 'All Invoices (Overview)' },
                { id: 'current_week', label: 'Current Week' },
                { id: 'last_week', label: 'Last Week' },
                { id: 'two_weeks_ago', label: '2 Weeks Ago' },
              ] as const).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setChartPeriod(p.id)}
                  style={{
                    background: chartPeriod === p.id ? 'hsl(var(--primary))' : 'transparent',
                    color: chartPeriod === p.id ? 'white' : 'hsl(var(--muted-foreground))',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    boxShadow: chartPeriod === p.id ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Net Product Sales</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px', color: 'hsl(var(--foreground))' }}>
                {fmtCurrency(summary.net_product_sales)}
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Excl. tax & return credits</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Total Invoiced</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px', color: 'hsl(var(--foreground))' }}>
                {fmtCurrency(summary.total_invoiced)}
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Gross invoices minus credits</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Recorded Collections</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px', color: '#16a34a' }}>
                {fmtCurrency(summary.collections)}
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Cash, UPI & bank payments</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Outstanding Due</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px', color: summary.outstanding > 0 ? '#ea580c' : '#16a34a' }}>
                {fmtCurrency(summary.outstanding)}
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Invoiced minus collections</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Posted Transactions</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px' }}>
                {summary.total_transactions}
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Avg value: {fmtCurrency(summary.avg_invoice_value)}</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Net Units Sold</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px' }}>
                {summary.net_units_sold} units
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Deducted from stock ledger</span>
            </div>

            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '18px' }}>
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>Low Stock Alert</span>
              <div style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px', color: summary.low_stock_count > 0 ? '#dc2626' : '#16a34a' }}>
                {summary.low_stock_count} SKUs
              </div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>Items below 25 units</span>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 380px', gap: '24px', alignItems: 'start' }}>
            {/* Chart 1: Daily Sales Bar Chart */}
            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                    Daily Sales — {chartPeriod === '3_weeks' ? (summary?.period_label?.startsWith('All ') ? `${summary.period_label.split(' (')[0]} (Overview)` : 'Sales Overview') : chartPeriod === 'current_week' ? 'Current Week' : chartPeriod === 'last_week' ? 'Last Week' : '2 Weeks Ago'} (Zero-Filled)
                  </h3>
                  <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                    {summary.period_label || 'IST business dates'}
                  </span>
                </div>

                {/* Metric Selector */}
                <div style={{ display: 'flex', gap: '6px', background: 'hsl(var(--muted)/0.5)', padding: '4px', borderRadius: '8px' }}>
                  {(['net_sales', 'invoice_amount', 'invoice_count', 'units_sold'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setChartMetric(m)}
                      style={{
                        background: chartMetric === m ? 'white' : 'transparent',
                        border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                        color: chartMetric === m ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        boxShadow: chartMetric === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {m === 'net_sales' ? 'Net Sales (₹)' : m === 'invoice_amount' ? 'Invoiced (₹)' : m === 'invoice_count' ? 'Invoices' : 'Units'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar Chart Container */}
              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} />
                    <YAxis
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => chartMetric.includes('sales') || chartMetric.includes('amount') ? `₹${val}` : val}
                    />
                    <Tooltip
                      formatter={(val: any) => [
                        chartMetric.includes('sales') || chartMetric.includes('amount') ? fmtCurrency(Number(val)) : val,
                        chartMetric === 'net_sales' ? 'Net Product Sales' : chartMetric === 'invoice_amount' ? 'Invoiced Amount' : chartMetric === 'invoice_count' ? 'Invoices' : 'Units Sold'
                      ]}
                      labelFormatter={(label) => `Business Date: ${label}`}
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Bar
                      dataKey={chartMetric}
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Accessible Data Table Accompanying Chart (Section 15 requirement) */}
              <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'hsl(var(--muted)/0.3)', borderBottom: '1px solid hsl(var(--border))' }}>
                      <th style={{ padding: '6px' }}>Date</th>
                      <th style={{ padding: '6px' }}>Net Sales</th>
                      <th style={{ padding: '6px' }}>Invoiced</th>
                      <th style={{ padding: '6px' }}>Invoices</th>
                      <th style={{ padding: '6px' }}>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeseries.map((row) => (
                      <tr key={row.date} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                        <td style={{ padding: '6px', fontWeight: 600 }}>{row.label}</td>
                        <td style={{ padding: '6px' }}>{fmtCurrency(row.net_sales)}</td>
                        <td style={{ padding: '6px' }}>{fmtCurrency(row.invoice_amount)}</td>
                        <td style={{ padding: '6px' }}>{row.invoice_count}</td>
                        <td style={{ padding: '6px' }}>{row.units_sold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Chart 2: Top Selling Products */}
            <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Top Selling Products</h3>
                <div style={{ display: 'flex', gap: '4px', background: 'hsl(var(--muted)/0.5)', padding: '2px', borderRadius: '6px' }}>
                  <button
                    onClick={() => setTopProductsBy('units')}
                    style={{
                      background: topProductsBy === 'units' ? 'white' : 'transparent',
                      border: 'none', borderRadius: '4px', padding: '3px 6px', fontSize: '10px', fontWeight: 600,
                      color: topProductsBy === 'units' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      cursor: 'pointer'
                    }}
                  >
                    Units
                  </button>
                  <button
                    onClick={() => setTopProductsBy('revenue')}
                    style={{
                      background: topProductsBy === 'revenue' ? 'white' : 'transparent',
                      border: 'none', borderRadius: '4px', padding: '3px 6px', fontSize: '10px', fontWeight: 600,
                      color: topProductsBy === 'revenue' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      cursor: 'pointer'
                    }}
                  >
                    Revenue
                  </button>
                </div>
              </div>

              {topProducts.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', textAlign: 'center', margin: '30px 0' }}>
                  No sales recorded yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {topProducts.map((p, idx) => (
                    <div key={p.product_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'hsl(var(--muted-foreground))', width: '16px' }}>{idx + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
                            {p.sku} • {p.unit}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px' }}>
                        <div style={{ fontWeight: 700, color: 'hsl(var(--primary))' }}>
                          {topProductsBy === 'units' ? `${p.units_sold} units` : fmtCurrency(p.revenue)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
                          {topProductsBy === 'units' ? fmtCurrency(p.revenue) : `${p.units_sold} units`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: PREVIOUS TRANSACTIONS LIST                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'transactions' && (
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '14px', padding: '24px' }}>
          {/* Search, Filter & Export toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'hsl(var(--muted-foreground))' }} />
                <input
                  className="field"
                  style={{ paddingLeft: '32px', fontSize: '13px', width: '100%' }}
                  placeholder="Search invoice # or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadTransactions()}
                />
              </div>

              <select
                className="field"
                style={{ fontSize: '13px', padding: '7px 10px' }}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); }}
              >
                <option value="">All Statuses</option>
                <option value="posted">Posted</option>
                <option value="partially_credited">Partially Credited</option>
                <option value="voided">Voided</option>
              </select>

              <select
                className="field"
                style={{ fontSize: '13px', padding: '7px 10px' }}
                value={paymentFilter}
                onChange={(e) => { setPaymentFilter(e.target.value); }}
              >
                <option value="">All Payments</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
              </select>

              <button className="btn btn-sm btn-outline" onClick={loadTransactions}>
                Filter
              </button>
            </div>

            <a
              href={`${API_BASE_URL}/api/admin/sales/export`}
              download
              className="btn btn-sm btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} /> Export CSV
            </a>
          </div>

          {/* Transactions Table */}
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'hsl(var(--muted-foreground))' }}>
              <Receipt size={44} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600 }}>No Transactions Found</p>
              <p style={{ margin: 0, fontSize: '13px' }}>Post sales from the review queue to see historical transactions here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'hsl(var(--muted)/0.3)', textAlign: 'left', borderBottom: '1px solid hsl(var(--border))' }}>
                    <th style={{ padding: '10px 14px' }}>Invoice #</th>
                    <th style={{ padding: '10px 14px' }}>Date</th>
                    <th style={{ padding: '10px 14px' }}>Customer</th>
                    <th style={{ padding: '10px 14px' }}>Lines</th>
                    <th style={{ padding: '10px 14px' }}>Total Amount</th>
                    <th style={{ padding: '10px 14px' }}>Payment</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.invoice_number}</td>
                      <td style={{ padding: '10px 14px', color: 'hsl(var(--muted-foreground))' }}>{tx.invoice_date}</td>
                      <td style={{ padding: '10px 14px' }}>{tx.customer_name || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{tx.line_count} items</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmtCurrency(tx.total)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <PaymentBadge status={tx.payment_status} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={tx.status} />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={async () => {
                              const detail = await apiFetch(`/admin/sales/${tx.id}`, {}, token);
                              setSelectedSaleDetail(detail);
                            }}
                            title="View full line details & document"
                          >
                            <Eye size={13} />
                          </button>

                          {tx.payment_status !== 'paid' && tx.status !== 'voided' && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => { setPaymentModalSale(tx); setPaymentAmount(String(tx.total)); }}
                              title="Record physical collection"
                              style={{ color: '#16a34a' }}
                            >
                              <CreditCard size={13} />
                            </button>
                          )}

                          {tx.status === 'posted' && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={async () => {
                                const detail = await apiFetch(`/admin/sales/${tx.id}`, {}, token);
                                setReturnModalSale(detail);
                                setReturnLineId(detail.lines[0]?.id || '');
                              }}
                              title="Customer Return"
                              style={{ color: '#6366f1' }}
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}

                          {tx.status !== 'voided' && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => setVoidModalSale(tx)}
                              title="Compensating void reversal"
                              style={{ color: '#dc2626' }}
                            >
                              <Ban size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* DETAIL MODAL: PREVIOUS TRANSACTION INSPECT LATER (Step E)               */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {selectedSaleDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '850px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                    Invoice {selectedSaleDetail.invoice_number}
                  </h3>
                  <StatusBadge status={selectedSaleDetail.status} />
                  <PaymentBadge status={selectedSaleDetail.payment_status} />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Dated: {selectedSaleDetail.invoice_date} • Customer: {selectedSaleDetail.customer_name || 'Walk-in'} • Posted: {selectedSaleDetail.posted_at}
                </p>
              </div>
              <button onClick={() => setSelectedSaleDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {/* Original Attachment Download / Preview */}
            {selectedSaleDetail.attachments && selectedSaleDetail.attachments.length > 0 && (
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} style={{ color: '#0284c7' }} />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{selectedSaleDetail.attachments[0].filename}</span>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Stored original invoice attachment</p>
                  </div>
                </div>
                <a
                  href={`${API_BASE_URL}${selectedSaleDetail.attachments[0].download_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <ExternalLink size={12} /> View Original Document
                </a>
              </div>
            )}

            {/* Lines Table */}
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Line Items Snapshot</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px' }}>SKU</th>
                  <th style={{ padding: '8px 10px' }}>Product</th>
                  <th style={{ padding: '8px 10px' }}>Qty (Input)</th>
                  <th style={{ padding: '8px 10px' }}>Stock Deducted</th>
                  <th style={{ padding: '8px 10px' }}>Rate</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedSaleDetail.lines.map((l: any) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.sku}</td>
                    <td style={{ padding: '8px 10px' }}>{l.name}</td>
                    <td style={{ padding: '8px 10px' }}>{l.input_quantity} {l.input_unit} {l.free_quantity > 0 && `(+${l.free_quantity} free)`}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#dc2626' }}>−{l.base_quantity} units</td>
                    <td style={{ padding: '8px 10px' }}>{fmtCurrency(l.unit_price)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Payment & Return Histories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 8px', color: '#334155' }}>Payment Collections</h5>
                {selectedSaleDetail.payments.length === 0 ? (
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>No payments recorded yet.</p>
                ) : (
                  selectedSaleDetail.payments.map((p: any) => (
                    <div key={p.id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #e2e8f0' }}>
                      <span>{p.collection_date} ({p.method.toUpperCase()}):</span>
                      <strong style={{ color: '#16a34a' }}>{fmtCurrency(p.amount)}</strong>
                    </div>
                  ))
                )}
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 8px', color: '#334155' }}>Returns & Credits</h5>
                {selectedSaleDetail.returns.length === 0 ? (
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>No returns processed.</p>
                ) : (
                  selectedSaleDetail.returns.map((r: any) => (
                    <div key={r.id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #e2e8f0' }}>
                      <span>{r.return_date} ({r.disposition}): {r.quantity} returned</span>
                      <strong style={{ color: '#dc2626' }}>{fmtCurrency(r.credit_amount)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedSaleDetail.voided_at && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '8px', color: '#991b1b', fontSize: '12px', marginBottom: '16px' }}>
                <strong>Voided at:</strong> {selectedSaleDetail.voided_at} • <strong>Reason:</strong> {selectedSaleDetail.void_reason}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setSelectedSaleDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Recording Modal ── */}
      {paymentModalSale && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
              Record Payment Collection
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
              Invoice {paymentModalSale.invoice_number} • Total {fmtCurrency(paymentModalSale.total)}
            </p>

            <form onSubmit={handleRecordPayment}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="field w-full"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Payment Method</label>
                <select
                  className="field w-full"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Reference / Transaction ID</label>
                <input
                  className="field w-full"
                  placeholder="e.g. UPI Ref # or Receipt #..."
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setPaymentModalSale(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Return Recording Modal ── */}
      {returnModalSale && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', maxWidth: '460px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
              Process Customer Return / Credit
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
              Invoice {returnModalSale.invoice_number}
            </p>

            <form onSubmit={handleRecordReturn}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Select Line Item</label>
                <select
                  className="field w-full"
                  value={returnLineId}
                  onChange={(e) => setReturnLineId(e.target.value)}
                  required
                >
                  {returnModalSale.lines.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.input_quantity} bought, {l.returned_quantity} returned already)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Quantity to Return</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="field w-full"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Disposition</label>
                <select
                  className="field w-full"
                  value={returnDisposition}
                  onChange={(e) => setReturnDisposition(e.target.value)}
                >
                  <option value="sellable">Sellable (Restores physical inventory)</option>
                  <option value="damaged">Damaged / Expired (No stock addition)</option>
                  <option value="quarantined">Quarantined</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Reason</label>
                <input
                  className="field w-full"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setReturnModalSale(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Process Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Void Modal ── */}
      {voidModalSale && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Ban size={20} /> Void Sale Transaction
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
              Compensating reversal for <strong>Invoice {voidModalSale.invoice_number}</strong>. This will restore all deducted stock balances back into inventory.
            </p>

            <form onSubmit={handleVoidSale}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Reason for Void *</label>
                <textarea
                  required
                  rows={3}
                  className="field w-full"
                  placeholder="e.g. Erroneous scan, duplicated invoice entry..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setVoidModalSale(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" style={{ background: '#dc2626', color: 'white', border: 'none' }} disabled={!voidReason.trim()}>
                  Confirm Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
