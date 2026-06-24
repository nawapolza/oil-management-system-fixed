import { Camera, CheckCircle2, Download, FileText, Gauge, Route, X } from 'lucide-react';
import { useState } from 'react';
import { uploadUrl } from '../api.js';
import { date, money, number, parseDecimal, roundDecimal } from '../utils/format.js';
import { saveReceiptImageToDevice } from '../utils/receiptImage.js';
import { alertSuccess, toastInfo } from '../utils/alerts.js';

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

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isPdf(path = '') {
  return String(path).toLowerCase().split('?')[0].endsWith('.pdf');
}

function litersValue(row) {
  return roundDecimal(row?.quantity_liters || row?.station_liters || row?.liters || row?.nozzle_liters || row?.station_meter_delta_liters || 0, 2);
}


function efficiencyValue(row) {
  const saved = parseDecimal(row?.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = parseDecimal(row?.distance_km, 0);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? roundDecimal(distance / liters, 2) : 0;
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
  // กันข้อมูลเก่าที่เคยบันทึกจากการพิมพ์ 8,325 แล้วระบบอ่านเป็น 8.32
  // v39: ถ้ามีจำนวนลิตรและราคาลิตรละ ให้ยึดสูตรจริงเสมอ กันค่า amount_baht ที่เพี้ยนจากคอมม่า/มือถือ
  if (expected > 0) return expected;
  return stored;
}

function meterText(value) {
  if (value === undefined || value === null || value === '') return '-';
  const n = parseDecimal(value, NaN);
  if (!Number.isFinite(n)) return String(value);
  return number(n, 0);
}

export default function CaptureReceiptModal({ row, onClose }) {
  const [savingImage, setSavingImage] = useState(false);
  if (!row) return null;

  const fillDateText = `${date(row.fill_date || row.work_date)}${row.fill_time ? ` เวลา ${row.fill_time}` : ''}`;
  const liters = litersValue(row);
  const distance = parseDecimal(row.distance_km, 0);
  const fuelRate = efficiencyValue(row);
  const before = hasValue(row?.station_meter_before) ? row.station_meter_before : row?.odometer_before;
  const after = hasValue(row?.station_meter_after) ? row.station_meter_after : row?.odometer_after;
  const photos = asArray(
    photosFor(row, 'bill_photos', 'bill_photo', 'receipt_photo'),
    photosFor(row, 'document_photos', 'document_photo'),
    photosFor(row, 'oil_photos', 'oil_photo'),
    photosFor(row, 'cargo_photos', 'cargo_photo'),
    photosFor(row, 'adblue_photos', 'adblue_photo'),
  );

  async function saveReceiptImage() {
    try {
      setSavingImage(true);
      await saveReceiptImageToDevice(row, { preferShare: false, allowFilePicker: false });
      await alertSuccess('บันทึกรูปภาพเรียบร้อย', 'ระบบส่งไฟล์ PNG ไปยังเครื่องแล้ว หากไม่พบในแกลเลอรี ให้ดูในโฟลเดอร์ดาวน์โหลดของเครื่อง');
    } catch (_) {
      toastInfo('หากมือถือไม่ดาวน์โหลด ให้กดบันทึกรูปอีกครั้งหรือเปิดด้วยเบราว์เซอร์หลัก');
    } finally {
      setSavingImage(false);
    }
  }

  return (
    <div className="capture-modal fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="capture-modal-panel max-h-[94dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[2rem] bg-slate-100 p-3 shadow-2xl sm:rounded-[2rem] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 px-1 print:hidden">
          <div className="flex min-w-0 items-center gap-2 text-white sm:text-slate-100">
            <CheckCircle2 className="shrink-0 text-emerald-300" size={22} />
            <div className="min-w-0">
              <p className="text-sm font-black">บันทึกสำเร็จ พร้อมใบสรุป</p>
              <p className="text-[11px] font-bold text-slate-200">กดบันทึกรูป PNG หรือแคปหน้าจอนี้ได้เลย</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={saveReceiptImage} disabled={savingImage} className="hidden rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/20 sm:inline-flex">
              <Download size={16} /> {savingImage ? 'กำลังบันทึก...' : 'บันทึกรูป'}
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-lg" aria-label="ปิดใบสรุป">
              <X size={20} />
            </button>
          </div>
        </div>

        <article className="capture-receipt rounded-[1.75rem] border border-teal-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
          <div className="rounded-t-[1.75rem] bg-gradient-to-br from-white via-cyan-50 to-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[.2em] text-teal-700">SWT Transport</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">ใบสรุปน้ำมัน</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">สำหรับส่งเจ้าของกิจการ</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">บันทึกแล้ว</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h3 className="mr-1 text-3xl font-black tracking-tight text-slate-950">{row.plate_no || '-'}</h3>
              <span className="badge-blue">{row.item_type || '-'}</span>
              {row.operation_type && <span className="badge-green">{row.operation_type}</span>}
            </div>
            <p className="mt-2 text-sm font-black text-slate-600">ขขร / คนขับ: <span className="text-slate-950">{row.driver_name || row.driver_name_input || '-'}</span></p>
          </div>

          <div className="space-y-3 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2">
              <CaptureBox label="วันที่/เวลาเติม" value={fillDateText} />
              <CaptureBox label="จำนวนลิตร" value={liters ? `${number(liters, 2)} ลิตร` : '-'} tone="blue" />
              <CaptureBox label="จำนวนบาท" value={money(displayAmountValue(row))} tone="blue" />
              <CaptureBox label="ราคาน้ำมันลิตรละ" value={priceText(row)} tone="green" />
              <CaptureBox label="ระยะทาง" value={distance ? `${number(distance, 2)} กม.` : '-'} />
              <CaptureBox label="อัตราสิ้นเปลือง" value={fuelRate ? `${number(fuelRate, 2)} กม./ลิตร` : '-'} tone="green" />
            </div>

            <div className="rounded-[1.35rem] border border-slate-100 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <MiniCheck icon={Gauge} label="หัวจ่ายก่อน" value={meterText(before)} />
                <MiniCheck icon={Gauge} label="หัวจ่ายหลัง" value={meterText(after)} />
                <MiniCheck icon={Route} label="จำนวนลิตรที่กรอก" value={liters ? `${number(liters, 2)} ลิตร` : '-'} />
                <MiniCheck icon={Camera} label="รูปแนบ" value={`${photos.length} ไฟล์`} />
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-slate-100 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-800">รูปภาพแนบ</p>
                <p className="text-[11px] font-bold text-slate-400">แสดง 4 รูปแรก</p>
              </div>
              {photos.length ? (
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(0, 4).map((path, index) => <CaptureThumb key={`${path}-${index}`} path={path} index={index} />)}
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-300">ไม่มีรูปแนบ</div>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-[1.35rem] border border-blue-100 bg-blue-50/70 p-3 text-xs font-bold leading-5 text-blue-900 print:hidden">
              <div className="flex items-start gap-2"><Download size={16} className="mt-0.5 shrink-0" /> กดปุ่มด้านล่างเพื่อบันทึกรูป PNG ลงเครื่อง</div>
              <button type="button" onClick={saveReceiptImage} disabled={savingImage} className="btn-primary mt-1 w-full">
                <Download size={18} /> {savingImage ? 'กำลังสร้างรูป...' : 'บันทึกรูป PNG เข้าเครื่อง'}
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function CaptureBox({ label, value, tone = 'slate' }) {
  const cls = {
    slate: 'border-slate-100 bg-slate-50 text-slate-950',
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 break-words text-[15px] font-black leading-5">{value || '-'}</p>
    </div>
  );
}

function MiniCheck({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
      <Icon size={16} className="shrink-0 text-blue-600" />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-black text-slate-400">{label}</p>
        <p className="truncate text-sm font-black text-slate-900">{value || '-'}</p>
      </div>
    </div>
  );
}

function CaptureThumb({ path, index }) {
  const href = uploadUrl(path);
  if (isPdf(path)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <FileText size={22} />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
      <img src={href} alt={`รูปแนบ ${index + 1}`} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
    </a>
  );
}
