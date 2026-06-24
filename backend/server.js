try {
  require('dotenv').config();
} catch (error) {
  console.log('dotenv not loaded, using Render environment variables');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  pingInterval: 10000,
  pingTimeout: 20000,
});

io.on('connection', (socket) => {
  socket.emit('server:hello', { success: true, build: 'swt-clean-branding-v26', at: new Date().toISOString() });
});
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ITEM_TYPES = ['ดีเซล', 'น้ำมันเครื่อง', 'แอดบลู'];
const ITEM_TYPE_MAP = {
  diesel: 'ดีเซล',
  'ดีเซล': 'ดีเซล',
  'น้ำมันดีเซล': 'ดีเซล',
  engine_oil: 'น้ำมันเครื่อง',
  oil_engine: 'น้ำมันเครื่อง',
  motor_oil: 'น้ำมันเครื่อง',
  'น้ำมันเครื่อง': 'น้ำมันเครื่อง',
  adblue: 'แอดบลู',
  'แอดบลู': 'แอดบลู',
  'น้ำแอดบลู': 'แอดบลู',
};

let mongoClient = null;
let mongoDb = null;

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function jsonResponse(res, data, status = 200) {
  return res.status(status).json(data);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function oidOrNull(id) {
  if (id instanceof ObjectId) return id;
  const text = String(id || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  try {
    return new ObjectId(text);
  } catch (_) {
    return null;
  }
}

function parseDateOrNull(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDecimalText(value) {
  if (value === undefined || value === null || value === '') return '';
  let text = String(value)
    .replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))
    .replace(/[−–—]/g, '-')
    .replace(/[٫．]/g, '.')
    .replace(/\s+/g, '')
    .trim();

  // มือถือบางรุ่นผู้ใช้กด : แทนจุดทศนิยม เช่น 100:20 ให้เป็น 100.20
  if (text.includes(':') && !text.includes('.') && !text.includes(',')) {
    const parts = text.split(':');
    if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d{1,6}$/.test(parts[1])) {
      text = `${parts[0]}.${parts[1]}`;
    }
  }

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    const parts = text.split(',');
    if (parts.length === 2) {
      const [whole, frac] = parts;
      // คอมม่าอาจเป็นทศนิยมจากมือถือ เช่น 100,20 หรือเป็นหลักพัน เช่น 8,325 / 10,800
      const isThousands = /^-?\d{1,3}$/.test(whole) && /^\d{3}$/.test(frac);
      const isDecimalComma = /^-?\d+$/.test(whole) && /^\d{1,2}$/.test(frac);
      text = isThousands ? `${whole}${frac}` : isDecimalComma ? `${whole}.${frac}` : text.replace(/,/g, '');
    } else {
      text = text.replace(/,/g, '');
    }
  }

  text = text.replace(/[^0-9.\-]/g, '');
  const minus = text.startsWith('-') ? '-' : '';
  text = minus + text.replace(/-/g, '');
  const firstDot = text.indexOf('.');
  if (firstDot !== -1) text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  return text;
}

function toNumber(value, defaultValue = 0) {
  const text = normalizeDecimalText(value);
  if (!text || text === '-' || text === '.') return defaultValue;
  const n = Number(text);
  return Number.isFinite(n) ? n : defaultValue;
}

function decimalPlaces(value) {
  const text = normalizeDecimalText(value);
  const dot = text.indexOf('.');
  return dot >= 0 ? Math.min(6, text.length - dot - 1) : 0;
}

function toScaledInteger(value, scale) {
  const text = normalizeDecimalText(value);
  if (!text || text === '-' || text === '.') return 0;
  const negative = text.startsWith('-');
  const clean = negative ? text.slice(1) : text;
  const [wholeRaw = '0', fracRaw = ''] = clean.split('.');
  const whole = wholeRaw || '0';
  const frac = (fracRaw + '0'.repeat(scale)).slice(0, scale);
  const result = Number(BigInt(whole || '0') * BigInt(10 ** scale) + BigInt(frac || '0'));
  return negative ? -result : result;
}

function preciseSubtract(afterValue, beforeValue, digits = 2) {
  const scale = Math.max(digits, decimalPlaces(afterValue), decimalPlaces(beforeValue));
  const afterInt = toScaledInteger(afterValue, scale);
  const beforeInt = toScaledInteger(beforeValue, scale);
  return round2((afterInt - beforeInt) / (10 ** scale));
}

function round2(value) {
  const n = toNumber(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function hasDecimalPart(value) {
  const n = Math.abs(toNumber(value, 0));
  return Math.abs(n - Math.trunc(n)) > 0;
}

function pickBestLiterValue(...values) {
  const candidates = values.map((value) => round2(value)).filter((value) => Number.isFinite(value) && value > 0);
  if (!candidates.length) return 0;
  const decimalCandidate = candidates.find((value) => hasDecimalPart(value));
  return decimalCandidate || candidates[0];
}

function expectedAmountFromPrice(quantityLiters, priceBahtPerLiter) {
  const qty = toNumber(quantityLiters, 0);
  const price = toNumber(priceBahtPerLiter, 0);
  return qty > 0 && price > 0 ? round2(qty * price) : 0;
}

function correctAmountIfCommaBug(amountValue, quantityLiters, priceBahtPerLiter) {
  const amount = round2(amountValue);
  const expected = expectedAmountFromPrice(quantityLiters, priceBahtPerLiter);
  if (expected <= 0) return amount;
  // กันข้อมูลเก่าที่เคยถูกอ่านคอมม่าเป็นทศนิยม เช่น 8,325 -> 8.32
  if (!amount || (expected >= 1000 && amount < expected * 0.2)) return expected;
  return amount;
}

function cleanString(value, defaultValue = '') {
  if (value === undefined || value === null) return defaultValue;
  return String(value).trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeRegex(text) {
  return new RegExp(escapeRegExp(text), 'i');
}

function realtimePayload(kind, action, data = {}) {
  return { kind, action, data, at: nowIso() };
}

function emitDataChanged(kind, action, data = {}) {
  const payload = realtimePayload(kind, action, data);
  try {
    io.emit(`${kind}:changed`, payload);
    io.emit('realtime:update', payload);
  } catch (err) {
    console.warn('Realtime emit skipped:', err.message);
  }
}

function normalizeItemType(value) {
  const key = cleanString(value).toLowerCase();
  return ITEM_TYPE_MAP[key] || ITEM_TYPE_MAP[cleanString(value)] || null;
}

function monthFromDate(value) {
  const date = parseDateOrNull(value) || today();
  return date.slice(0, 7);
}

function mongoToPlain(value) {
  if (!value) return value;
  if (value instanceof ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => mongoToPlain(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '_id') out.id = mongoToPlain(item);
      else out[key] = mongoToPlain(item);
    }
    return out;
  }
  return value;
}

function publicUser(user) {
  if (!user) return null;
  const out = mongoToPlain(user);
  delete out.password_hash;
  delete out.password;
  return out;
}

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  String(cookieHeader).split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const xAccessToken = req.headers['x-access-token'];
  if (xAccessToken) return String(xAccessToken).trim();
  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies.token) return cookies.token;
  if (cookies.accessToken) return cookies.accessToken;
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function signUserToken(user) {
  const id = String(user.id || user._id || '');
  return jwt.sign(
    {
      sub: id,
      id,
      user_id: id,
      role: user.role || 'employee',
      username: user.username || '',
    },
    config.jwtSecret,
    { expiresIn: Number(config.jwtExpireSeconds || 60 * 60 * 24 * 7) },
  );
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndex({ username: 1 }, { unique: true }),
    db.collection('deliveries').createIndex({ user_id: 1, work_date: -1 }),
    db.collection('deliveries').createIndex({ vehicle_id: 1 }),
    db.collection('deliveries').createIndex({ item_type: 1, fill_date: -1 }),
    db.collection('vehicles').createIndex({ user_id: 1, plate_no: 1 }),
    db.collection('notifications').createIndex({ delivery_id: 1, created_at: -1 }),
    db.collection('stocks').createIndex({ item_type: 1 }, { unique: true }),
    db.collection('stock_movements').createIndex({ item_type: 1, transaction_date: -1 }),
    db.collection('uploaded_files').createIndex({ created_at: -1 }),
  ]);

  for (const itemType of ITEM_TYPES) {
    await db.collection('stocks').updateOne(
      { item_type: itemType },
      {
        $setOnInsert: {
          item_type: itemType,
          balance_liters: 0,
          created_at: nowIso(),
        },
        $set: { updated_at: nowIso() },
      },
      { upsert: true },
    );
  }
}

