import { Camera, ChevronDown, Edit, ExternalLink, FileText, Gauge, Route, Send, Trash2 } from 'lucide-react';
import { uploadUrl } from '../api.js';
import { date, money, number, parseDecimal, roundDecimal } from '../utils/format.js';

function asArray(...values) {
  const out = [];
  values.forEach((value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach((item) => item && out.push(item));
    else out.push(value);
  });
  return [...new Set(out.filter(Boolean))];
}

function photosFor(row, pluralKey, singleKey, aliasKey = '') {
  return asArray(row?.[pluralKey], row?.[singleKey], aliasKey ? row?.[aliasKey] : null);
}

function isPdf(path = '') {
  return String(path).toLowerCase().split('?')[0].endsWith('.pdf');
}


function round2(value) {
  return roundDecimal(value, 2);
}

function decimalPart(value) {
  const n = Math.abs(parseDecimal(value, 0));
  return Math.abs(n - Math.trunc(n));
}

function bestLitersValue(...values) {
  const candidates = values
    .map((value) => round2(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!candidates.length) return 0;
  const decimalCandidate = candidates.find((value) => decimalPart(value) > 0);
  return decimalCandidate || candidates[0];
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function distanceValue(row) {
  return parseDecimal(row?.distance_km, 0);
}

function litersValue(row) {
  return round2(row?.quantity_liters || row?.station_liters || row?.liters || row?.nozzle_liters || row?.station_meter_delta_liters || 0);
}

function meterText(value) {
  if (value === undefined || value === null || value === '') return '-';
  const n = parseDecimal(value, NaN);
  if (!Number.isFinite(n)) return String(value);
  return number(n, 0);
}

function priceText(row) {
  const price = parseDecimal(row?.price_baht_per_liter || row?.price_per_liter, 0);
  return price > 0 ? `${number(price, 2)} บาท` : '-';
}

function displayAmountValue(row) {
  const stored = parseDecimal(row?.amount_baht, 0);
  const price = parseDecimal(row?.price_baht_per_liter || row?.price_per_liter, 0);
  const liters = litersValue(row);
  const expected = price > 0 && liters > 0 ? roundDecimal(price * liters, 2) : 0;
  // v39: ถ้ามีจำนวนลิตรและราคาลิตรละ ให้ยึดสูตรจริงเสมอ กันยอดเงินเพี้ยนจากคอมม่า/มือถือ
  if (expected > 0) return expected;
  return stored;
}

function efficiency(row) {
  const saved = parseDecimal(row?.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = distanceValue(row);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? round2(distance / liters) : 0;
}



export default function DeliveryReceiptCard({ row, onEdit, onDelete }) {
  const fillDateText = `${date(row.fill_date || row.work_date)}${row.fill_time ? ` เวลา ${row.fill_time}` : ''}`;
  const distance = distanceValue(row);
  const fuelRate = efficiency(row);
  const liters = litersValue(row);
  const groups = [
    { label: 'รูปบิล', paths: photosFor(row, 'bill_photos', 'bill_photo', 'receipt_photo') },
    { label: 'รูปเอกสาร', paths: photosFor(row, 'document_photos', 'document_photo') },
    { label: 'รูปเกี่ยวกับน้ำมัน', paths: photosFor(row, 'oil_photos', 'oil_photo') },
    { label: 'รูปบรรทุก', paths: photosFor(row, 'cargo_photos', 'cargo_photo') },
    { label: 'รูปแอดบลู', paths: photosFor(row, 'adblue_photos', 'adblue_photo') },
  ];
  const allPhotos = groups.flatMap((group) => group.paths);
  return (
    <article className="receipt-card app-receipt-card overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_12px_38px_rgba(15,23,42,.06)]">
      <div className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50 to-blue-50/50 p-4 md:p-5">
        <div className="receipt-capture-banner mb-3">
          <div className="flex items-center gap-3">
            <div className="capture-header-logo"><img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[.16em] text-teal-700">SWT Transport</p>
              <h3 className="truncate text-lg font-black text-slate-950 md:text-xl">ใบสรุปน้ำมัน</h3>
              <p className="mt-0.5 text-xs font-bold text-slate-500">ข้อมูลสำคัญพร้อมส่งเจ้าของกิจการ</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="max-w-full truncate text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{row.plate_no || 'ไม่ระบุทะเบียน'}</h3>
              <span className="badge-blue">{row.item_type || '-'}</span>
              {row.operation_type && <span className="badge-green">{row.operation_type}</span>}
            </div>
            <p className="mt-2 text-sm font-bold text-slate-500">ขขร / คนขับ: <span className="text-slate-800">{row.driver_name || row.driver_name_input || '-'}</span></p>
          </div>

          {(onEdit || onDelete) && (
            <div className="flex gap-2 print:hidden lg:flex-col">
              {onEdit && <button type="button" className="btn-soft flex-1" onClick={onEdit}><Edit size={16} /> แก้ไข</button>}
              {onDelete && <button type="button" className="btn-danger flex-1" onClick={onDelete}><Trash2 size={16} /> ลบ</button>}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3 md:p-5">
        <div className="summary-grid">
          <SummaryInfo label="ทะเบียน" value={row.plate_no || '-'} tone="dark" />
          <SummaryInfo label="ขขร / คนขับ" value={row.driver_name || row.driver_name_input || '-'} />
          <SummaryInfo label="วันที่/เวลาเติม" value={fillDateText} />
          <SummaryInfo label="จำนวนลิตร" value={`${number(liters, 2)} ลิตร`} tone="blue" />
          <SummaryInfo label="จำนวนบาท" value={money(displayAmountValue(row))} tone="blue" />
          <SummaryInfo label="ราคาน้ำมันลิตรละ (บาท)" value={priceText(row)} tone="green" />
          <SummaryInfo label="อัตราสิ้นเปลือง" value={fuelRate ? `${number(fuelRate, 2)} กม./ลิตร` : '-'} tone="green" />
        </div>

        <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/70 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MiniLine icon={Route} label="ระยะทางที่ใช้คำนวณ" value={distance ? `${number(distance, 2)} กม.` : '-'} />
              <MiniLine icon={Gauge} label="ราคาน้ำมันลิตรละ (บาท)" value={priceText(row)} />
              <MiniLine icon={Gauge} label="จำนวนลิตรที่กรอก" value={liters ? `${number(liters, 2)} ลิตร` : '-'} />
              <MiniLine icon={Camera} label="รูปแนบ" value={`${allPhotos.length} ไฟล์`} />
            </div>
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 md:max-w-[260px]">
              {allPhotos.slice(0, 4).map((path, index) => <PhotoThumb key={`${path}-${index}`} path={path} index={index} small />)}
              {!allPhotos.length && <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-xs font-bold text-slate-300">ไม่มีรูป</div>}
            </div>
          </div>
        </div>

        <details className="group rounded-[1.35rem] border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-black text-slate-700">
            <span>กดดูรายละเอียดเพิ่มเติม / รูปภาพแยกหมวด</span>
            <ChevronDown size={18} className="transition group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4">
            <div className="field-grid">
              <Info label="ราคาน้ำมันลิตรละ (บาท)" value={priceText(row)} />
              <Info label="เลขมิเตอร์หัวจ่ายก่อนเติม" value={meterText(row.station_meter_before || row.odometer_before)} />
              <Info label="เลขมิเตอร์หัวจ่ายหลังเติม" value={meterText(row.station_meter_after || row.odometer_after)} />
              <Info label="ที่มาจำนวนลิตร" value={`จำนวนลิตรที่กรอก = ${liters ? `${number(liters, 2)} ลิตร` : '-'}`} />
              <Info label="ชื่อผู้กรอก" value={row.recorder_name || row.employee_name || '-'} />
              <Info label="ชื่อผู้เติม" value={row.filler_name || '-'} />
              <Info label="เบอร์รถ" value={row.vehicle_no || '-'} />
              <Info label="ต้นทาง" value={row.origin_place || '-'} />
              <Info label="ปลายทาง" value={row.destination_place || '-'} />
              <Info label="วันที่บรรทุก" value={date(row.load_date)} />
              <Info label="วันที่ลงของ" value={date(row.unload_date)} />
              <Info label="น้ำหนักหิน" value={`${number(row.cargo_stone_weight, 2)} ตัน`} />
              <Info label="น้ำหนักทราย" value={`${number(row.cargo_sand_weight, 2)} ตัน`} />
              <Info label="สถานะค่าแรง" value={row.payment_status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย / ไม่ระบุ'} />
            </div>

            {row.note && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-[11px] font-black text-amber-700">หมายเหตุ</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-amber-950">{row.note}</p>
              </div>
            )}

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-3 md:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-black text-slate-800"><Camera size={17} className="text-blue-600" /> รูปภาพแนบแยกตามหมวด</h4>
                <span className="text-xs font-bold text-slate-400">กดรูปเพื่อเปิดดู</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {groups.map((group) => <PhotoGroup key={group.label} label={group.label} paths={group.paths} />)}
              </div>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

function SummaryInfo({ label, value, tone = 'slate' }) {
  const cls = {
    slate: 'border-slate-100 bg-slate-50 text-slate-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    dark: 'border-slate-200 bg-slate-950 text-white',
  }[tone] || 'border-slate-100 bg-slate-50 text-slate-900';
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className={`text-[11px] font-black ${tone === 'dark' ? 'text-slate-300' : 'text-slate-400'}`}>{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 md:text-base">{value || '-'}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-slate-900">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 md:text-base">{value || '-'}</p>
    </div>
  );
}

function MiniLine({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2"><Icon size={16} className="shrink-0 text-blue-600" /><div className="min-w-0"><p className="truncate text-[11px] font-black text-slate-400">{label}</p><p className="truncate text-sm font-black text-slate-800">{value}</p></div></div>;
}

function PhotoGroup({ label, paths }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-600">{label}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">{paths.length} ไฟล์</span>
      </div>
      {paths.length ? (
        <div className="grid grid-cols-3 gap-2">
          {paths.map((path, index) => <PhotoThumb key={`${path}-${index}`} path={path} index={index} />)}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-300">
          ยังไม่มีรูป
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ path, index, small = false }) {
  const href = uploadUrl(path);
  const sizeClass = small ? 'h-14 w-14 shrink-0' : 'aspect-square';
  if (isPdf(path)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`group relative flex ${sizeClass} items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100`}>
        <FileText size={small ? 18 : 22} />
        <ExternalLink size={12} className="absolute opacity-0 transition group-hover:opacity-100" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`group relative block ${sizeClass} overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200`}>
      <img src={href} alt={`รูปแนบ ${index + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
      <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
    </a>
  );
}
