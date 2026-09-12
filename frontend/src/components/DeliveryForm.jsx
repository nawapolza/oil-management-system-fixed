import { CalendarDays, Camera, CheckCircle2, ChevronDown, ClipboardList, Clock3, Droplets, FileText, Gauge, HelpCircle, MapPin, RotateCcw, Save, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadUrl } from '../api.js';
import CaptureReceiptModal from './CaptureReceiptModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { alertError, confirmAction, toastInfo, toastSuccess } from '../utils/alerts.js';
import { ITEM_TYPES, currentTime, date as formatThaiDate, money, number, parseDecimal, roundDecimal, today } from '../utils/format.js';

const DRAFT_VERSION = 'oilops_delivery_draft_v40_mobile_app';
const DEVICE_KEY = 'oilops_device_id_v13';
const DEVICE_RECORDER_KEY = 'oilops_device_recorder_name_v22';
const IMAGE_UPLOAD_MAX_WIDTH = 1800;
const IMAGE_UPLOAD_MAX_HEIGHT = 1800;
const IMAGE_UPLOAD_QUALITY = 0.82;
const IMAGE_COMPRESS_MIN_BYTES = 900 * 1024;

const blank = {
  work_date: today(),
  fill_date: today(),
  fill_time: currentTime(),
  operation_type: 'ทำน้ำมันบรรทุก',
  item_type: 'ดีเซล',
  plate_no: '',
  vehicle_no: '',
  driver_name: '',
  filler_name: '',
  recorder_name: '',
  odometer_before: '',
  odometer_after: '',
  distance_km: '',
  quantity_liters: '',
  price_baht_per_liter: '',
  amount_baht: '',
  origin_place: '',
  destination_place: '',
  load_date: '',
  unload_date: '',
  cargo_stone_weight: '',
  cargo_sand_weight: '',
  wage_payer: '',
  payment_status: 'pending',
  note: '',
};