async function getDb() {
  if (mongoDb) return mongoDb;
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is not set');
  mongoClient = new MongoClient(config.mongodb.uri, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(config.mongodb.db);
  await ensureIndexes(mongoDb);
  return mongoDb;
}

async function currentUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }
  const possibleId = payload.sub || payload.id || payload.user_id || payload.uid;
  const oid = oidOrNull(possibleId);
  let user = null;
  if (oid) {
    user = await req.db.collection('users').findOne(
      { _id: oid, is_active: { $ne: 0 } },
      { projection: { password_hash: 0, password: 0 } },
    );
  }
  if (!user && payload.username) {
    user = await req.db.collection('users').findOne(
      { username: String(payload.username), is_active: { $ne: 0 } },
      { projection: { password_hash: 0, password: 0 } },
    );
  }
  return publicUser(user);
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) return jsonResponse(res, { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  req.user = user;
  return next();
}

function requireOwner(req, res, next) {
  if ((req.user?.role || '') !== 'owner') return jsonResponse(res, { success: false, message: 'ไม่มีสิทธิ์สำหรับหน้านี้' }, 403);
  return next();
}

async function findUserPublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  const user = await db.collection('users').findOne({ _id: oid }, { projection: { password_hash: 0, password: 0 } });
  return publicUser(user);
}

async function findVehiclePublic(db, id) {
  const oid = oidOrNull(id);
  if (!oid) return null;
  return mongoToPlain(await db.collection('vehicles').findOne({ _id: oid }));
}

