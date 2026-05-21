require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { put } = require('@vercel/blob');
const { extractEsp32FirmwareVersion } = require('./lib/espFirmwareVersion');
const { prepareFirmwareBinaryForRelease } = require('./lib/firmwareReleaseVersion');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((v) => v.trim()) : true,
  credentials: true,
}));

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const HARDWARE_API_URL = (process.env.HARDWARE_API_URL || 'https://eau-sure-api.vercel.app').replace(/\/$/, '');

if (!MONGO_URI) throw new Error('MONGO_URI missing');
if (!JWT_SECRET) throw new Error('JWT_SECRET missing');

let cached = global.mongooseAdminApi;
if (!cached) cached = global.mongooseAdminApi = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, default: null },
  googleId: { type: String, default: null },
  githubId: { type: String, default: null },
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  image: { type: String, default: '' },
  authProvider: { type: String, default: 'local' },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  adminNotes: { type: String, default: '' },
  lastLogin: { type: Date, default: null },
}, { timestamps: true, collection: 'users' });

const preRegistrationSchema = new mongoose.Schema({
  kind: { type: String, enum: ['gateway', 'node'], required: true, index: true },
  deviceId: { type: String, required: true, uppercase: true, trim: true, index: true },
  name: { type: String, default: '' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedByEmail: { type: String, required: true },
  deviceSecretHash: { type: String, required: true },
  upstreamStatus: { type: String, enum: ['queued', 'success', 'failed'], default: 'queued', index: true },
  upstreamMessage: { type: String, default: '' },
  upstreamPayload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true, collection: 'devicePreRegistrations' });

const firmwareReleaseSchema = new mongoose.Schema({
  platform: { type: String, enum: ['gateway', 'node'], required: true, index: true },
  version: { type: String, required: true, index: true },
  channel: { type: String, enum: ['stable', 'beta', 'canary'], default: 'stable', index: true },
  url: { type: String, required: true },
  md5: { type: String, required: true },
  size: { type: Number, required: true },
  notes: { type: String, default: '' },
  filename: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByEmail: { type: String, required: true },
}, { timestamps: true, collection: 'firmwareReleases' });

const User = mongoose.models.AdminApiUser || mongoose.model('AdminApiUser', userSchema);
const DevicePreRegistration = mongoose.models.DevicePreRegistration || mongoose.model('DevicePreRegistration', preRegistrationSchema);
const FirmwareRelease = mongoose.models.FirmwareRelease || mongoose.model('FirmwareRelease', firmwareReleaseSchema);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

function normalizePagination(query) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  return { page, limit };
}

function parseObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function pickString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDeviceId(kind, value) {
  const normalized = pickString(value).toUpperCase();
  if (!normalized) throw new Error(`${kind} id is required`);
  return normalized;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function hashBufferMd5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function normalizeFilename(value) {
  return String(value || 'firmware.bin')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildBlobPath({ platform, channel, version, filename }) {
  const safeVersion = normalizeFilename(version);
  const safeFilename = normalizeFilename(filename);
  return `firmwares/${platform}/${channel}/${safeVersion}/${Date.now()}-${safeFilename}`;
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name || '',
    role: user.role || 'user',
    status: user.status || 'active',
    authProvider: user.authProvider || 'local',
    lastLogin: user.lastLogin ? new Date(user.lastLogin).toISOString() : null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    adminNotes: user.adminNotes || '',
  };
}

function serializeFirmwareRelease(release) {
  return {
    id: String(release._id),
    platform: release.platform,
    version: release.version,
    channel: release.channel,
    url: release.url,
    md5: release.md5,
    size: release.size,
    notes: release.notes || '',
    filename: release.filename || '',
    status: release.status,
    createdByEmail: release.createdByEmail,
    createdAt: new Date(release.createdAt).toISOString(),
    updatedAt: new Date(release.updatedAt).toISOString(),
  };
}

async function resolveUserFromTokenPayload(decoded) {
  const candidates = [];
  if (decoded?.id) candidates.push({ _id: parseObjectId(decoded.id) });
  if (decoded?.userId) candidates.push({ _id: parseObjectId(decoded.userId) });
  if (decoded?.sub) candidates.push({ _id: parseObjectId(decoded.sub) });
  if (decoded?.email) candidates.push({ email: String(decoded.email).toLowerCase() });

  const queries = candidates.filter(Boolean).filter((query) => Object.values(query).every(Boolean));
  for (const query of queries) {
    const user = await User.findOne(query);
    if (user) return user;
  }
  return null;
}

async function authenticate(req, res, next) {
  try {
    await connectDB();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await resolveUserFromTokenPayload(decoded);
    if (!user) {
      return res.status(401).json({ error: 'Authenticated user not found' });
    }

    req.auth = { token, decoded, user };
    next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth?.user || req.auth.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  if (req.auth.user.status === 'suspended') {
    return res.status(403).json({ error: 'Admin account is suspended' });
  }
  next();
}

async function forwardToHardware(req, path, init) {
  const response = await fetch(`${HARDWARE_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers.authorization || '',
      ...(init?.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  return { status: response.status, ok: response.ok, payload };
}

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const role = pickString(req.query.role);
  const status = pickString(req.query.status);
  const search = pickString(req.query.search);
  const query = {};

  if (role) query.role = role;
  if (status) query.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { email: { $regex: escaped, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
    ];
  }

  const total = await User.countDocuments(query);
  const records = await User.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    users: records.map(sanitizeUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

app.patch('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = parseObjectId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const updates = {};
  if (['user', 'admin'].includes(req.body.role)) updates.role = req.body.role;
  if (['active', 'suspended'].includes(req.body.status)) updates.status = req.body.status;
  if (typeof req.body.adminNotes === 'string') updates.adminNotes = req.body.adminNotes.trim();

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid updates provided' });
  }

  const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true, user: sanitizeUser(updatedUser) });
});

async function handlePreRegister(req, res) {
  try {
    const kind = pickString(req.body.kind).toLowerCase();
    if (!['gateway', 'node'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be gateway or node' });
    }

    const id = normalizeDeviceId(kind, req.body.id);
    const deviceSecret = pickString(req.body.deviceSecret);
    if (deviceSecret.length < 32 || deviceSecret.length > 256) {
      return res.status(400).json({ error: 'deviceSecret length must be between 32 and 256' });
    }

    const name = pickString(req.body.name);
    const record = await DevicePreRegistration.create({
      kind,
      deviceId: id,
      name,
      requestedBy: req.auth.user._id,
      requestedByEmail: req.auth.user.email,
      deviceSecretHash: hashSecret(deviceSecret),
      upstreamStatus: 'queued',
    });

    const upstream = await forwardToHardware(req, '/api/registry/admin/pre-register', {
      method: 'POST',
      body: JSON.stringify({ kind, id, deviceSecret, ...(name ? { name } : {}) }),
    });

    record.upstreamStatus = upstream.ok ? 'success' : 'failed';
    record.upstreamMessage = pickString(upstream.payload?.message || upstream.payload?.error || '');
    record.upstreamPayload = upstream.payload;
    await record.save();

    res.status(upstream.ok ? 201 : upstream.status).json({
      success: upstream.ok,
      message: record.upstreamMessage || (upstream.ok ? 'Device pre-registered' : 'Pre-registration failed'),
      data: {
        id: String(record._id),
        kind: record.kind,
        deviceId: record.deviceId,
        name: record.name,
        upstreamStatus: record.upstreamStatus,
        upstreamPayload: record.upstreamPayload,
      },
    });
  } catch (error) {
    console.error('[POST /api/provisioning/pre-register]', error);
    res.status(500).json({ error: 'Failed to pre-register device' });
  }
}

app.post('/api/provisioning/pre-register', authenticate, requireAdmin, handlePreRegister);

app.get('/api/provisioning/pre-register', authenticate, requireAdmin, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const records = await DevicePreRegistration.find({})
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await DevicePreRegistration.countDocuments({});

  res.json({
    records: records.map((record) => ({
      id: String(record._id),
      kind: record.kind,
      deviceId: record.deviceId,
      name: record.name,
      requestedByEmail: record.requestedByEmail,
      upstreamStatus: record.upstreamStatus,
      upstreamMessage: record.upstreamMessage,
      createdAt: new Date(record.createdAt).toISOString(),
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

app.get('/api/fuota/releases', authenticate, requireAdmin, async (req, res) => {
  const query = {};
  const platform = pickString(req.query.platform);
  const channel = pickString(req.query.channel);
  const status = pickString(req.query.status);
  if (platform) query.platform = platform;
  if (channel) query.channel = channel;
  if (status) query.status = status;

  const releases = await FirmwareRelease.find(query).sort({ createdAt: -1 });
  res.json({
    releases: releases.map(serializeFirmwareRelease),
  });
});

app.post('/api/fuota/releases/inspect', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Firmware file is required' });
    }

    const platform = ['gateway', 'node'].includes(pickString(req.body.platform))
      ? pickString(req.body.platform)
      : 'node';
    const channel = pickString(req.body.channel || 'stable');

    const prepared = await prepareFirmwareBinaryForRelease({
      buffer: req.file.buffer,
      platform,
      channel,
      filename: req.file.originalname || '',
      submittedVersion: pickString(req.body.version),
      FirmwareRelease,
    });

    const sourceLabels = {
      binary: 'lue dans le .bin',
      filename: 'deduite du nom de fichier',
      'auto-bump': 'increment automatique',
      manual: 'saisie administrateur',
    };

    return res.json({
      success: true,
      version: prepared.version,
      detectedVersion: extractEsp32FirmwareVersion(req.file.buffer),
      versionSource: prepared.source,
      willPatchBinary: prepared.patched,
      md5: hashBufferMd5(prepared.buffer),
      size: prepared.buffer.length,
      filename: req.file.originalname || '',
      hint: `Version proposee : ${prepared.version} (${sourceLabels[prepared.source] || prepared.source}).`,
    });
  } catch (error) {
    console.error('[POST /api/fuota/releases/inspect]', error);
    return res.status(500).json({ error: 'Failed to inspect firmware binary' });
  }
});

app.post('/api/fuota/releases/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const platform = pickString(req.body.platform);
    let version = pickString(req.body.version);
    const channel = pickString(req.body.channel || 'stable');
    const notes = pickString(req.body.notes);
    const status = ['draft', 'active', 'archived'].includes(req.body.status) ? req.body.status : 'active';

    if (!['gateway', 'node'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Firmware file is required' });
    }

    const normalizedChannel = ['stable', 'beta', 'canary'].includes(channel) ? channel : 'stable';
    const prepared = await prepareFirmwareBinaryForRelease({
      buffer: req.file.buffer,
      platform,
      channel: normalizedChannel,
      filename: req.file.originalname || '',
      submittedVersion: version,
      FirmwareRelease,
    });

    version = prepared.version;
    const md5 = hashBufferMd5(prepared.buffer);
    const size = prepared.buffer.length;
    const filename = req.file.originalname || `${platform}-${version}.bin`;
    const blobPath = buildBlobPath({
      platform,
      channel: normalizedChannel,
      version,
      filename,
    });

    const blob = await put(blobPath, prepared.buffer, {
      access: 'public',
      contentType: req.file.mimetype || 'application/octet-stream',
      addRandomSuffix: false,
    });

    const release = await FirmwareRelease.create({
      platform,
      version,
      channel: normalizedChannel,
      url: blob.url,
      md5,
      size,
      notes,
      filename,
      status,
      createdBy: req.auth.user._id,
      createdByEmail: req.auth.user.email,
    });

    res.status(201).json({
      success: true,
      message: 'Firmware uploaded and release registered',
      version,
      versionSource: prepared.source,
      binaryPatched: prepared.patched,
      release: serializeFirmwareRelease(release),
    });
  } catch (error) {
    console.error('[POST /api/fuota/releases/upload]', error);
    res.status(500).json({ error: 'Failed to upload firmware release' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 4004);
  connectDB()
    .then(() => {
      app.listen(port, () => {
        console.log(`EauSure Admin API listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start admin API', error);
      process.exit(1);
    });
}

module.exports = app;
