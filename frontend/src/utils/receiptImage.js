import { date, money, number, parseDecimal, roundDecimal } from './format.js';

function safeText(value, fallback = '-') {
  const text = value === undefined || value === null || value === '' ? fallback : String(value);
  return text;
}

function litersValue(row = {}) {
  return roundDecimal(row.quantity_liters || row.station_liters || row.liters || 0, 2);
}

function priceValue(row = {}) {
  return parseDecimal(row.price_baht_per_liter || row.price_per_liter, 0);
}

function amountValue(row = {}) {
  const liters = litersValue(row);
  const price = priceValue(row);
  if (liters > 0 && price > 0) return roundDecimal(liters * price, 2);
  return parseDecimal(row.amount_baht, 0);
}

function fuelRateValue(row = {}) {
  const saved = parseDecimal(row.fuel_efficiency_km_per_liter, 0);
  if (saved > 0) return saved;
  const distance = parseDecimal(row.distance_km, 0);
  const liters = litersValue(row);
  return distance > 0 && liters > 0 ? roundDecimal(distance / liters, 2) : 0;
}

function fillDateText(row = {}) {
  return `${date(row.fill_date || row.work_date)}${row.fill_time ? ` เวลา ${row.fill_time}` : ''}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawText(ctx, text, x, y, maxWidth, opts = {}) {
  const { size = 34, weight = 800, color = '#0f172a', align = 'left', lineHeight = 1.25 } = opts;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const raw = String(text || '-');
  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) current = test;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const maxLines = opts.maxLines || 3;
  const lh = size * lineHeight;
  lines.slice(0, maxLines).forEach((line, i) => ctx.fillText(line, x, y + i * lh, maxWidth));
  return y + Math.min(lines.length, maxLines) * lh;
}

function drawPill(ctx, x, y, text, bg, color, w = 156) {
  ctx.fillStyle = bg;
  roundedRect(ctx, x, y, w, 54, 27);
  ctx.fill();
  drawText(ctx, text, x + 22, y + 14, w - 44, { size: 23, weight: 900, color, maxLines: 1 });
}

function drawSummaryCard(ctx, x, y, w, h, label, value, tone = 'slate') {
  const tones = {
    slate: ['#f8fafc', '#e2e8f0', '#0f172a', '#94a3b8'],
    blue: ['#eff6ff', '#bfdbfe', '#172554', '#94a3b8'],
    green: ['#ecfdf5', '#bbf7d0', '#064e3b', '#94a3b8'],
  };
  const [bg, border, color, labelColor] = tones[tone] || tones.slate;
  ctx.shadowColor = 'rgba(15,23,42,.05)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = bg;
  roundedRect(ctx, x, y, w, h, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, label, x + 26, y + 22, w - 52, { size: 25, weight: 900, color: labelColor, maxLines: 1 });
  drawText(ctx, value, x + 26, y + 64, w - 52, { size: 36, weight: 950, color, maxLines: 2, lineHeight: 1.12 });
}

function drawMiniCard(ctx, x, y, w, h, label, value) {
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = '#eef2ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, label, x + 24, y + 20, w - 48, { size: 24, weight: 900, color: '#94a3b8', maxLines: 1 });
  drawText(ctx, value, x + 24, y + 56, w - 48, { size: 34, weight: 950, color: '#0f172a', maxLines: 1 });
}

export async function createReceiptImageBlob(row = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1760;
  const ctx = canvas.getContext('2d');

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#ecfeff');
  bg.addColorStop(0.44, '#f8fafc');
  bg.addColorStop(1, '#eef6ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // outside app-safe margin
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 42, 42, 996, 1666, 58);
  ctx.fill();
  ctx.strokeStyle = '#ccfbf1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // header
  const head = ctx.createLinearGradient(42, 42, 1038, 440);
  head.addColorStop(0, '#ffffff');
  head.addColorStop(1, '#d1fae5');
  ctx.fillStyle = head;
  roundedRect(ctx, 42, 42, 996, 390, 58);
  ctx.fill();

  try {
    const logo = await loadImage('/logo-swt.png');
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 90, 94, 150, 150, 34);
    ctx.fill();
    ctx.shadowColor = 'rgba(15,23,42,.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(logo, 106, 110, 118, 118);
    ctx.shadowColor = 'transparent';
  } catch (_) {
    ctx.fillStyle = '#0f766e';
    roundedRect(ctx, 90, 94, 150, 150, 34);
    ctx.fill();
    drawText(ctx, 'SWT', 120, 145, 100, { size: 38, weight: 950, color: '#fff', maxLines: 1 });
  }

  drawText(ctx, 'SWT TRANSPORT', 280, 92, 460, { size: 28, weight: 950, color: '#0f766e', maxLines: 1 });
  drawText(ctx, 'ใบสรุปน้ำมัน', 280, 138, 560, { size: 66, weight: 950, color: '#020617', maxLines: 1 });
  drawText(ctx, 'สำหรับส่งเจ้าของกิจการ', 280, 220, 520, { size: 30, weight: 850, color: '#64748b', maxLines: 1 });
  drawPill(ctx, 802, 94, 'บันทึกแล้ว', '#dcfce7', '#047857', 178);

  const plate = safeText(row.plate_no, '-');
  const driver = safeText(row.driver_name || row.driver_name_input, '-');
  drawText(ctx, plate, 90, 335, 520, { size: 78, weight: 950, color: '#020617', maxLines: 1 });
  drawPill(ctx, 418, 352, safeText(row.item_type, '-'), '#eff6ff', '#1d4ed8', 130);
  drawPill(ctx, 580, 352, safeText(row.operation_type, 'ทำน้ำมันบรรทุก'), '#dcfce7', '#047857', 255);
  drawText(ctx, `ขขร / คนขับ: ${driver}`, 90, 444, 880, { size: 33, weight: 900, color: '#334155', maxLines: 1 });

  const liters = litersValue(row);
  const price = priceValue(row);
  const amount = amountValue(row);
  const distance = parseDecimal(row.distance_km, 0);
  const rate = fuelRateValue(row);
  const before = safeText(row.station_meter_before || row.odometer_before, '-');
  const after = safeText(row.station_meter_after || row.odometer_after, '-');
  const recorder = safeText(row.recorder_name || row.employee_name, '-');

  const colW = 444;
  const gap = 26;
  const cardH = 142;
  const x1 = 90;
  const x2 = x1 + colW + gap;
  let y = 540;
  drawSummaryCard(ctx, x1, y, colW, cardH, 'วันที่/เวลาเติม', fillDateText(row));
  drawSummaryCard(ctx, x2, y, colW, cardH, 'จำนวนลิตร', liters ? `${number(liters, 2)} ลิตร` : '-', 'blue');
  y += cardH + gap;
  drawSummaryCard(ctx, x1, y, colW, cardH, 'จำนวนบาท', money(amount), 'blue');
  drawSummaryCard(ctx, x2, y, colW, cardH, 'ราคาน้ำมันลิตรละ', price ? `${number(price, 2)} บาท` : '-', 'green');
  y += cardH + gap;
  drawSummaryCard(ctx, x1, y, colW, cardH, 'ระยะทาง', distance ? `${number(distance, 2)} กม.` : '-');
  drawSummaryCard(ctx, x2, y, colW, cardH, 'อัตราสิ้นเปลือง', rate ? `${number(rate, 2)} กม./ลิตร` : '-', 'green');

  // detail panel
  y += cardH + 40;
  ctx.fillStyle = '#f8fafc';
  roundedRect(ctx, 90, y, 900, 330, 42);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawMiniCard(ctx, 122, y + 36, 404, 112, 'หัวจ่ายก่อน', before);
  drawMiniCard(ctx, 554, y + 36, 404, 112, 'หัวจ่ายหลัง', after);
  drawMiniCard(ctx, 122, y + 178, 404, 112, 'จำนวนลิตรที่กรอก', liters ? `${number(liters, 2)} ลิตร` : '-');
  drawMiniCard(ctx, 554, y + 178, 404, 112, 'ผู้กรอก', recorder);

  // photo summary panel (safe: count only, so canvas download never fails from cross-origin images)
  const photoCount = [
    row.bill_photos, row.bill_photo, row.receipt_photo,
    row.document_photos, row.document_photo,
    row.oil_photos, row.oil_photo,
    row.cargo_photos, row.cargo_photo,
    row.adblue_photos, row.adblue_photo,
  ].flatMap((v) => Array.isArray(v) ? v : v ? [v] : []).length;
  y += 370;
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 90, y, 900, 160, 42);
  ctx.fill();
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();
  drawText(ctx, 'รูปภาพแนบ', 124, y + 28, 400, { size: 34, weight: 950, color: '#0f172a', maxLines: 1 });
  drawText(ctx, `แนบทั้งหมด ${photoCount} ไฟล์`, 124, y + 78, 420, { size: 28, weight: 850, color: '#64748b', maxLines: 1 });
  const boxesX = 606;
  for (let i = 0; i < 4; i += 1) {
    const bx = boxesX + i * 88;
    ctx.fillStyle = i < photoCount ? '#eff6ff' : '#f8fafc';
    roundedRect(ctx, bx, y + 34, 70, 70, 18);
    ctx.fill();
    ctx.strokeStyle = i < photoCount ? '#bfdbfe' : '#e5e7eb';
    ctx.stroke();
    drawText(ctx, i < photoCount ? String(i + 1) : '-', bx + 25, y + 50, 30, { size: 28, weight: 950, color: i < photoCount ? '#1d4ed8' : '#cbd5e1', maxLines: 1 });
  }

  drawText(ctx, 'สร้างจากระบบ SWT Oil Management', 90, 1630, 580, { size: 26, weight: 850, color: '#64748b', maxLines: 1 });
  drawText(ctx, new Date().toLocaleString('th-TH'), 90, 1664, 580, { size: 22, weight: 700, color: '#94a3b8', maxLines: 1 });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('สร้างรูปใบสรุปไม่สำเร็จ'));
    }, 'image/png', 0.95);
  });
}

function receiptFileName(row = {}) {
  return `SWT-${safeText(row.plate_no, 'receipt')}-${Date.now()}.png`.replace(/[\\/:*?"<>|\s]+/g, '-');
}

function isiOSLike() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  a.style.top = '0';
  document.body.appendChild(a);
  a.click();

  // iOS / in-app browser บางตัวไม่เคารพ download attribute จึงเปิดภาพให้ผู้ใช้กดบันทึกได้แทน
  if (isiOSLike()) {
    window.setTimeout(() => {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}
    }, 450);
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 6500);
}

export async function createReceiptImageFile(row = {}) {
  const blob = await createReceiptImageBlob(row);
  const fileName = receiptFileName(row);
  try {
    return new File([blob], fileName, { type: 'image/png', lastModified: Date.now() });
  } catch (_) {
    blob.name = fileName;
    return blob;
  }
}

export async function saveReceiptImageToDevice(row = {}, options = {}) {
  const { preferShare = false, allowFilePicker = false } = options;
  const file = await createReceiptImageFile(row);
  const fileName = file.name || receiptFileName(row);

  if (preferShare && navigator?.canShare?.({ files: [file] }) && navigator?.share) {
    await navigator.share({ title: 'ใบสรุปน้ำมัน SWT', text: 'ใบสรุปน้ำมันสำหรับส่งเจ้าของกิจการ', files: [file] });
    return { file, fileName, method: 'share' };
  }

  if (allowFilePicker && window?.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return { file, fileName, method: 'file-picker' };
  }

  triggerDownload(file, fileName);
  return { file, fileName, method: 'download' };
}

export async function downloadReceiptImage(row = {}) {
  return saveReceiptImageToDevice(row, { preferShare: false, allowFilePicker: false });
}