async function resolveVehicleId(db, user, data) {
  if (data.vehicle_id) {
    const oid = oidOrNull(data.vehicle_id);
    if (!oid) return null;
    const filter = { _id: oid, is_active: { $ne: 0 } };
    if ((user.role || '') !== 'owner') filter.user_id = String(user.id);
    const vehicle = await db.collection('vehicles').findOne(filter, { projection: { _id: 1 } });
    return vehicle ? String(vehicle._id) : null;
  }

  const plate = cleanString(data.plate_no);
  if (!plate) return null;
  const ownerAssignedUser = (user.role || '') === 'owner' && data.user_id;
  const vehicleUserId = ownerAssignedUser ? String(data.user_id) : String(user.id);
  const vehicleNo = cleanString(data.vehicle_no) || null;
  const driverName = cleanString(data.driver_name) || ((user.role || '') === 'owner' ? null : (user.name || null));

  const existing = await db.collection('vehicles').findOne(
    { plate_no: plate, user_id: vehicleUserId, is_active: 1 },
    { sort: { created_at: -1 }, projection: { _id: 1 } },
  );
  if (existing) return String(existing._id);

  const result = await db.collection('vehicles').insertOne({
    user_id: vehicleUserId,
    plate_no: plate,
    vehicle_no: vehicleNo,
    driver_name: driverName,
    description: 'เพิ่มจากหน้าบันทึกงาน',
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return String(result.insertedId);
}

async function fileUrlFromFile(db, file) {
  if (!file) return null;
  try {
    const fullPath = file.path;
    const buffer = fs.readFileSync(fullPath);
    // เก็บรูป/ไฟล์ไว้ใน MongoDB ด้วย เพื่อไม่ให้รูปหายเมื่อ Render restart หรือ redeploy
    // ถ้าไฟล์ใหญ่มากเกินไป จะ fallback เป็นไฟล์ในเครื่องตามปกติ
    const maxDbBytes = Math.max(Number(config.uploadDbMaxMb || 10), 2) * 1024 * 1024;
    if (buffer.length <= maxDbBytes) {
      const result = await db.collection('uploaded_files').insertOne({
        filename: file.originalname || file.filename,
        stored_filename: file.filename,
        content_type: file.mimetype || 'application/octet-stream',
        size_bytes: buffer.length,
        data: buffer,
        created_at: nowIso(),
      });
      return `/uploads/db/${String(result.insertedId)}`;
    }
  } catch (err) {
    console.warn('DB upload store skipped:', err.message);
  }
  return `/uploads/${file.filename}`;
}

function toPhotoArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function uniqueList(items) {
  return [...new Set((items || []).filter(Boolean))];
}

async function appendUploadPhotos(db, files = {}, names = []) {
  const urls = [];
  for (const name of names) {
    const list = Array.isArray(files[name]) ? files[name] : [];
    for (const file of list) {
      const url = await fileUrlFromFile(db, file);
      if (url) urls.push(url);
    }
  }
  return urls;
}

async function extractPhotoFields(db, files = {}, existing = {}) {
  const categories = [
    { single: 'bill_photo', plural: 'bill_photos', aliases: ['bill_photo', 'bill_photos', 'receipt_photo', 'receipt_photos', 'photo'], existingSingles: ['bill_photo', 'receipt_photo'] },
    { single: 'document_photo', plural: 'document_photos', aliases: ['document_photo', 'document_photos'], existingSingles: ['document_photo'] },
    { single: 'oil_photo', plural: 'oil_photos', aliases: ['oil_photo', 'oil_photos'], existingSingles: ['oil_photo'] },
    { single: 'cargo_photo', plural: 'cargo_photos', aliases: ['cargo_photo', 'cargo_photos'], existingSingles: ['cargo_photo'] },
    { single: 'adblue_photo', plural: 'adblue_photos', aliases: ['adblue_photo', 'adblue_photos'], existingSingles: ['adblue_photo'] },
    { single: 'stock_photo', plural: 'stock_photos', aliases: ['stock_photo', 'stock_photos'], existingSingles: ['stock_photo'] },
  ];

  const photoFields = {};
  for (const category of categories) {
    const existingPhotos = [
      ...toPhotoArray(existing[category.plural]),
      ...category.existingSingles.flatMap((field) => toPhotoArray(existing[field])),
    ];
    const uploadedPhotos = await appendUploadPhotos(db, files, category.aliases);
    const allPhotos = uniqueList([...existingPhotos, ...uploadedPhotos]);
    photoFields[category.plural] = allPhotos;
    photoFields[category.single] = allPhotos[0] || '';
  }
  photoFields.receipt_photo = photoFields.bill_photo || '';
  return photoFields;
}

async function normalizeDeliveryBody(db, body, files = {}, user, existing = {}) {
  const itemType = normalizeItemType(body.item_type || body.oil_type || existing.item_type || existing.oil_type);
  if (!itemType) {
    const err = new Error('เลือกประเภทให้ถูกต้อง: ดีเซล, น้ำมันเครื่อง, แอดบลู');
    err.status = 422;
    throw err;
  }

  const workDate = parseDateOrNull(body.work_date) || parseDateOrNull(body.created_date) || existing.work_date || today();
  const fillDate = parseDateOrNull(body.fill_date) || parseDateOrNull(body.fuel_date) || existing.fill_date || workDate;
  // v37: เลขหัวจ่ายก่อน/หลังเป็นเลขอ้างอิงเท่านั้น ไม่ใช้คำนวณจำนวนลิตรแล้ว
  const odometerBefore = Math.round(toNumber(body.station_meter_before || body.nozzle_meter_before || body.odometer_before, toNumber(existing.station_meter_before || existing.odometer_before, 0)));
  const odometerAfter = Math.round(toNumber(body.station_meter_after || body.nozzle_meter_after || body.odometer_after, toNumber(existing.station_meter_after || existing.odometer_after, 0)));
  const quantityLiters = round2(toNumber(body.station_liters || body.quantity_liters || body.liters || body.adblue_liters, toNumber(existing.quantity_liters, 0)));
  const nozzleLiters = 0;
  const explicitDistance = toNumber(body.distance_km, toNumber(existing.distance_km, 0));
  const distanceKm = explicitDistance > 0 ? round2(explicitDistance) : 0;
  const priceBahtPerLiter = toNumber(body.price_baht_per_liter || body.price_per_liter, toNumber(existing.price_baht_per_liter || existing.price_per_liter, 0));
  const explicitAmount = toNumber(body.amount_baht, 0);
  const expectedAmount = expectedAmountFromPrice(quantityLiters, priceBahtPerLiter);
  // v37: จำนวนบาทใช้สูตร จำนวนลิตรที่กรอก × ราคาน้ำมันลิตรละ เป็นหลัก
  const amountBaht = expectedAmount > 0 ? expectedAmount : correctAmountIfCommaBug(explicitAmount, quantityLiters, priceBahtPerLiter);
  const fuelEfficiency = distanceKm > 0 && quantityLiters > 0 ? round2(distanceKm / quantityLiters) : 0;

  const photoFields = await extractPhotoFields(db, files, existing);
  const data = {
    user_id: (user.role || '') === 'owner' && body.user_id ? String(body.user_id) : String(user.id),
    vehicle_id: body.vehicle_id ? String(body.vehicle_id) : existing.vehicle_id || null,
    work_date: workDate,
    fill_date: fillDate,
    fill_time: cleanString(body.fill_time, existing.fill_time || ''),
    report_month: cleanString(body.report_month) || monthFromDate(fillDate),
    operation_type: cleanString(body.operation_type) || cleanString(body.stock_action) || existing.operation_type || 'ทำน้ำมันบรรทุก',
    item_type: itemType,
    oil_type: itemType,
    bill_no: cleanString(body.bill_no, existing.bill_no || body.oil_bill_no || ''),
    oil_bill_no: cleanString(body.oil_bill_no, existing.oil_bill_no || body.bill_no || ''),
    diesel_bill_no: cleanString(body.diesel_bill_no, existing.diesel_bill_no || ''),
    engine_oil_bill_no: cleanString(body.engine_oil_bill_no, existing.engine_oil_bill_no || ''),
    adblue_bill_no: cleanString(body.adblue_bill_no, existing.adblue_bill_no || ''),
    document_no: cleanString(body.document_no, existing.document_no || ''),
    work_bill_no: cleanString(body.work_bill_no, existing.work_bill_no || body.bill_no || ''),
    stone_bill_no: cleanString(body.stone_bill_no, existing.stone_bill_no || ''),
    sand_bill_no: cleanString(body.sand_bill_no, existing.sand_bill_no || ''),
    origin_place: cleanString(body.origin_place, existing.origin_place || ''),
    destination_place: cleanString(body.destination_place, existing.destination_place || ''),
    load_date: parseDateOrNull(body.load_date) || existing.load_date || null,
    unload_date: parseDateOrNull(body.unload_date) || existing.unload_date || null,
    cargo_stone_weight: toNumber(body.cargo_stone_weight, toNumber(existing.cargo_stone_weight, 0)),
    cargo_sand_weight: toNumber(body.cargo_sand_weight, toNumber(existing.cargo_sand_weight, 0)),
    quantity_liters: quantityLiters,
    station_liters: quantityLiters,
    adblue_liters: itemType === 'แอดบลู' ? quantityLiters : toNumber(body.adblue_liters, toNumber(existing.adblue_liters, 0)),
    diesel_liters: itemType === 'ดีเซล' ? quantityLiters : toNumber(body.diesel_liters, toNumber(existing.diesel_liters, 0)),
    engine_oil_liters: itemType === 'น้ำมันเครื่อง' ? quantityLiters : toNumber(body.engine_oil_liters, toNumber(existing.engine_oil_liters, 0)),
    price_baht_per_liter: priceBahtPerLiter,
    amount_baht: amountBaht,
    distance_km: distanceKm,
    odometer_before: odometerBefore,
    odometer_after: odometerAfter,
    meter_distance_km: distanceKm,
    station_meter_before: odometerBefore,
    station_meter_after: odometerAfter,
    station_meter_delta_liters: nozzleLiters,
    nozzle_liters: nozzleLiters,
    // v37: จำนวนลิตรให้กรอกเอง, จำนวนบาท = ลิตร × ราคาลิตรละ, อัตราสิ้นเปลือง = ระยะทาง ÷ ลิตร
    fuel_used_liters: quantityLiters,
    fuel_efficiency_km_per_liter: fuelEfficiency,
    filler_name: cleanString(body.filler_name, existing.filler_name || ''),
    recorder_name: cleanString(body.recorder_name, existing.recorder_name || user.name || user.username || ''),
    driver_name_input: cleanString(body.driver_name, existing.driver_name_input || ''),
    wage_payer: cleanString(body.wage_payer, existing.wage_payer || ''),
    payment_status: cleanString(body.payment_status, existing.payment_status || 'pending') || 'pending',
    note: cleanString(body.note, existing.note || ''),
    bill_photo: photoFields.bill_photo || '',
    receipt_photo: photoFields.bill_photo || '',
    bill_photos: photoFields.bill_photos || [],
    document_photo: photoFields.document_photo || '',
    document_photos: photoFields.document_photos || [],
    oil_photo: photoFields.oil_photo || '',
    oil_photos: photoFields.oil_photos || [],
    cargo_photo: photoFields.cargo_photo || '',
    cargo_photos: photoFields.cargo_photos || [],
    adblue_photo: photoFields.adblue_photo || '',
    adblue_photos: photoFields.adblue_photos || [],
    diesel_amount_baht: itemType === 'ดีเซล' ? amountBaht : toNumber(body.diesel_amount_baht, toNumber(existing.diesel_amount_baht, 0)),
    engine_oil_amount_baht: itemType === 'น้ำมันเครื่อง' ? amountBaht : toNumber(body.engine_oil_amount_baht, toNumber(existing.engine_oil_amount_baht, 0)),
    adblue_amount_baht: itemType === 'แอดบลู' ? amountBaht : toNumber(body.adblue_amount_baht, toNumber(existing.adblue_amount_baht, 0)),
    updated_at: nowIso(),
  };
  return data;
}

async function createAutoNotifications(db, deliveryId, data) {
  const alerts = [];
  if (Number(data.quantity_liters || 0) >= 280) alerts.push(['ปริมาณสูงผิดปกติ', 'รายการนี้มีปริมาณตั้งแต่ 280 ลิตรขึ้นไป กรุณาตรวจสอบ', 'danger']);
  if ((data.payment_status || 'pending') === 'pending') alerts.push(['ยังไม่จ่ายค่าแรง', 'รายการนี้ยังเป็นสถานะรอจ่าย', 'warning']);
  if (!data.bill_photo && !toPhotoArray(data.bill_photos).length) alerts.push(['ยังไม่แนบรูปบิล', 'รายการนี้ยังไม่มีรูปบิล', 'info']);
  if (!data.document_photo && !toPhotoArray(data.document_photos).length) alerts.push(['ยังไม่แนบรูปเอกสาร', 'รายการนี้ยังไม่มีรูปเอกสารประกอบ', 'info']);
  if (!alerts.length) return;
  await db.collection('notifications').insertMany(alerts.map((alert) => ({
    delivery_id: deliveryId,
    title: alert[0],
    message: alert[1],
    type: alert[2],
    is_read: 0,
    created_at: nowIso(),
  })));
}

async function applyStockChange(db, { item_type, change_liters, transaction_type, ref_delivery_id = null, user_id = null, note = '', transaction_date = null, amount_baht = 0, bill_no = '', supplier_name = '', photo = '' }) {
  const itemType = normalizeItemType(item_type);
  const change = toNumber(change_liters, 0);
  if (!itemType || change === 0) return null;

  await db.collection('stocks').updateOne(
    { item_type: itemType },
    {
      $inc: { balance_liters: change },
      $set: { updated_at: nowIso() },
      $setOnInsert: { item_type: itemType, created_at: nowIso() },
    },
    { upsert: true },
  );

  const inserted = await db.collection('stock_movements').insertOne({
    item_type: itemType,
    transaction_type,
    quantity_liters: Math.abs(change),
    change_liters: change,
    amount_baht: toNumber(amount_baht, 0),
    bill_no: cleanString(bill_no),
    supplier_name: cleanString(supplier_name),
    photo: cleanString(photo),
    ref_delivery_id,
    user_id,
    note,
    transaction_date: parseDateOrNull(transaction_date) || today(),
    created_at: nowIso(),
  });
  return inserted.insertedId;
}

async function syncStockForDeliveryCreate(db, deliveryId, data, userId) {
  if (data.operation_type === 'เติมสต๊อก') return;
  const qty = toNumber(data.quantity_liters, 0);
  if (qty > 0) {
    await applyStockChange(db, {
      item_type: data.item_type,
      change_liters: -qty,
      transaction_type: 'ทำน้ำมันบรรทุก',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: `ใช้จากรายการงาน ${data.bill_no || ''}`.trim(),
      transaction_date: data.fill_date || data.work_date,
      amount_baht: data.amount_baht,
      bill_no: data.oil_bill_no || data.bill_no,
      photo: data.oil_photo || data.bill_photo,
    });
  }
}

async function syncStockForDeliveryUpdate(db, deliveryId, oldData, newData, userId) {
  const oldQty = toNumber(oldData.quantity_liters, 0);
  const newQty = toNumber(newData.quantity_liters, 0);
  const oldType = normalizeItemType(oldData.item_type || oldData.oil_type);
  const newType = normalizeItemType(newData.item_type || newData.oil_type);
  if (oldQty > 0 && oldType) {
    await applyStockChange(db, {
      item_type: oldType,
      change_liters: oldQty,
      transaction_type: 'ยกเลิกยอดเดิมก่อนแก้ไข',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: 'คืนสต๊อกจากรายการเดิมก่อนแก้ไข',
      transaction_date: newData.fill_date || newData.work_date,
    });
  }
  if (newQty > 0 && newType && newData.operation_type !== 'เติมสต๊อก') {
    await applyStockChange(db, {
      item_type: newType,
      change_liters: -newQty,
      transaction_type: 'ทำน้ำมันบรรทุก',
      ref_delivery_id: String(deliveryId),
      user_id: userId,
      note: 'หักสต๊อกหลังแก้ไขรายการ',
      transaction_date: newData.fill_date || newData.work_date,
      amount_baht: newData.amount_baht,
      bill_no: newData.oil_bill_no || newData.bill_no,
      photo: newData.oil_photo || newData.bill_photo,
    });
  }
}

async function syncStockForDeliveryDelete(db, delivery, userId) {
  const qty = toNumber(delivery.quantity_liters, 0);
  const itemType = normalizeItemType(delivery.item_type || delivery.oil_type);
  if (qty > 0 && itemType && delivery.operation_type !== 'เติมสต๊อก') {
    await applyStockChange(db, {
      item_type: itemType,
      change_liters: qty,
      transaction_type: 'คืนสต๊อกจากการลบรายการ',
      ref_delivery_id: String(delivery._id),
      user_id: userId,
      note: 'คืนสต๊อกเพราะลบรายการงาน',
      transaction_date: delivery.fill_date || delivery.work_date,
    });
  }
}

async function buildDeliveryFilter(db, user, query) {
  const filter = {};
  if ((user.role || '') !== 'owner') filter.user_id = String(user.id);
  if (query.from) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$gte = parseDateOrNull(query.from) || String(query.from);
  }
  if (query.to) {
    filter.work_date = filter.work_date || {};
    filter.work_date.$lte = parseDateOrNull(query.to) || String(query.to);
  }
  if (query.item_type) {
    const itemType = normalizeItemType(query.item_type);
    if (itemType) filter.item_type = itemType;
  }
  if (query.q) {
    const q = cleanString(query.q);
    if (q) {
      const rx = safeRegex(q);
      const or = [
        { bill_no: rx },
        { oil_bill_no: rx },
        { adblue_bill_no: rx },
        { stone_bill_no: rx },
        { sand_bill_no: rx },
        { origin_place: rx },
        { destination_place: rx },
        { item_type: rx },
        { oil_type: rx },
        { plate_no: rx },
        { vehicle_no: rx },
        { driver_name: rx },
        { filler_name: rx },
        { recorder_name: rx },
        { driver_name_input: rx },
      ];
      const vehicleFilter = { is_active: 1, $or: [{ plate_no: rx }, { driver_name: rx }, { vehicle_no: rx }, { description: rx }] };
      if ((user.role || '') !== 'owner') vehicleFilter.user_id = String(user.id);
      const vehicles = await db.collection('vehicles').find(vehicleFilter, { projection: { _id: 1 } }).toArray();
      const vehicleIds = vehicles.map((v) => String(v._id));
      if (vehicleIds.length) or.push({ vehicle_id: { $in: vehicleIds } });
      filter.$or = or;
    }
  }
  return filter;
}

async function enrichDelivery(db, delivery) {
  const d = mongoToPlain(delivery);
  const [employee, vehicle] = await Promise.all([
    d.user_id ? findUserPublic(db, d.user_id) : null,
    d.vehicle_id ? findVehiclePublic(db, d.vehicle_id) : null,
  ]);
  d.employee_name = employee?.name || null;
  d.employee_username = employee?.username || null;
  d.plate_no = vehicle?.plate_no || null;
  d.vehicle_no = vehicle?.vehicle_no || null;
  d.driver_name = vehicle?.driver_name || d.driver_name_input || null;
  const quantity = toNumber(d.quantity_liters, 0);
  const rawAmount = toNumber(d.amount_baht, 0);
  const price = toNumber(d.price_baht_per_liter || d.price_per_liter, 0);
  const amount = correctAmountIfCommaBug(rawAmount, quantity, price);
  d.amount_baht = amount;
  d.price_baht_per_liter = price > 0 ? round2(price) : (quantity > 0 ? round2(amount / quantity) : 0);
  d.price_per_liter = d.price_baht_per_liter;
  const distance = toNumber(d.distance_km, 0);
  const before = Math.round(toNumber(d.station_meter_before || d.odometer_before, 0));
  const after = Math.round(toNumber(d.station_meter_after || d.odometer_after, 0));
  d.station_meter_before = before;
  d.station_meter_after = after;
  d.station_meter_delta_liters = toNumber(d.station_meter_delta_liters, 0);
  d.nozzle_liters = toNumber(d.nozzle_liters, 0);
  d.quantity_liters = round2(d.quantity_liters || d.station_liters || d.liters || 0);
  d.distance_km = distance;
  d.fuel_efficiency_km_per_liter = distance > 0 && d.quantity_liters > 0 ? round2(distance / d.quantity_liters) : 0;
  d.decimal_fix_version = 'v37_manual_liters';
  return d;
}

function groupSum(rows, key, sumField, limit = 0) {
  const groups = new Map();
  for (const row of rows) {
    const name = cleanString(row[key]) || 'ไม่ระบุ';
    if (!groups.has(name)) groups.set(name, { name, value: 0, trips: 0 });
    const item = groups.get(name);
    item.value += toNumber(row[sumField], 0);
    item.trips += 1;
  }
  const out = Array.from(groups.values()).sort((a, b) => b.value - a.value);
  return limit > 0 ? out.slice(0, limit) : out;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extByMime = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
    const ext = extByMime[file.mimetype] || path.extname(file.originalname).replace('.', '') || 'jpg';
    const safe = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}_${safe}.${ext}`);
  },
});

const uploadMaxMb = Math.max(Number(config.uploadMaxMb || 200), 50);
const upload = multer({
  storage,
  limits: {
    // รองรับไฟล์ใหญ่จากมือถือได้มากขึ้น และฝั่ง Frontend จะย่อรูปอัตโนมัติก่อนส่ง
    fileSize: uploadMaxMb * 1024 * 1024,
    files: 80,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
    const allowedMime = mime.startsWith('image/') || ['application/pdf', 'application/octet-stream'].includes(mime);
    const allowedExt = imageExts.includes(ext) || ext === '.pdf';
    if (!allowedMime || !allowedExt) return cb(new Error('รองรับเฉพาะไฟล์รูปภาพจากมือถือและ PDF'));
    return cb(null, true);
  },
});

function uploadFields(req, res, next) {
  return upload.fields([
  { name: 'photo', maxCount: 10 },
  { name: 'receipt_photo', maxCount: 10 },
  { name: 'bill_photo', maxCount: 10 },
  { name: 'bill_photos', maxCount: 10 },
  { name: 'document_photo', maxCount: 10 },
  { name: 'document_photos', maxCount: 10 },
  { name: 'oil_photo', maxCount: 10 },
  { name: 'oil_photos', maxCount: 10 },
  { name: 'cargo_photo', maxCount: 10 },
  { name: 'cargo_photos', maxCount: 10 },
  { name: 'adblue_photo', maxCount: 10 },
  { name: 'adblue_photos', maxCount: 10 },
  { name: 'stock_photo', maxCount: 10 },
  { name: 'stock_photos', maxCount: 10 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      err.status = 413;
      err.message = `ไฟล์ใหญ่เกินขนาดที่ระบบรับได้ต่อไฟล์ (${uploadMaxMb} MB) หากเป็นรูปจากมือถือ ระบบจะพยายามย่อก่อนส่งให้อัตโนมัติ กรุณาลองเลือก/ถ่ายรูปใหม่อีกครั้ง`;
    } else if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      err.status = 413;
      err.message = 'จำนวนไฟล์แนบมากเกินไป กรุณาลดจำนวนรูปแล้วลองใหม่';
    } else if (!err.status) {
      err.status = 400;
    }
    return next(err);
  });
}


const loginAttempts = new Map();

function getClientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginRateLimit(req, res, next) {
  const key = `login:${getClientKey(req)}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 20;
  const current = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt < now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  loginAttempts.set(key, current);
  if (current.count > maxAttempts) {
    return jsonResponse(res, { success: false, message: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' }, 429);
  }
  return next();
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (config.corsAllowAll) return cb(null, true);
    if (config.corsAllowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Access-Token'],
  exposedHeaders: ['Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 204,
}));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));
app.use('/public/uploads', express.static(uploadDir));

