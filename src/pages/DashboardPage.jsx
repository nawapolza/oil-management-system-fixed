import { Activity, AlertTriangle, BarChart3, Boxes, CalendarDays, ClipboardList, Droplets, Gauge, RefreshCw, Route, Truck, Users, WalletCards, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, toastInfo } from '../utils/alerts.js';
import { date, datetime, money, number, today } from '../utils/format.js';

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage({ setPage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [filters, setFilters] = useState({ preset: 'month', from: startOfMonth(), to: today() });

  const queryParams = useMemo(() => (filters.preset === 'all' ? {} : { from: filters.from, to: filters.to }), [filters]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.dashboard(queryParams);
      setData(res.data);
      setLastLoaded(new Date().toISOString());
    } catch (err) {
      if (!silent) alertError(err, 'โหลด Dashboard ไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [queryParams]);

  const { connected, lastEventAt } = useRealtime((payload) => {
    if (['dashboard', 'deliveries', 'stocks', 'vehicles', 'users'].includes(payload?.kind)) load(true);
  }, true);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [load]);

  function applyPreset(preset) {
    if (preset === 'today') setFilters({ preset, from: today(), to: today() });
    else if (preset === '7days') setFilters({ preset, from: sevenDaysAgo(), to: today() });
    else if (preset === 'month') setFilters({ preset, from: startOfMonth(), to: today() });
    else setFilters({ preset: 'all', from: '', to: '' });
  }

  async function refresh() {
    await load(true);
    toastInfo('รีเฟรช Dashboard แล้ว');
  }

  if (loading && !data) return <Loading />;

  const periodText = filters.preset === 'all' ? 'ข้อมูลทั้งหมด' : `${date(filters.from)} - ${date(filters.to)}`;

  return (
    <div className="page-shell">
      <div className="hero-clean">
        <div className="grid gap-5 xl:grid-cols-[1fr_.75fr] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight md:text-4xl">Dashboard เจ้าของกิจการ</h1>
              <span className={connected ? 'badge bg-emerald-400/20 text-emerald-50' : 'badge bg-amber-400/20 text-amber-50'}>{connected ? <Wifi size={13} /> : <WifiOff size={13} />} {connected ? 'Realtime' : 'สำรอง 15 วิ'}</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-blue-100">ภาพรวมแบบสบายตา เลือกช่วงวันที่ได้ คำนวณอัตราสิ้นเปลืองจากระยะทางกิโลเมตรที่กรอก ÷ จำนวนลิตรน้ำมัน</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-blue-50">
              <span className="rounded-full bg-white/15 px-3 py-1.5">ช่วงข้อมูล: {periodText}</span>
              <span className="rounded-full bg-white/15 px-3 py-1.5">อัปเดต: {datetime(lastEventAt || lastLoaded)}</span>
              {(data?.low_stock_count || 0) > 0 && <span className="rounded-full bg-red-400/25 px-3 py-1.5 text-red-50">สต๊อกต่ำ {data.low_stock_count} รายการ</span>}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-3 backdrop-blur">
            <p className="mb-2 flex items-center gap-2 text-sm font-black text-blue-50"><CalendarDays size={16} /> เลือกช่วงวันที่ดูกราฟ</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PresetButton active={filters.preset === 'today'} onClick={() => applyPreset('today')}>วันนี้</PresetButton>
              <PresetButton active={filters.preset === '7days'} onClick={() => applyPreset('7days')}>7 วัน</PresetButton>
              <PresetButton active={filters.preset === 'month'} onClick={() => applyPreset('month')}>เดือนนี้</PresetButton>
              <PresetButton active={filters.preset === 'all'} onClick={() => applyPreset('all')}>ทั้งหมด</PresetButton>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="date" className="input !bg-white/95" value={filters.from} disabled={filters.preset === 'all'} onChange={(e) => setFilters((old) => ({ ...old, preset: 'custom', from: e.target.value }))} />
              <input type="date" className="input !bg-white/95" value={filters.to} disabled={filters.preset === 'all'} onChange={(e) => setFilters((old) => ({ ...old, preset: 'custom', to: e.target.value }))} />
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-soft flex-1 !bg-white/90" onClick={refresh}><RefreshCw size={18} /> รีเฟรช</button>
              <button className="btn-primary flex-1" onClick={() => setPage('stocks')}>เติมสต๊อก</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ClipboardList} label="จำนวนรายการ" value={`${number(data?.total_trips)} รายการ`} helper="รายการที่บันทึกในช่วงที่เลือก" />
        <Metric icon={Droplets} label="ลิตรรวมตามบิล" value={`${number(data?.total_liters, 2)} ลิตร`} helper="ดีเซล / น้ำมันเครื่อง / แอดบลู" />
        <Metric icon={WalletCards} label="เงินรวม" value={money(data?.total_amount)} helper={`เฉลี่ย ${number(data?.avg_price_per_liter, 2)} บาท`} />
        <Metric icon={AlertTriangle} label="แจ้งเตือนค้างอ่าน" value={`${number(data?.unread_notifications)} รายการ`} helper="รายการที่ควรตรวจสอบ" soft="red" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Route} label="ระยะทางรวม" value={`${number(data?.total_distance_km, 2)} กม.`} helper="รวมระยะทางกิโลเมตรที่กรอก" soft="emerald" />
        <Metric icon={Gauge} label="อัตราสิ้นเปลืองเฉลี่ย" value={`${number(data?.avg_fuel_efficiency_km_per_liter, 2)} กม./ลิตร`} helper="ระยะทางกิโลเมตรรวมจากข้อมูลที่กรอก ÷ จำนวนลิตรน้ำมันรวม" soft="emerald" />
        <Metric icon={Truck} label="น้ำหนักหิน/ทราย" value={`${number(data?.total_stone_weight, 2)} / ${number(data?.total_sand_weight, 2)} ตัน`} helper="แยกหินและทรายชัดเจน" soft="amber" />
        <Metric icon={Boxes} label="สต๊อกต่ำ" value={`${number(data?.low_stock_count)} รายการ`} helper="ต่ำกว่า 100 ลิตร" soft={(data?.low_stock_count || 0) ? 'red' : 'emerald'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.stocks || []).map((stock) => {
          const balance = Number(stock.balance_liters || 0);
          const state = balance < 100 ? 'ต่ำมาก' : balance < 300 ? 'ควรเตรียมเติม' : 'ปกติ';
          return (
            <div key={stock.item_type} className="card-clean p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-500">สต๊อก {stock.item_type}</p>
                  <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{number(balance, 2)}</p>
                  <p className="text-sm font-bold text-slate-400">ลิตรคงเหลือ · {state}</p>
                </div>
                <div className="rounded-3xl bg-blue-50 p-3 text-blue-700"><Boxes size={24} /></div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${balance < 100 ? 'bg-red-500' : balance < 300 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.max(8, Math.min(100, balance / 10))}%` }} /></div>
              <p className="mt-2 text-xs font-bold text-slate-400">อัปเดตล่าสุด: {datetime(stock.updated_at)}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="card-clean p-5"><SectionHead icon={BarChart3} title="กราฟลิตรต่อวัน" subtitle="ดูแนวโน้มการใช้น้ำมันตามช่วงวันที่" /><DailyChart rows={data?.by_day || []} /></div>
        <div className="card-clean p-5"><SectionHead icon={Activity} title="สัดส่วนประเภทน้ำมัน" subtitle="เปรียบเทียบปริมาณตามบิล" /><HorizontalBars rows={data?.by_item_type || []} total={data?.total_liters || 0} suffix="ลิตร" /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-clean p-5"><SectionHead icon={Truck} title="รถใช้น้ำมันสูงสุด" subtitle="จัดอันดับตามทะเบียนรถ" /><RankList rows={data?.by_plate || []} suffix="ลิตร" /></div>
        <div className="card-clean p-5"><SectionHead icon={Users} title="คนขับ / ขขร" subtitle="รวมตามชื่อคนขับ" /><RankList rows={data?.by_driver || []} suffix="ลิตร" /></div>
        <div className="card-clean p-5"><SectionHead icon={Activity} title="ปลายทางยอดนิยม" subtitle="รวมตามปลายทาง" /><RankList rows={data?.by_destination || []} suffix="ลิตร" /></div>
      </div>

      <div className="card-clean overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-lg font-black">รายการล่าสุด</h2><p className="text-xs font-bold text-slate-400">อัปเดตล่าสุด: {datetime(lastEventAt || lastLoaded)}</p></div>
          <button className="btn-soft" onClick={() => setPage('deliveries')}>ดูทั้งหมด</button>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.latest || []).map((row) => (
            <div key={row.id} className="grid gap-3 p-4 text-sm md:grid-cols-8 md:items-center">
              <div className="font-black">{date(row.work_date || row.fill_date)}</div>
              <div className="font-bold text-slate-700">{row.plate_no || '-'}</div>
              <div><span className="badge-blue">{row.item_type}</span></div>
              <div>{number(row.quantity_liters, 2)} ลิตร</div>
              <div>{money(row.amount_baht)}</div>
              <div className="font-black text-emerald-700">{number(row.fuel_efficiency_km_per_liter, 2)} กม./ลิตร</div>
              <div className="text-slate-500">{row.driver_name || '-'}</div>
              <div className="text-slate-400">{row.destination_place || '-'}</div>
            </div>
          ))}
          {!data?.latest?.length && <Empty text="ยังไม่มีรายการล่าสุด" />}
        </div>
      </div>
    </div>
  );
}

function PresetButton({ active, onClick, children }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl px-3 py-2 text-sm font-black transition ${active ? 'bg-white text-blue-700 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`}>{children}</button>;
}

function Metric({ icon: Icon, label, value, helper, soft = 'blue' }) {
  const tone = { blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700' }[soft] || 'bg-blue-50 text-blue-700';
  return <div className="card-clean p-5"><div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-3xl ${tone}`}><Icon size={24} /></div><p className="text-sm font-black text-slate-500">{label}</p><p className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{value}</p><p className="mt-2 text-xs font-bold text-slate-400">{helper}</p></div>;
}

function SectionHead({ icon: Icon, title, subtitle }) {
  return <div className="mb-4"><h2 className="flex items-center gap-2 text-lg font-black"><Icon size={20} /> {title}</h2><p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p></div>;
}

function DailyChart({ rows }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูลรายวัน" />;
  const max = Math.max(...rows.map((r) => Number(r.value || 0)), 1);
  return <div className="overflow-x-auto pb-2"><div className="flex min-w-[560px] items-end gap-2 rounded-3xl bg-slate-50 p-4">{rows.map((row) => { const height = Math.max(14, (Number(row.value || 0) / max) * 150); return <div key={row.name} className="flex flex-1 flex-col items-center justify-end gap-2"><div className="text-[10px] font-black text-slate-400">{number(row.value, 0)}</div><div className="w-full rounded-t-2xl bg-gradient-to-t from-blue-600 to-cyan-400 shadow-lg shadow-blue-600/10" style={{ height }} title={`${row.name}: ${number(row.value, 2)} ลิตร`} /><div className="w-12 truncate text-center text-[10px] font-black text-slate-500">{String(row.name).slice(5)}</div></div>; })}</div></div>;
}

function HorizontalBars({ rows, total, suffix }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูลประเภทน้ำมัน" />;
  const safeTotal = Math.max(Number(total || 0), 1);
  return <div className="space-y-4">{rows.map((item) => <div key={item.name}><div className="mb-2 flex justify-between gap-3 text-sm font-black"><span>{item.name}</span><span>{number(item.value, 2)} {suffix}</span></div><div className="h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${Math.min(100, (Number(item.value || 0) / safeTotal) * 100)}%` }} /></div><p className="mt-1 text-xs font-bold text-slate-400">{number((Number(item.value || 0) / safeTotal) * 100, 1)}%</p></div>)}</div>;
}

function RankList({ rows, suffix }) {
  if (!rows.length) return <Empty text="ยังไม่มีข้อมูล" />;
  const max = Math.max(...rows.map((r) => Number(r.value || 0)), 1);
  return <div className="space-y-2">{rows.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-3xl bg-slate-50 px-4 py-3 text-sm"><div className="mb-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-800">{index + 1}. {item.name}</p><p className="text-xs font-bold text-slate-400">{number(item.trips)} รายการ</p></div><span className="shrink-0 font-black text-blue-700">{number(item.value, 2)} {suffix}</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(5, (Number(item.value || 0) / max) * 100)}%` }} /></div></div>)}</div>;
}

function Empty({ text }) {
  return <div className="rounded-3xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">{text}</div>;
}
