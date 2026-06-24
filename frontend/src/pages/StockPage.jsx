import { Camera, FileText, History, PackagePlus, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, uploadUrl } from '../api.js';
import Loading from '../components/Loading.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import { date, datetime, ITEM_TYPES, money, number, today } from '../utils/format.js';

const blankAdd = { item_type: 'ดีเซล', transaction_date: today(), quantity_liters: '', amount_baht: '', bill_no: '', supplier_name: '', note: '' };
const blankAdjust = { item_type: 'ดีเซล', transaction_date: today(), change_liters: '', note: '' };

export default function StockPage() {
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankAdd);
  const [adjust, setAdjust] = useState(blankAdjust);
  const [file, setFile] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [stockRes, txRes] = await Promise.all([api.stocks(), api.stockTransactions()]);
      setStocks(stockRes.data || []);
      setTransactions(txRes.data || []);
    } catch (err) {
      alertError(err, 'โหลดสต๊อกไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => {
    if (payload?.kind === 'stocks' || payload?.kind === 'dashboard') load(true);
  }, true);

  useEffect(() => { load(); }, [load]);

  async function submitAdd(e) {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('stock_photo', file);
      await api.addStock(fd);
      toastSuccess('เติมสต๊อกสำเร็จ');
      setForm(blankAdd);
      setFile(null);
      load(true);
    } catch (err) {
      alertError(err, 'เติมสต๊อกไม่ได้');
    }
  }

  async function submitAdjust(e) {
    e.preventDefault();
    const ok = await confirmAction('ยืนยันปรับสต๊อก?', 'ใช้เฉพาะกรณีตรวจนับจริงแล้วตัวเลขไม่ตรง');
    if (!ok) return;
    try {
      await api.adjustStock(adjust);
      toastSuccess('ปรับสต๊อกสำเร็จ');
      setAdjust(blankAdjust);
      load(true);
    } catch (err) {
      alertError(err, 'ปรับสต๊อกไม่ได้');
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">เติมน้ำมันเข้าระบบ / เช็คสต๊อก</h1>
        <p className="page-subtitle">ใช้ collection ชื่อ stock_movements ให้ตรงกับฐานข้อมูลเดิม และหักยอดจากรายการทำน้ำมันบรรทุกอัตโนมัติ</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {stocks.map((stock) => (
          <div key={stock.item_type} className="card p-5">
            <p className="text-sm font-black text-slate-500">คงเหลือ {stock.item_type}</p>
            <p className="mt-2 text-4xl font-black text-slate-950">{number(stock.balance_liters, 2)}</p>
            <p className="text-sm font-bold text-slate-400">ลิตร</p>
            <p className="mt-4 text-xs font-bold text-slate-400">อัปเดต {datetime(stock.updated_at)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_.8fr]">
        <form onSubmit={submitAdd} className="card overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-5 text-white">
            <h2 className="flex items-center gap-2 text-xl font-black"><PackagePlus size={22} /> เติมน้ำมันเข้าระบบ</h2>
            <p className="mt-1 text-sm font-bold text-blue-50">ดีเซล / น้ำมันเครื่อง / แอดบลู</p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            <Select label="ประเภทน้ำมัน" value={form.item_type} onChange={(v) => setForm({ ...form, item_type: v })} />
            <Field type="date" label="วันที่เติม" value={form.transaction_date} onChange={(v) => setForm({ ...form, transaction_date: v })} />
            <Field required type="number" label="จำนวนลิตรที่เติมเข้าสต๊อก" value={form.quantity_liters} onChange={(v) => setForm({ ...form, quantity_liters: v })} suffix="ลิตร" />
            <Field type="number" label="จำนวนเงิน" value={form.amount_baht} onChange={(v) => setForm({ ...form, amount_baht: v })} suffix="บาท" />
            <Field label="เลขบิล" value={form.bill_no} onChange={(v) => setForm({ ...form, bill_no: v })} />
            <Field label="ผู้จำหน่าย / ร้าน" value={form.supplier_name} onChange={(v) => setForm({ ...form, supplier_name: v })} />
            <StockFilePicker file={file} setFile={setFile} />
            <label className="block md:col-span-2">
              <span className="label">หมายเหตุ</span>
              <textarea className="input mt-1 min-h-[90px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <button className="btn-primary md:col-span-2"><Plus size={18} /> บันทึกเติมสต๊อก</button>
          </div>
        </form>

        <form onSubmit={submitAdjust} className="card p-5">
          <h2 className="flex items-center gap-2 text-xl font-black"><SlidersHorizontal size={22} /> ปรับแก้ไขยอดสต๊อก</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">กรอกบวกเพื่อเพิ่ม เช่น 50 หรือกรอกลบเพื่อลด เช่น -50</p>
          <div className="mt-4 grid gap-3">
            <Select label="ประเภทน้ำมัน" value={adjust.item_type} onChange={(v) => setAdjust({ ...adjust, item_type: v })} />
            <Field type="date" label="วันที่ปรับ" value={adjust.transaction_date} onChange={(v) => setAdjust({ ...adjust, transaction_date: v })} />
            <Field required type="number" label="จำนวนปรับสต๊อก" value={adjust.change_liters} onChange={(v) => setAdjust({ ...adjust, change_liters: v })} suffix="ลิตร" />
            <label className="block">
              <span className="label">เหตุผลในการปรับ</span>
              <textarea className="input mt-1 min-h-[100px]" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} required />
            </label>
            <button className="btn-dark">ยืนยันปรับสต๊อก</button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><History size={20} /> ประวัติ stock_movements</h2></div>
        <div className="divide-y divide-slate-100">
          {transactions.map((row) => (
            <div key={row.id || `${row.created_at}-${row.item_type}`} className="grid gap-2 p-4 text-sm md:grid-cols-7 md:items-center">
              <div className="font-black">{date(row.transaction_date || row.received_date || row.created_at)}</div>
              <div><span className="badge-blue">{row.item_type || row.fuel_type}</span></div>
              <div className={Number(row.change_liters || row.quantity_liters) >= 0 ? 'font-black text-emerald-700' : 'font-black text-red-700'}>{number(row.change_liters ?? row.quantity_liters, 2)} ลิตร</div>
              <div>{money(row.amount_baht)}</div>
              <div className="truncate">{row.bill_no || '-'}</div>
              <div className="truncate text-slate-500">{row.supplier_name || row.supplier || row.transaction_type || '-'}</div>
              <div>{row.photo ? <a className="badge-blue" href={uploadUrl(row.photo)} target="_blank" rel="noreferrer">ดูรูป</a> : <span className="text-slate-300">ไม่มีรูป</span>}</div>
            </div>
          ))}
          {!transactions.length && <div className="p-8 text-center text-sm font-bold text-slate-400">ยังไม่มีประวัติสต๊อก</div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', suffix = '', required = false }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative mt-1">
        <input required={required} type={type} step={type === 'number' ? '0.01' : undefined} className={`input ${suffix ? 'pr-20' : ''}`} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Select({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>{ITEM_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </label>
  );
}


function formatFileSize(bytes = 0) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function StockFilePicker({ file, setFile }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isPdf = file && (String(file.type || '').includes('pdf') || /\.pdf$/i.test(String(file.name || '')));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="label">รูปบิล / รูปน้ำมันเข้าสต๊อก</span>
          <p className="hint mt-1">เลือกไฟล์แล้วจะแสดงตัวอย่างและชื่อไฟล์ทันที</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${file ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {file ? 'เลือกแล้ว' : 'ยังไม่เลือก'}
        </span>
      </div>
      <div className="mt-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4 text-center">
        <input
          className="block w-full cursor-pointer text-sm font-bold text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      {file && (
        <div className="mt-3 flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-emerald-100">
            {previewUrl ? (
              <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
            ) : isPdf ? (
              <FileText className="text-blue-700" size={28} />
            ) : (
              <Camera className="text-blue-700" size={28} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-emerald-800">ไฟล์ที่เลือกแล้ว</p>
            <p className="mt-1 break-all text-sm font-black text-slate-900">{file.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatFileSize(file.size)}</p>
          </div>
          <button type="button" onClick={() => setFile(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