// รองรับ frontend เก่าที่ยังยิงแบบ /index.php?route=/auth/login หรือ /index.php/auth/login
app.use((req, _res, next) => {
  if (req.query && req.query.route) {
    const route = '/' + String(req.query.route).replace(/^\/+/, '');
    const rest = { ...req.query };
    delete rest.route;
    const qs = new URLSearchParams(rest).toString();
    req.url = route + (qs ? `?${qs}` : '');
  } else if (req.url.startsWith('/index.php/')) {
    req.url = req.url.replace('/index.php', '') || '/';
  } else if (req.url === '/index.php') {
    req.url = '/';
  }
  next();
});

app.get('/ping', (req, res) => jsonResponse(res, { success: true, message: 'pong', build: 'swt-clean-branding-v26', time: nowIso() }));

app.use(asyncHandler(async (req, _res, next) => {
  req.db = await getDb();
  next();
}));

app.get('/uploads/db/:id', asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return res.status(404).send('file not found');
  const file = await req.db.collection('uploaded_files').findOne({ _id: oid });
  if (!file || !file.data) return res.status(404).send('file not found');
  res.setHeader('Content-Type', file.content_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename || 'upload')}"`);
  res.send(Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer || file.data));
}));

const router = express.Router();

router.get('/', (_req, res) => jsonResponse(res, {
  success: true,
  name: 'Sarawut Oil Management API',
  build: 'swt-clean-branding-v26',
  item_types: ITEM_TYPES,
  endpoints: ['/health', '/auth/login', '/auth/me', '/deliveries', '/dashboard/stats', '/stocks', '/notifications', '/users', '/vehicles'],
}));