const emptyBillFields = {
  bill_no: '',
  oil_bill_no: '',
  work_bill_no: '',
  document_no: '',
  stone_bill_no: '',
  sand_bill_no: '',
  diesel_bill_no: '',
  engine_oil_bill_no: '',
  adblue_bill_no: '',
};

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `device_${crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return 'device_local';
  }
}

function getDeviceRecorderName(user) {
  try {
    const saved = localStorage.getItem(DEVICE_RECORDER_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {}
  return user?.name || user?.username || '';
}

function saveDeviceRecorderName(value) {
  try {
    const clean = String(value || '').trim();
    if (clean) localStorage.setItem(DEVICE_RECORDER_KEY, clean);
  } catch (_) {}
}

function hasDraftData(data = {}) {
  return Boolean(
    data.plate_no ||
    data.driver_name ||
    data.quantity_liters ||
    data.amount_baht ||
    data.distance_km ||
    data.odometer_before ||
    data.odometer_after ||
    data.origin_place ||
    data.destination_place ||
    data.note,
  );
}

function formatSavedTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return '';
  }
}

function formatFileSize(bytes = 0) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function isLikelyImageFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name);
}

function isLikelyPdfFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.includes('pdf') || /\.pdf$/i.test(name);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านไฟล์รูปภาพนี้ไม่ได้ กรุณาเลือกเป็น JPG/PNG หรือถ่ายรูปใหม่'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressImageFile(file) {
  if (!file || !isLikelyImageFile(file)) return file;
  if (file.type === 'image/gif') return file;

  let image;
  try {
    image = await loadImageElement(file);
  } catch (error) {
    // ถ้าเป็น HEIC/ไฟล์แปลกที่ browser อ่านไม่ได้ ให้ส่งไฟล์เดิมไปก่อน
    // Backend เพิ่ม limit ไว้สูงขึ้นแล้ว แต่ถ้า platform รับไม่ได้จะแจ้ง error ที่เข้าใจง่าย
    return file;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return file;

  const scale = Math.min(1, IMAGE_UPLOAD_MAX_WIDTH / width, IMAGE_UPLOAD_MAX_HEIGHT / height);
  if (scale >= 1 && file.size <= IMAGE_COMPRESS_MIN_BYTES) return file;

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_UPLOAD_QUALITY);
  if (!blob) return file;
  if (blob.size >= file.size && file.size <= 20 * 1024 * 1024) return file;

  const baseName = String(file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function prepareUploadFile(file) {
  if (!file) return file;
  if (isLikelyImageFile(file)) return compressImageFile(file);
  return file;
}


function decimalNumber(value, defaultValue = 0) {
  return parseDecimal(value, defaultValue);
}

function roundMoneyLike(value, digits = 2) {
  return roundDecimal(value, digits);
}

export default function DeliveryForm({ initialData = null, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(blank);
  const [files, setFiles] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState(null);
  const [draftInfo, setDraftInfo] = useState({ restored: false, savedAt: '', deviceId: '' });
  const formReadyRef = useRef(false);

  const draftKey = useMemo(() => {
    const deviceId = getDeviceId();
    const userKey = user?.id || user?.username || 'shared-user';
    return `${DRAFT_VERSION}:${deviceId}:${userKey}`;
  }, [user?.id, user?.username]);

  const effectiveLiters = useMemo(() => {
    // v37: จำนวนลิตรให้พนักงานกรอกเองตามจริง รองรับทศนิยม และไม่คำนวณจากหัวจ่ายก่อน/หลังแล้ว
    return Math.max(0, roundMoneyLike(decimalNumber(form.quantity_liters, 0), 2));
  }, [form.quantity_liters]);

  const effectiveDistance = useMemo(() => {
    // อัตราสิ้นเปลือง = ระยะทางกิโลเมตรที่กรอก ÷ จำนวนลิตรที่กรอก
    return Math.max(0, roundMoneyLike(decimalNumber(form.distance_km, 0), 2));
  }, [form.distance_km]);

  const billTotal = useMemo(() => {
    const price = decimalNumber(form.price_baht_per_liter, 0);
    return effectiveLiters > 0 && price > 0 ? roundMoneyLike(effectiveLiters * price, 2) : 0;
  }, [effectiveLiters, form.price_baht_per_liter]);

  const avgPrice = useMemo(() => {
    const amount = decimalNumber(form.amount_baht, 0);
    return effectiveLiters > 0 && amount > 0 ? roundMoneyLike(amount / effectiveLiters, 2) : 0;
  }, [effectiveLiters, form.amount_baht]);

  const fuelEfficiency = useMemo(() => {
    return effectiveDistance > 0 && effectiveLiters > 0 ? roundMoneyLike(effectiveDistance / effectiveLiters, 2) : 0;
  }, [effectiveDistance, effectiveLiters]);

  useEffect(() => {
    formReadyRef.current = false;
    const fallbackPrice = initialData?.price_baht_per_liter || initialData?.price_per_liter || '';
    const base = initialData
      ? {
          ...blank,
          ...initialData,
          ...emptyBillFields,
          plate_no: initialData.plate_no || '',
          vehicle_no: initialData.vehicle_no || '',
          driver_name: initialData.driver_name || initialData.driver_name_input || '',
          price_baht_per_liter: fallbackPrice,
          odometer_before: initialData.station_meter_before || initialData.odometer_before || '',
          odometer_after: initialData.station_meter_after || initialData.odometer_after || '',
          distance_km: initialData.distance_km || '',
        }
      : { ...blank, recorder_name: getDeviceRecorderName(user) };

    if (!initialData?.id) {
      try {
        const raw = localStorage.getItem(draftKey);
        const draft = raw ? JSON.parse(raw) : null;
        if (draft?.form && hasDraftData(draft.form)) {
          setForm({ ...base, ...draft.form, recorder_name: draft.form.recorder_name || base.recorder_name });
          setDraftInfo({ restored: true, savedAt: draft.savedAt || '', deviceId: getDeviceId().slice(-8) });
          setFiles({});
          setTimeout(() => toastSuccess('กู้ข้อมูลร่างของเครื่องนี้ให้แล้ว'), 250);
          formReadyRef.current = true;
          return;
        }
      } catch (_) {
        // ถ้าข้อมูลร่างเสีย ให้เริ่มฟอร์มใหม่โดยไม่ทำให้ระบบพัง
      }
    }

    setForm(base);
    setFiles({});
    setDraftInfo({ restored: false, savedAt: '', deviceId: getDeviceId().slice(-8) });
    setTimeout(() => { formReadyRef.current = true; }, 0);
  }, [initialData, draftKey, user?.name, user?.username]);

  useEffect(() => {
    api.vehicleOptions?.().then((res) => setVehicles(res.data || [])).catch(() => setVehicles([]));
  }, []);

  useEffect(() => {
    if (initialData?.id || !formReadyRef.current) return;
    if (!hasDraftData(form)) return;
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify({ form, savedAt }));
        setDraftInfo((old) => ({ ...old, savedAt, deviceId: getDeviceId().slice(-8) }));
      } catch (_) {
        // localStorage เต็มหรือปิดไว้ ไม่ต้องหยุดการใช้งานหลัก
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form, draftKey, initialData?.id]);

  useEffect(() => {
    const hasData = hasDraftData(form);
    function beforeUnload(event) {
      if (!hasData || initialData?.id) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [form, initialData?.id]);

  function setField(key, value) {
    if (key === 'recorder_name') saveDeviceRecorderName(value);
    setForm((old) => ({ ...old, [key]: value }));
  }

  function pickVehicle(plate) {
    const found = vehicles.find((v) => v.plate_no === plate);
    setForm((old) => ({
      ...old,
      plate_no: plate,
      vehicle_id: found?.id || old.vehicle_id || '',
      vehicle_no: found?.vehicle_no || old.vehicle_no || '',
      driver_name: found?.driver_name || old.driver_name || '',
    }));
  }


  async function clearDraft() {
    const ok = await confirmAction('ล้างข้อมูลร่างของเครื่องนี้?', 'ล้างเฉพาะข้อมูลที่ยังไม่กดบันทึกบนเครื่องนี้เท่านั้น รายการที่บันทึกแล้วจะไม่หาย');
    if (!ok) return;
    try { localStorage.removeItem(draftKey); } catch (_) {}
    setForm({ ...blank, work_date: today(), fill_date: today(), fill_time: currentTime(), recorder_name: getDeviceRecorderName(user) });
    setFiles({});
    setDraftInfo((old) => ({ ...old, restored: false, savedAt: '' }));
    toastSuccess('ล้างข้อมูลร่างแล้ว');
  }

  async function buildFormData() {
    const fd = new FormData();
    Object.entries({ ...form, ...emptyBillFields }).forEach(([key, value]) => fd.append(key, value ?? ''));
    fd.set('distance_km', effectiveDistance ? String(effectiveDistance) : '');
    fd.set('nozzle_liters', '');
    fd.set('station_meter_delta_liters', '');
    fd.set('station_liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('quantity_liters', effectiveLiters ? String(effectiveLiters) : '');
    fd.set('price_baht_per_liter', form.price_baht_per_liter || '');
    fd.set('amount_baht', billTotal ? String(billTotal) : '');

    for (const [key, selected] of Object.entries(files)) {
      const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
      for (const file of list) {
        const uploadFile = await prepareUploadFile(file);
        fd.append(key, uploadFile);
      }
    }
    return fd;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.work_date) return alertError('กรุณาเลือกวันที่ลงรายการ');
    if (!form.plate_no) return alertError('กรุณากรอกทะเบียนรถ');
    if (!effectiveLiters || effectiveLiters <= 0) return alertError('กรุณากรอกจำนวนลิตรตามจริง');
    if (!decimalNumber(form.price_baht_per_liter, 0)) return alertError('กรุณากรอกราคาน้ำมันลิตรละ');
    if (!effectiveDistance || effectiveDistance <= 0) return alertError('กรุณากรอกระยะทางกิโลเมตร เพื่อคำนวณอัตราสิ้นเปลือง');

    if (effectiveLiters >= 280) {
      const ok = await confirmAction('ปริมาณลิตรสูงกว่าปกติ', `รายการนี้ ${number(effectiveLiters, 2)} ลิตร ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }
    if (fuelEfficiency > 0 && (fuelEfficiency < 0.5 || fuelEfficiency > 8)) {
      const ok = await confirmAction('ตรวจสอบอัตราสิ้นเปลือง กม./ลิตร', `ระบบคำนวณได้ ${number(fuelEfficiency, 2)} กม./ลิตร จาก ${number(effectiveDistance, 2)} กม. ÷ ${number(effectiveLiters, 2)} ลิตร ต้องการบันทึกต่อใช่ไหม`);
      if (!ok) return;
    }

    const selectedFileCount = Object.values(files || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    setLoading(true);
    try {
      if (selectedFileCount > 0) toastInfo('กำลังปรับขนาดรูปภาพก่อนอัปโหลด...');
      saveDeviceRecorderName(form.recorder_name);
      const fd = await buildFormData();
      const savedRes = initialData?.id ? await api.updateDelivery(initialData.id, fd) : await api.createDelivery(fd);
      const savedDelivery = savedRes?.data || null;
      try { localStorage.removeItem(draftKey); } catch (_) {}
      toastSuccess(initialData?.id ? 'แก้ไขรายการสำเร็จ' : 'บันทึกรายการสำเร็จ');
      if (!initialData?.id) setForm({ ...blank, work_date: today(), fill_date: today(), fill_time: currentTime(), recorder_name: getDeviceRecorderName(user) });
      setFiles({});
      setDraftInfo((old) => ({ ...old, restored: false, savedAt: '' }));
      onSaved?.(savedDelivery);
      if (savedDelivery) {
        setSavedReceipt(savedDelivery);
        if (!initialData?.id) {
          toastInfo('เปิดใบสรุปให้แล้ว หากต้องการเก็บรูปให้กดปุ่มบันทึกรูป PNG');
        }
      }
    } catch (err) {
      alertError(err, 'บันทึกรายการไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <form onSubmit={onSubmit} className="mobile-form-card app-form-card overflow-hidden">
      <div className="app-form-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="capture-header-logo"><img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" /></div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-black text-white shadow-lg shadow-blue-600/20">
                <Smartphone size={13} /> Mobile-first
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {initialData?.id ? 'แก้ไขรายการน้ำมัน' : 'บันทึกงานน้ำมัน'}
              </h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">จัดช่องเป็นกลุ่ม กรอกง่าย และสร้างใบสรุปหลังบันทึก</p>
            </div>
          </div>
          <div className="form-summary-grid lg:w-[520px]">
            <Metric label="ระยะทาง" value={effectiveDistance ? `${number(effectiveDistance, 2)} กม.` : '-'} />
            <Metric label="จำนวนลิตร" value={effectiveLiters ? `${number(effectiveLiters, 2)} ลิตร` : '-'} />
            <Metric label="ราคาลิตรละ" value={decimalNumber(form.price_baht_per_liter, 0) ? `${number(form.price_baht_per_liter, 2)} บาท` : '-'} />
            <Metric label="กม./ลิตร" value={fuelEfficiency ? number(fuelEfficiency, 2) : '-'} strong />
          </div>
        </div>
      </div>

      <div className="app-form-body space-y-4 p-3 md:p-6">
        <DraftNotice draftInfo={draftInfo} files={files} onClear={clearDraft} editing={Boolean(initialData?.id)} />

        <Section no="1" icon={ClipboardList} title="รถ / คนขับ" subtitle="เลือกหรือกรอกข้อมูลหลักของงาน">
          <Field required label="ทะเบียนรถ" hint="เช่น 70-0024" value={form.plate_no} onChange={pickVehicle} placeholder="ทะเบียนรถ" listId="vehicle-list" />
          <datalist id="vehicle-list">{vehicles.map((v) => <option key={v.id} value={v.plate_no}>{v.driver_name || v.vehicle_no || ''}</option>)}</datalist>
          <Field label="ขขร / คนขับ" hint="ใช้ในใบสรุป" value={form.driver_name} onChange={(v) => setField('driver_name', v)} placeholder="ชื่อคนขับ" />
          <Field label="เบอร์รถ" hint="ไม่บังคับ" value={form.vehicle_no} onChange={(v) => setField('vehicle_no', v)} placeholder="เช่น 12" />
          <Select label="ประเภทน้ำมัน" hint="เลือกประเภท" value={form.item_type} onChange={(v) => setField('item_type', v)} options={ITEM_TYPES} />
          <Select label="ประเภทงาน" hint="เลือกประเภทงาน" value={form.operation_type} onChange={(v) => setField('operation_type', v)} options={['ทำน้ำมันบรรทุก', 'เช็คเติมสต๊อก']} />
          <Field label="ชื่อผู้เติม" hint="ไม่บังคับ" value={form.filler_name} onChange={(v) => setField('filler_name', v)} placeholder="ชื่อผู้เติม" />
          <Field label="ชื่อผู้กรอก / เครื่องนี้" hint="จำแยกตามเครื่อง" value={form.recorder_name} onChange={(v) => setField('recorder_name', v)} placeholder="ชื่อคนถือเครื่อง" />
        </Section>

        <Section no="2" icon={Droplets} title="น้ำมัน / ราคา" subtitle="จำนวนลิตร ราคา และระยะทางสำหรับคำนวณ">
          <Field required type="number" step="0.01" label="จำนวนลิตร" hint="กรอกตามบิล ใส่ทศนิยมได้" value={form.quantity_liters} onChange={(v) => setField('quantity_liters', v)} suffix="ลิตร" />
          <Field required type="number" label="ราคาน้ำมันลิตรละ" hint="บาทต่อลิตร" value={form.price_baht_per_liter} onChange={(v) => setField('price_baht_per_liter', v)} suffix="บาท" />
          <ReadOnlyField label="จำนวนบาท" hint="จำนวนลิตร × ราคาน้ำมันลิตรละ" value={billTotal ? money(billTotal) : 'รอกรอกลิตรและราคา'} />
          <Field required type="number" label="ระยะทางกิโลเมตร" hint="ระยะทางที่วิ่งจริง" value={form.distance_km} onChange={(v) => setField('distance_km', v)} suffix="กม." />
          <Field type="number" step="1" label="หัวจ่ายก่อนเติม" hint="เลขอ้างอิง" value={form.odometer_before} onChange={(v) => setField('odometer_before', v)} />
          <Field type="number" step="1" label="หัวจ่ายหลังเติม" hint="เลขอ้างอิง" value={form.odometer_after} onChange={(v) => setField('odometer_after', v)} />
          <CalcCard billTotal={billTotal} pricePerLiter={form.price_baht_per_liter} fuelEfficiency={fuelEfficiency} effectiveLiters={effectiveLiters} effectiveDistance={effectiveDistance} />
        </Section>

        <Section no="3" icon={Clock3} title="วันที่ / งาน" subtitle="เลือกวันและเวลาให้อ่านง่าย ไม่ต้องพิมพ์เอง">
          <SmartDateField required label="ลงวันที่" hint="วันที่รายการ" value={form.work_date} onChange={(v) => { setField('work_date', v); if (!form.fill_date) setField('fill_date', v); }} />
          <SmartDateField label="วันที่เติม" hint="ตามบิล/วันที่เติมจริง" value={form.fill_date} onChange={(v) => setField('fill_date', v)} />
          <SmartTimeField label="เวลาเติม" hint="ตามบิล/หน้างาน" value={form.fill_time} onChange={(v) => setField('fill_time', v)} />
          <Field label="ต้นทาง" hint="รับของ" value={form.origin_place} onChange={(v) => setField('origin_place', v)} />
          <Field label="ปลายทาง" hint="ส่งของ" value={form.destination_place} onChange={(v) => setField('destination_place', v)} />
          <SmartDateField label="วันที่บรรทุก" hint="ไม่บังคับ" value={form.load_date} onChange={(v) => setField('load_date', v)} optional />
          <SmartDateField label="วันที่ลงของ" hint="ไม่บังคับ" value={form.unload_date} onChange={(v) => setField('unload_date', v)} optional />
          <Field type="number" label="น้ำหนักหิน" hint="ตัน" value={form.cargo_stone_weight} onChange={(v) => setField('cargo_stone_weight', v)} suffix="ตัน" />
          <Field type="number" label="น้ำหนักทราย" hint="ตัน" value={form.cargo_sand_weight} onChange={(v) => setField('cargo_sand_weight', v)} suffix="ตัน" />
        </Section>

        <Section no="4" icon={Camera} title="รูปภาพแนบ" subtitle="แตะเพิ่มรูปตามหมวด">
          <FileField label="รูปบิล" name="bill_photo" files={files} setFiles={setFiles} existing={initialData?.bill_photos || initialData?.bill_photo || initialData?.receipt_photo} />
          <FileField label="รูปเอกสาร" name="document_photo" files={files} setFiles={setFiles} existing={initialData?.document_photos || initialData?.document_photo} />
          <FileField label="รูปน้ำมัน/แอดบลู" name="oil_photo" files={files} setFiles={setFiles} existing={[...toExistingArray(initialData?.oil_photos || initialData?.oil_photo), ...toExistingArray(initialData?.adblue_photos || initialData?.adblue_photo)]} />
          <FileField label="รูปบรรทุก" name="cargo_photo" files={files} setFiles={setFiles} existing={initialData?.cargo_photos || initialData?.cargo_photo} />
        </Section>

        <details className="group section-card overflow-hidden">
          <summary className="section-head cursor-pointer select-none">
            <div className="section-icon"><CheckCircle2 size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wider text-blue-600">ข้อมูลเสริม</p>
              <h3 className="text-base font-black text-slate-950 md:text-lg">ค่าแรง สถานะ และหมายเหตุ</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-400">ซ่อนไว้ก่อนเพื่อลดความรก ใช้เมื่อมีรายละเอียดเพิ่มเติมเท่านั้น</p>
            </div>
            <ChevronDown size={20} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="field-grid smart-form-grid border-t border-slate-100 p-4 md:p-5">
            <Field label="ผู้จ่ายค่าแรง" hint="ถ้ามีข้อมูลในกระดาษ" value={form.wage_payer} onChange={(v) => setField('wage_payer', v)} />
            <Select label="สถานะค่าแรง" hint="ใช้ให้เจ้าของกิจการเห็นสถานะ" value={form.payment_status} onChange={(v) => setField('payment_status', v)} options={[["pending", 'รอจ่าย / ไม่ระบุ'], ["paid", 'จ่ายแล้ว']]} />
            <label className="block md:col-span-2">
              <span className="label">หมายเหตุ</span>
              <textarea className="input mt-1 min-h-[96px]" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="รายละเอียดเพิ่มเติม เช่น เหตุผลที่ยอดลิตรสูงผิดปกติ" />
              <p className="hint mt-1">ไม่จำเป็นต้องกรอก ถ้าไม่มีรายละเอียดเพิ่ม</p>
            </label>
          </div>
        </details>

        <div className="sticky bottom-20 z-20 rounded-3xl bg-white/95 p-2 shadow-2xl shadow-slate-900/10 backdrop-blur md:static md:bg-transparent md:p-0 md:shadow-none">
          <button disabled={loading} className="btn-primary w-full text-base md:w-auto"><Save size={18} /> {loading ? 'กำลังบันทึก...' : initialData?.id ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</button>
        </div>
      </div>
    </form>
    <CaptureReceiptModal row={savedReceipt} onClose={() => setSavedReceipt(null)} />
    </>
  );
}

function Guide() {
  return (
    <div className="rounded-[1.35rem] border border-blue-100 bg-blue-50/65 p-3 text-xs font-bold leading-5 text-blue-900 md:text-sm">
      <div className="flex gap-2"><HelpCircle size={16} className="mt-0.5 shrink-0" /><div><b>ลำดับกรอก:</b> รถ/คนขับ → จำนวนลิตร → ราคา → ระยะทาง → รูปภาพ → บันทึก</div></div>
    </div>
  );
}

function DraftNotice({ draftInfo, files, onClear, editing }) {
  if (editing) return null;
  const fileCount = Object.values(files || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  if (!draftInfo.savedAt && fileCount <= 0) return null;
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs font-bold leading-5 text-blue-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={16} className="shrink-0 text-blue-700" />
          <p className="min-w-0 truncate">บันทึกร่างอัตโนมัติ{draftInfo.savedAt ? ` · ${formatSavedTime(draftInfo.savedAt)}` : ''}{fileCount > 0 ? ` · รูปที่เลือก ${fileCount} ไฟล์` : ''}</p>
        </div>
        {draftInfo.savedAt && <button type="button" onClick={onClear} className="shrink-0 rounded-xl bg-white px-3 py-2 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">ล้าง</button>}
      </div>
    </div>
  );
}

function StepPill({ no, text }) {
  return <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-100"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">{no}</span>{text}</div>;
}

function Section({ no, title, subtitle, icon: Icon, children }) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div className="section-icon">{Icon ? <Icon size={18} /> : no}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-blue-600">หัวข้อที่ {no}</p>
          <h3 className="text-base font-black text-slate-950 md:text-lg">{title}</h3>
          {subtitle && <p className="mt-1 text-xs font-bold leading-5 text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="field-grid smart-form-grid border-t border-slate-100 p-3 md:p-5">{children}</div>
    </section>
  );
}


function dateOffset(days = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function SmartDateField({ label, value, onChange, required = false, hint = '', optional = false }) {
  const pretty = value ? formatThaiDate(value) : optional ? 'ยังไม่เลือก' : 'เลือกวันที่';
  const chips = [
    { label: 'วันนี้', value: dateOffset(0) },
    { label: 'เมื่อวาน', value: dateOffset(-1) },
  ];
  return (
    <label className="form-field smart-date-field">
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="smart-date-box">
        <div className="smart-date-topline">
          <span className="smart-date-icon"><CalendarDays size={16} /></span>
          <span className="smart-date-pretty">{pretty}</span>
        </div>
        <input
          required={required}
          type="date"
          className="smart-date-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="smart-date-actions">
          {chips.map((chip) => (
            <button key={chip.label} type="button" className={`smart-date-chip ${value === chip.value ? 'is-active' : ''}`} onClick={() => onChange(chip.value)}>
              {chip.label}
            </button>
          ))}
          {optional && value && (
            <button type="button" className="smart-date-chip is-clear" onClick={() => onChange('')}>ล้าง</button>
          )}
        </div>
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function SmartTimeField({ label, value, onChange, required = false, hint = '' }) {
  return (
    <label className="form-field smart-date-field">
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="smart-date-box smart-time-box">
        <div className="smart-date-topline">
          <span className="smart-date-icon"><Clock3 size={16} /></span>
          <span className="smart-date-pretty">{value || 'เลือกเวลา'}</span>
        </div>
        <input
          required={required}
          type="time"
          className="smart-date-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="smart-date-actions">
          <button type="button" className="smart-date-chip" onClick={() => onChange(currentTime())}>เวลาตอนนี้</button>
          {value && <button type="button" className="smart-date-chip is-clear" onClick={() => onChange('')}>ล้าง</button>}
        </div>
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', suffix = '', required = false, hint = '', listId = '', step = '' }) {
  const isNumber = type === 'number';
  return (
    <label className="form-field">
      <span className="form-field-label label">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="form-field-input-wrap relative">
        <input
          required={required}
          type={isNumber ? 'text' : type}
          inputMode={isNumber ? 'decimal' : undefined}
          pattern={isNumber ? '[0-9๐-๙.,:\-]*' : undefined}
          step={isNumber ? (step || '0.01') : undefined}
          autoComplete="off"
          className={`input ${suffix ? 'pr-20' : ''}`}
          value={value || ''}
          placeholder={placeholder}
          list={listId || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="field-suffix pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">{suffix}</span>}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function ReadOnlyField({ label, value, hint = '' }) {
  return (
    <div className="form-field">
      <span className="form-field-label label">{label}</span>
      <div className="readonly-value">
        {value || '-'}
      </div>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, hint = '' }) {
  const normalized = options.map((item) => Array.isArray(item) ? { value: item[0], label: item[1] } : { value: item, label: item });
  return (
    <label className="form-field">
      <span className="form-field-label label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {normalized.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {hint && <p className="form-field-hint hint">{hint}</p>}
    </label>
  );
}

function CalcCard({ billTotal, pricePerLiter, fuelEfficiency, effectiveLiters, effectiveDistance }) {
  return (
    <div className="col-span-2 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4 text-sm font-bold text-blue-950 md:col-span-2 xl:col-span-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm"><Gauge size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-black">สรุปคำนวณอัตโนมัติ</p>
          <p className="mt-1 text-xs leading-5 text-blue-800/70">คำนวณจากจำนวนลิตรที่กรอก ราคาลิตรละ และระยะทาง</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MiniCalc label="จำนวนลิตรที่กรอก" value={effectiveLiters ? `${number(effectiveLiters, 2)} ลิตร` : '-'} />
            <MiniCalc label="ราคาน้ำมันลิตรละ" value={Number(pricePerLiter || 0) ? `${number(pricePerLiter, 2)} บาท` : '-'} strong highlight />
            <MiniCalc label="จำนวนบาท" value={billTotal ? money(billTotal) : '-'} />
            <MiniCalc label="กม./ลิตร" value={fuelEfficiency ? number(fuelEfficiency, 2) : '-'} strong />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, strong = false }) {
  return <div className="rounded-2xl bg-white/85 p-3 shadow-sm ring-1 ring-white/70"><p className="text-[11px] font-black text-slate-400">{label}</p><p className={`${strong ? 'text-blue-700' : 'text-slate-950'} mt-1 truncate text-sm font-black md:text-base`}>{value}</p></div>;
}

function MiniCalc({ label, value, strong = false, highlight = false }) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? 'border border-emerald-100 bg-emerald-50' : 'bg-white/85'}`}>
      <p className={`text-[11px] font-black ${highlight ? 'text-emerald-700' : 'text-blue-500/80'}`}>{label}</p>
      <p className={`mt-1 ${strong ? 'text-lg' : 'text-sm'} font-black ${highlight ? 'text-emerald-950' : 'text-blue-950'}`}>{value}</p>
    </div>
  );
}

function toExistingArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function FileField({ label, hint = '', name, files, setFiles, existing }) {
  const [pickerKey, setPickerKey] = useState(0);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const selected = files[name] || [];
  const existingList = toExistingArray(existing);

  function mergePickedFiles(pickedFiles = []) {
    const picked = Array.from(pickedFiles || []).filter(Boolean);
    if (!picked.length) return;
    setFiles((old) => {
      const current = Array.isArray(old[name]) ? old[name] : [];
      const merged = [...current];
      picked.forEach((file) => {
        const key = `${file.name}_${file.size}_${file.lastModified}`;
        const exists = merged.some((item) => `${item.name}_${item.size}_${item.lastModified}` === key);
        if (!exists) merged.push(file);
      });
      return { ...old, [name]: merged };
    });
  }

  function onSelect(e) {
    const picked = Array.from(e.target.files || []);
    mergePickedFiles(picked);
    // reset หลังอ่านค่าแล้วเท่านั้น เพื่อให้ Samsung/Android บางรุ่นไม่ทำไฟล์หายตอนกลับจากคลังรูป
    window.setTimeout(() => {
      if (e.target) e.target.value = '';
      setPickerKey((key) => key + 1);
    }, 80);
  }

  function openPicker(ref) {
    try {
      ref.current?.click?.();
    } catch (_) {
      toastInfo('แตะปุ่มอีกครั้งเพื่อเลือกรูป');
    }
  }

  function clearSelected() {
    setFiles((old) => ({ ...old, [name]: [] }));
    if (galleryRef.current) galleryRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
    setPickerKey((key) => key + 1);
  }

  function removeSelected(index) {
    setFiles((old) => {
      const current = Array.isArray(old[name]) ? old[name] : [];
      return { ...old, [name]: current.filter((_, i) => i !== index) };
    });
    if (galleryRef.current) galleryRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
    setPickerKey((key) => key + 1);
  }

  return (
    <div className="file-picker-card">
      <input
        key={`${name}_gallery_${pickerKey}`}
        ref={galleryRef}
        className="sr-only"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,.pdf"
        multiple
        onChange={onSelect}
      />
      <input
        key={`${name}_camera_${pickerKey}`}
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
        capture="environment"
        onChange={onSelect}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="label text-[12px] md:text-[13px]">{label}</span>
          {hint && <p className="hint mt-1">{hint}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${selected.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {selected.length > 0 ? `${selected.length} ไฟล์` : 'ว่าง'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openPicker(galleryRef)} className="min-h-[72px] rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/45 p-3 text-center shadow-sm transition active:scale-[.98]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Camera size={18} /></div>
          <p className="mt-2 text-xs font-black text-slate-900">เลือกรูป</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">จากคลัง</p>
        </button>
        <button type="button" onClick={() => openPicker(cameraRef)} className="min-h-[72px] rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/45 p-3 text-center shadow-sm transition active:scale-[.98]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><Camera size={18} /></div>
          <p className="mt-2 text-xs font-black text-slate-900">ถ่ายรูป</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">กล้องมือถือ</p>
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={clearSelected} className="btn-soft col-span-2 w-full text-xs">
            <RotateCcw size={14} /> เลือกใหม่
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {selected.length > 0 && (
          <div className="rounded-[1.35rem] border border-emerald-100 bg-emerald-50/80 p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-xs font-black text-emerald-900">
                <CheckCircle2 size={16} className="shrink-0" /> เลือกแล้ว {selected.length} ไฟล์ รอกดบันทึก
              </p>
              <button type="button" onClick={clearSelected} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">
                ล้างทั้งหมด
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {selected.map((file, index) => (
                <SelectedFilePreview
                  key={`${file.name}_${file.size}_${file.lastModified}_${index}`}
                  file={file}
                  index={index}
                  onRemove={() => removeSelected(index)}
                />
              ))}
            </div>
          </div>
        )}
        {existingList.length > 0 && (
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="mb-2 text-[11px] font-black text-slate-400">ไฟล์เดิม {existingList.length} ไฟล์</p>
            <div className="flex flex-wrap gap-2">
              {existingList.slice(0, 10).map((path, index) => (
                <a key={`${path}-${index}`} href={uploadUrl(path)} target="_blank" rel="noreferrer" className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                  <img src={uploadUrl(path)} alt={`${label} ${index + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isImageFile(file) {
  return isLikelyImageFile(file);
}

function isPdfFile(file) {
  return isLikelyPdfFile(file);
}

function SelectedFilePreview({ file, index, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const title = String(file?.name || `ไฟล์ที่ ${index + 1}`);
  const typeText = isImageFile(file) ? 'รูปภาพ' : isPdfFile(file) ? 'PDF' : 'ไฟล์';

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition group-hover:bg-red-600"
        aria-label={`ลบ ${title}`}
      >
        <X size={14} />
      </button>
      <div className="aspect-square w-full overflow-hidden bg-slate-100">
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-blue-50 text-blue-700">
            {isPdfFile(file) ? <FileText size={26} /> : <Camera size={26} />}
            <span className="text-[10px] font-black uppercase tracking-wide">{typeText}</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 min-h-[2rem] break-all text-[11px] font-black leading-4 text-slate-800">{title}</p>
        <p className="mt-1 text-[10px] font-bold text-slate-400">{formatFileSize(file?.size || 0)}</p>
      </div>
    </div>
  );
}