router.get('/health', asyncHandler(async (req, res) => {
  await req.db.command({ ping: 1 });
  jsonResponse(res, { success: true, message: 'Backend connected to MongoDB successfully', database: config.mongodb.db, build: 'swt-clean-branding-v26', time: nowIso() });
}));

router.post('/auth/login', loginRateLimit, asyncHandler(async (req, res) => {
  const username = cleanString(req.body.username);
  const password = cleanString(req.body.password);
  const user = await req.db.collection('users').findOne({ username, is_active: { $ne: 0 } });
  if (!user) return jsonResponse(res, { success: false, message: 'ไม่พบผู้ใช้งาน' }, 401);
  const hash = user.password_hash || user.password || '';
  const ok = hash.startsWith('$2') ? await bcrypt.compare(password, hash) : password === hash;
  if (!ok) return jsonResponse(res, { success: false, message: 'รหัสผ่านผิดพลาด' }, 401);
  const publicData = publicUser(user);
  const token = signUserToken(publicData);
  jsonResponse(res, { success: true, token, user: publicData });
}));

router.get('/auth/me', requireAuth, (req, res) => jsonResponse(res, { success: true, user: req.user }));

router.get('/item-types', (_req, res) => jsonResponse(res, { success: true, data: ITEM_TYPES }));

router.get('/meta/fields', requireAuth, (_req, res) => jsonResponse(res, {
  success: true,
  data: {
    collections: ['users', 'vehicles', 'deliveries', 'stocks', 'stock_movements', 'notifications'],
    item_types: ITEM_TYPES,
    delivery_labels: {
      work_date: 'ลงวันที่กำกับ', fill_date: 'วันที่เติม', fill_time: 'เวลาเติม', operation_type: 'ประเภทงาน', item_type: 'ประเภทน้ำมัน',
      plate_no: 'ทะเบียนรถ', vehicle_no: 'เบอร์รถ', driver_name: 'ขขร / คนขับ', filler_name: 'ชื่อผู้เติม', recorder_name: 'ชื่อผู้กรอก',
      origin_place: 'ต้นทาง', destination_place: 'ปลายทาง',
      load_date: 'วันที่บรรทุก', unload_date: 'วันที่ลงของ', cargo_stone_weight: 'น้ำหนักหิน', cargo_sand_weight: 'น้ำหนักทราย',
      quantity_liters: 'จำนวนลิตรที่กรอก', price_baht_per_liter: 'ราคาน้ำมันลิตรละ (บาท)', amount_baht: 'ยอดเงินตามบิล', distance_km: 'ระยะทางกิโลเมตรที่กรอก', odometer_before: 'เลขหัวจ่ายก่อนเติม (อ้างอิง)', odometer_after: 'เลขหัวจ่ายหลังเติม (อ้างอิง)', fuel_efficiency_km_per_liter: 'อัตราสิ้นเปลือง กม./ลิตร',
      bill_photos: 'รูปบิลหลายรูป', document_photos: 'รูปเอกสารหลายรูป', oil_photos: 'รูปเกี่ยวกับน้ำมันหลายรูป', cargo_photos: 'รูปบรรทุกหลายรูป'
    }
  }
}));

router.get('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const users = await req.db.collection('users').find({}, { projection: { password_hash: 0, password: 0 }, sort: { created_at: -1 } }).toArray();
  jsonResponse(res, { success: true, data: users.map(publicUser) });
}));

router.post('/users', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const username = cleanString(req.body.username);
  const password = cleanString(req.body.password);
  if (!username || !password) return jsonResponse(res, { success: false, message: 'กรอก username และ password' }, 422);
  const passwordHash = await bcrypt.hash(password, 10);
  const doc = {
    name: cleanString(req.body.name) || username,
    username,
    password_hash: passwordHash,
    role: ['owner', 'employee'].includes(req.body.role) ? req.body.role : 'employee',
    phone: cleanString(req.body.phone),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const result = await req.db.collection('users').insertOne(doc);
  emitDataChanged('users', 'create', { id: String(result.insertedId) });
  jsonResponse(res, { success: true, data: publicUser({ ...doc, _id: result.insertedId }) });
}));

router.put('/users/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' }, 400);
  const update = {
    name: cleanString(req.body.name),
    username: cleanString(req.body.username),
    role: ['owner', 'employee'].includes(req.body.role) ? req.body.role : 'employee',
    phone: cleanString(req.body.phone),
    is_active: req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1,
    updated_at: nowIso(),
  };
  Object.keys(update).forEach((key) => update[key] === '' && delete update[key]);
  if (cleanString(req.body.password)) update.password_hash = await bcrypt.hash(cleanString(req.body.password), 10);
  await req.db.collection('users').updateOne({ _id: oid }, { $set: update });
  const user = await findUserPublic(req.db, oid);
  emitDataChanged('users', 'update', { id: String(oid) });
  jsonResponse(res, { success: true, data: user });
}));

router.delete('/users/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' }, 400);
  await req.db.collection('users').updateOne({ _id: oid }, { $set: { is_active: 0, updated_at: nowIso() } });
  emitDataChanged('users', 'delete', { id: String(oid) });
  jsonResponse(res, { success: true });
}));

router.get('/vehicles/options', requireAuth, asyncHandler(async (req, res) => {
  const filter = { is_active: { $ne: 0 } };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const vehicles = await req.db.collection('vehicles').find(filter, {
    sort: { created_at: -1 },
    projection: { plate_no: 1, vehicle_no: 1, driver_name: 1, user_id: 1 },
    limit: 200,
  }).toArray();
  jsonResponse(res, { success: true, data: vehicles.map(mongoToPlain) });
}));

router.get('/vehicles', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const filter = { is_active: { $ne: 0 } };
  const vehicles = await req.db.collection('vehicles').find(filter, { sort: { created_at: -1 } }).toArray();
  const enriched = await Promise.all(vehicles.map(async (vehicle) => {
    const v = mongoToPlain(vehicle);
    const employee = v.user_id ? await findUserPublic(req.db, v.user_id) : null;
    v.employee_name = employee?.name || null;
    return v;
  }));
  jsonResponse(res, { success: true, data: enriched });
}));

router.post('/vehicles', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const plateNo = cleanString(req.body.plate_no);
  if (!plateNo) return jsonResponse(res, { success: false, message: 'กรอกเลขทะเบียนรถ' }, 422);
  const userId = (req.user.role || '') === 'owner' && req.body.user_id ? String(req.body.user_id) : String(req.user.id);
  const doc = {
    user_id: userId,
    plate_no: plateNo,
    vehicle_no: cleanString(req.body.vehicle_no),
    driver_name: cleanString(req.body.driver_name),
    description: cleanString(req.body.description),
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const result = await req.db.collection('vehicles').insertOne(doc);
  emitDataChanged('vehicles', 'create', { id: String(result.insertedId) });
  jsonResponse(res, { success: true, data: mongoToPlain({ ...doc, _id: result.insertedId }) });
}));

router.put('/vehicles/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรถไม่ถูกต้อง' }, 400);
  const filter = { _id: oid, is_active: { $ne: 0 } };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const update = {
    plate_no: cleanString(req.body.plate_no),
    vehicle_no: cleanString(req.body.vehicle_no),
    driver_name: cleanString(req.body.driver_name),
    description: cleanString(req.body.description),
    updated_at: nowIso(),
  };
  if ((req.user.role || '') === 'owner' && req.body.user_id) update.user_id = String(req.body.user_id);
  Object.keys(update).forEach((key) => update[key] === '' && delete update[key]);
  await req.db.collection('vehicles').updateOne(filter, { $set: update });
  const vehicle = await findVehiclePublic(req.db, oid);
  emitDataChanged('vehicles', 'update', { id: String(oid) });
  jsonResponse(res, { success: true, data: vehicle });
}));

router.delete('/vehicles/:id', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรถไม่ถูกต้อง' }, 400);
  const filter = { _id: oid };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  await req.db.collection('vehicles').updateOne(filter, { $set: { is_active: 0, updated_at: nowIso() } });
  emitDataChanged('vehicles', 'delete', { id: String(oid) });
  jsonResponse(res, { success: true });
}));

router.get('/deliveries', requireAuth, asyncHandler(async (req, res) => {
  const filter = await buildDeliveryFilter(req.db, req.user, req.query);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const rows = await req.db.collection('deliveries').find(filter, { sort: { work_date: -1, created_at: -1 }, limit }).toArray();
  const data = await Promise.all(rows.map((row) => enrichDelivery(req.db, row)));
  jsonResponse(res, { success: true, data });
}));

router.post('/deliveries', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const data = await normalizeDeliveryBody(req.db, req.body, req.files, req.user);
  const vehicleId = await resolveVehicleId(req.db, req.user, req.body);
  if (!vehicleId) return jsonResponse(res, { success: false, message: 'กรอกทะเบียนรถหรือเลือกรถให้ถูกต้อง' }, 422);
  data.vehicle_id = vehicleId;
  data.created_at = nowIso();
  data.stock_synced = data.operation_type !== 'เติมสต๊อก';
  const result = await req.db.collection('deliveries').insertOne(data);
  if (data.stock_synced) await syncStockForDeliveryCreate(req.db, result.insertedId, data, String(req.user.id));
  await createAutoNotifications(req.db, String(result.insertedId), data);
  emitDataChanged('deliveries', 'create', { id: String(result.insertedId) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-create' });
  const delivery = await enrichDelivery(req.db, { ...data, _id: result.insertedId });
  jsonResponse(res, { success: true, data: delivery }, 201);
}));

router.get('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const delivery = await req.db.collection('deliveries').findOne(filter);
  if (!delivery) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  jsonResponse(res, { success: true, data: await enrichDelivery(req.db, delivery) });
}));

router.put('/deliveries/:id', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const existing = await req.db.collection('deliveries').findOne(filter);
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  const data = await normalizeDeliveryBody(req.db, req.body, req.files, req.user, existing);
  const vehicleId = await resolveVehicleId(req.db, req.user, { ...req.body, vehicle_id: req.body.vehicle_id || existing.vehicle_id });
  if (vehicleId) data.vehicle_id = vehicleId;
  data.stock_synced = existing.stock_synced === true || existing.stock_synced === 1;
  await req.db.collection('deliveries').updateOne(filter, { $set: data });
  if (data.stock_synced) await syncStockForDeliveryUpdate(req.db, oid, existing, data, String(req.user.id));
  emitDataChanged('deliveries', 'update', { id: String(oid) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-update' });
  const fresh = await req.db.collection('deliveries').findOne({ _id: oid });
  jsonResponse(res, { success: true, data: await enrichDelivery(req.db, fresh) });
}));


router.delete('/deliveries/:id', requireAuth, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสรายการไม่ถูกต้อง' }, 400);
  const filter = { _id: oid };
  if ((req.user.role || '') !== 'owner') filter.user_id = String(req.user.id);
  const existing = await req.db.collection('deliveries').findOne(filter);
  if (!existing) return jsonResponse(res, { success: false, message: 'ไม่พบรายการ' }, 404);
  await req.db.collection('deliveries').deleteOne(filter);
  if (existing.stock_synced === true || existing.stock_synced === 1) await syncStockForDeliveryDelete(req.db, existing, String(req.user.id));
  emitDataChanged('deliveries', 'delete', { id: String(oid) });
  emitDataChanged('dashboard', 'refresh', { reason: 'delivery-delete' });
  jsonResponse(res, { success: true });
}));

router.get('/stocks', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const rows = await req.db.collection('stocks').find({ item_type: { $in: ITEM_TYPES } }).toArray();
  const map = new Map(rows.map((row) => [row.item_type, row]));
  const data = ITEM_TYPES.map((itemType) => mongoToPlain(map.get(itemType) || { item_type: itemType, balance_liters: 0 }));
  jsonResponse(res, { success: true, data });
}));

router.get('/stocks/transactions', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
  const [currentRows, legacyRows] = await Promise.all([
    req.db.collection('stock_movements').find({}, { sort: { created_at: -1 }, limit }).toArray(),
    req.db.collection('stock_transactions').find({}, { sort: { created_at: -1 }, limit: 30 }).toArray().catch(() => []),
  ]);
  const rows = [...currentRows, ...legacyRows]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit);
  jsonResponse(res, { success: true, data: rows.map(mongoToPlain) });
}));

router.post('/stocks/add', requireAuth, requireOwner, uploadFields, asyncHandler(async (req, res) => {
  const itemType = normalizeItemType(req.body.item_type || req.body.oil_type);
  if (!itemType) return jsonResponse(res, { success: false, message: 'เลือกประเภทให้ถูกต้อง: ดีเซล, น้ำมันเครื่อง, แอดบลู' }, 422);
  const qty = toNumber(req.body.quantity_liters || req.body.liters, 0);
  if (qty <= 0) return jsonResponse(res, { success: false, message: 'กรอกจำนวนลิตรให้มากกว่า 0' }, 422);
  const photos = await extractPhotoFields(req.db, req.files);
  await applyStockChange(req.db, {
    item_type: itemType,
    change_liters: qty,
    transaction_type: 'เติมสต๊อก',
    user_id: String(req.user.id),
    note: cleanString(req.body.note),
    transaction_date: req.body.transaction_date || req.body.fill_date || today(),
    amount_baht: req.body.amount_baht,
    bill_no: req.body.bill_no || req.body.oil_bill_no || req.body.adblue_bill_no,
    supplier_name: req.body.supplier_name,
    photo: photos.bill_photo || photos.oil_photo || photos.document_photo || photos.stock_photo || '',
  });
  const stock = await req.db.collection('stocks').findOne({ item_type: itemType });
  emitDataChanged('stocks', 'change', { item_type: itemType });
  emitDataChanged('dashboard', 'refresh', { reason: 'stock-change' });
  jsonResponse(res, { success: true, data: mongoToPlain(stock) });
}));

router.post('/stocks/adjust', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const itemType = normalizeItemType(req.body.item_type || req.body.oil_type);
  const qty = toNumber(req.body.change_liters, 0);
  if (!itemType || qty === 0) return jsonResponse(res, { success: false, message: 'เลือกประเภทและกรอกจำนวนปรับสต๊อก' }, 422);
  await applyStockChange(req.db, {
    item_type: itemType,
    change_liters: qty,
    transaction_type: 'ปรับสต๊อก',
    user_id: String(req.user.id),
    note: cleanString(req.body.note),
    transaction_date: req.body.transaction_date || today(),
  });
  const stock = await req.db.collection('stocks').findOne({ item_type: itemType });
  emitDataChanged('stocks', 'change', { item_type: itemType });
  emitDataChanged('dashboard', 'refresh', { reason: 'stock-change' });
  jsonResponse(res, { success: true, data: mongoToPlain(stock) });
}));

router.get('/dashboard/stats', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const filter = await buildDeliveryFilter(req.db, req.user, req.query);
  const rows = await req.db.collection('deliveries').find(filter, { sort: { work_date: -1, created_at: -1 }, limit: 2000 }).toArray();
  const enriched = await Promise.all(rows.map((row) => enrichDelivery(req.db, row)));
  const totalLiters = enriched.reduce((sum, row) => sum + toNumber(row.quantity_liters, 0), 0);
  const totalAmount = enriched.reduce((sum, row) => sum + toNumber(row.amount_baht, 0), 0);
  const totalDistance = enriched.reduce((sum, row) => sum + toNumber(row.distance_km, 0), 0);
  const totalStoneWeight = enriched.reduce((sum, row) => sum + toNumber(row.cargo_stone_weight, 0), 0);
  const totalSandWeight = enriched.reduce((sum, row) => sum + toNumber(row.cargo_sand_weight, 0), 0);
  const stocks = await req.db.collection('stocks').find({ item_type: { $in: ITEM_TYPES } }).toArray();
  const unreadNotifications = await req.db.collection('notifications').countDocuments({ is_read: { $ne: 1 } });
  const byDayMap = new Map();
  for (const row of enriched) {
    const key = parseDateOrNull(row.fill_date || row.work_date) || 'ไม่ระบุ';
    if (!byDayMap.has(key)) byDayMap.set(key, { name: key, value: 0, trips: 0, amount: 0 });
    const item = byDayMap.get(key);
    item.value += toNumber(row.quantity_liters, 0);
    item.amount += toNumber(row.amount_baht, 0);
    item.trips += 1;
  }
  const byDay = Array.from(byDayMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(-31);
  const byPlate = groupSum(enriched, 'plate_no', 'quantity_liters', 8);
  const byDriver = groupSum(enriched, 'driver_name', 'quantity_liters', 8);
  const byRecorder = groupSum(enriched, 'recorder_name', 'quantity_liters', 8);
  const lowStocks = stocks.map(mongoToPlain).filter((stock) => toNumber(stock.balance_liters, 0) < 100);
  jsonResponse(res, {
    success: true,
    data: {
      total_trips: enriched.length,
      total_liters: round2(totalLiters),
      total_amount: round2(totalAmount),
      avg_price_per_liter: totalLiters > 0 ? round2(totalAmount / totalLiters) : 0,
      total_distance_km: round2(totalDistance),
      avg_fuel_efficiency_km_per_liter: totalDistance > 0 && totalLiters > 0 ? round2(totalDistance / totalLiters) : 0,
      total_stone_weight: round2(totalStoneWeight),
      total_sand_weight: round2(totalSandWeight),
      unread_notifications: unreadNotifications,
      low_stock_count: lowStocks.length,
      by_item_type: groupSum(enriched, 'item_type', 'quantity_liters'),
      by_destination: groupSum(enriched, 'destination_place', 'quantity_liters', 8),
      by_day: byDay,
      by_plate: byPlate,
      by_driver: byDriver,
      by_recorder: byRecorder,
      latest: enriched.slice(0, 10),
      stocks: stocks.map(mongoToPlain),
      low_stocks: lowStocks,
    },
  });
}));

router.get('/notifications', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const rows = await req.db.collection('notifications').find({}, { sort: { created_at: -1 }, limit: 80 }).toArray();
  jsonResponse(res, { success: true, data: rows.map(mongoToPlain) });
}));

router.patch('/notifications/:id/read', requireAuth, requireOwner, asyncHandler(async (req, res) => {
  const oid = oidOrNull(req.params.id);
  if (!oid) return jsonResponse(res, { success: false, message: 'รหัสแจ้งเตือนไม่ถูกต้อง' }, 400);
  await req.db.collection('notifications').updateOne({ _id: oid }, { $set: { is_read: 1, updated_at: nowIso() } });
  emitDataChanged('notifications', 'read', { id: String(oid) });
  jsonResponse(res, { success: true });
}));

app.use('/', router);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  jsonResponse(res, { success: false, message: err.message || 'เกิดข้อผิดพลาดในระบบ' }, status);
});

httpServer.listen(config.port, () => {
  console.log(`Sarawut Oil Management API exact-decimal-v21 running on port ${config.port}`);
});
