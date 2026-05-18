require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((v) => v.trim()) : true,
  credentials: true,
}));

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const HARDWARE_API_URL = (process.env.HARDWARE_API_URL || 'https://eau-sure-api.vercel.app').replace(/\/$/, '');
const STATS_MIN_GROUP_SIZE = Number(process.env.STATS_MIN_GROUP_SIZE || 5);
const STATS_COUNT_ROUNDING = Number(process.env.STATS_COUNT_ROUNDING || 5);
const STATS_PERCENT_ROUNDING = Number(process.env.STATS_PERCENT_ROUNDING || 5);

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

const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  category: { type: String, enum: ['bug', 'device', 'gateway', 'alert', 'other'], required: true, index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true, index: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  adminNote: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'supportTickets' });

const chatSchema = new mongoose.Schema({
  ticketId: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'active', 'suspended', 'ended'], default: 'waiting', index: true },
  reason: { type: String, required: true },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  suspendedBy: { type: String, default: null },
  operatorTyping: { type: Date, default: null },
  adminTyping: { type: Date, default: null },
  messages: {
    type: [{
      role: { type: String, enum: ['user', 'admin'], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, required: true },
    }],
    default: [],
  },
}, { timestamps: true, collection: 'supportChats' });

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

const firmwareDeploymentSchema = new mongoose.Schema({
  releaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FirmwareRelease', default: null, index: true },
  targetType: { type: String, enum: ['gateway', 'node'], required: true, index: true },
  gatewayId: { type: String, required: true, index: true },
  nodeId: { type: String, default: null, index: true },
  version: { type: String, required: true },
  url: { type: String, required: true },
  md5: { type: String, required: true },
  size: { type: Number, required: true },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'dispatched', 'failed'], default: 'queued', index: true },
  upstreamStatusCode: { type: Number, default: null },
  upstreamResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByEmail: { type: String, required: true },
}, { timestamps: true, collection: 'firmwareDeployments' });

const statsSnapshotSchema = new mongoose.Schema({
  scope: { type: String, default: 'overview', index: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  generatedByEmail: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true, collection: 'statsSnapshots' });

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { collection: 'supportCounters' });

const User = mongoose.models.AdminApiUser || mongoose.model('AdminApiUser', userSchema);
const Ticket = mongoose.models.AdminApiTicket || mongoose.model('AdminApiTicket', ticketSchema);
const Chat = mongoose.models.AdminApiChat || mongoose.model('AdminApiChat', chatSchema);
const DevicePreRegistration = mongoose.models.DevicePreRegistration || mongoose.model('DevicePreRegistration', preRegistrationSchema);
const FirmwareRelease = mongoose.models.FirmwareRelease || mongoose.model('FirmwareRelease', firmwareReleaseSchema);
const FirmwareDeployment = mongoose.models.FirmwareDeployment || mongoose.model('FirmwareDeployment', firmwareDeploymentSchema);
const StatsSnapshot = mongoose.models.StatsSnapshot || mongoose.model('StatsSnapshot', statsSnapshotSchema);
const Counter = mongoose.models.SupportCounter || mongoose.model('SupportCounter', counterSchema);

function buildTicketId(sequence) {
  return `TKT-${String(sequence).padStart(5, '0')}`;
}

function normalizePagination(query) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  return { page, limit };
}

function parseObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
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

function serializeTicket(ticket, includeAdminNote) {
  const payload = {
    _id: String(ticket._id),
    ticketId: ticket.ticketId,
    userId: String(ticket.userId),
    userEmail: ticket.userEmail,
    userName: ticket.userName,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    title: ticket.title,
    description: ticket.description,
    resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt).toISOString() : null,
    createdAt: new Date(ticket.createdAt).toISOString(),
    updatedAt: new Date(ticket.updatedAt).toISOString(),
  };
  if (includeAdminNote) payload.adminNote = ticket.adminNote || '';
  return payload;
}

function serializeChat(chat) {
  if (!chat) {
    return null;
  }

  return {
    _id: String(chat._id),
    userId: String(chat.userId),
    userEmail: chat.userEmail,
    status: chat.status,
    reason: chat.reason,
    startedAt: chat.startedAt ? new Date(chat.startedAt).toISOString() : null,
    endedAt: chat.endedAt ? new Date(chat.endedAt).toISOString() : null,
    suspendedBy: chat.suspendedBy || null,
    messages: (chat.messages || []).map((message) => ({
      role: message.role,
      text: message.text,
      timestamp: new Date(message.timestamp).toISOString(),
    })),
    createdAt: new Date(chat.createdAt).toISOString(),
    updatedAt: chat.updatedAt ? new Date(chat.updatedAt).toISOString() : null,
  };
}

function roundCount(value) {
  if (!value) return 0;
  return Math.max(STATS_COUNT_ROUNDING, Math.round(value / STATS_COUNT_ROUNDING) * STATS_COUNT_ROUNDING);
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value / STATS_PERCENT_ROUNDING) * STATS_PERCENT_ROUNDING));
}

function visibleCount(value) {
  return value >= STATS_MIN_GROUP_SIZE ? roundCount(value) : null;
}

function buildSafeDistribution(entries, total) {
  return entries
    .map((entry) => ({
      key: entry.key,
      count: visibleCount(entry.count),
      percentage: entry.count >= STATS_MIN_GROUP_SIZE && total > 0
        ? roundPercent((entry.count / total) * 100)
        : null,
    }))
    .filter((entry) => entry.count !== null);
}

async function nextSequence(key) {
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
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
  } catch (error) {
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

function requireActiveUser(req, res, next) {
  if (req.auth?.user?.status === 'suspended') {
    return res.status(403).json({ error: 'User is suspended' });
  }
  next();
}

function pickString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDeviceId(kind, value) {
  const normalized = pickString(value).toUpperCase();
  if (!normalized) throw new Error(`${kind} id is required`);
  return normalized;
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

async function loadSupportOverviewData() {
  const [totalUsers, totalTickets, totalChats, openTickets, waitingChats, activeChats, releases, deploymentsLast30d] = await Promise.all([
    User.countDocuments({}),
    Ticket.countDocuments({}),
    Chat.countDocuments({}),
    Ticket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Chat.countDocuments({ status: 'waiting' }),
    Chat.countDocuments({ status: { $in: ['active', 'suspended'] } }),
    FirmwareRelease.countDocuments({ status: 'active' }),
    FirmwareDeployment.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
  ]);

  const [userRoleAgg, ticketPriorityAgg, deploymentStatusAgg] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    FirmwareDeployment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return {
    metrics: {
      totalUsers: roundCount(totalUsers),
      totalTickets: roundCount(totalTickets),
      totalChats: roundCount(totalChats),
      openTickets: roundCount(openTickets),
      waitingChats: roundCount(waitingChats),
      activeChats: roundCount(activeChats),
      activeReleases: roundCount(releases),
      deploymentsLast30d: roundCount(deploymentsLast30d),
    },
    distributions: {
      userRoles: buildSafeDistribution(userRoleAgg.map((row) => ({ key: row._id || 'unknown', count: row.count })), totalUsers),
      ticketPriorities: buildSafeDistribution(ticketPriorityAgg.map((row) => ({ key: row._id || 'unknown', count: row.count })), totalTickets),
      deploymentStatuses: buildSafeDistribution(deploymentStatusAgg.map((row) => ({ key: row._id || 'unknown', count: row.count })), Math.max(1, deploymentsLast30d)),
    },
    privacy: {
      minGroupSize: STATS_MIN_GROUP_SIZE,
      countRounding: STATS_COUNT_ROUNDING,
      percentRounding: STATS_PERCENT_ROUNDING,
      note: 'No raw identifiers or support message contents are exposed in analytics.',
    },
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    await connectDB();
    res.json({
      ok: true,
      service: 'eausure-admin-api',
      hardwareApiUrl: HARDWARE_API_URL,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

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
app.post('/api/registry/admin/pre-register', authenticate, requireAdmin, handlePreRegister);

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

app.post('/api/tickets', authenticate, requireActiveUser, async (req, res) => {
  const title = pickString(req.body.title);
  const description = pickString(req.body.description);
  const category = pickString(req.body.category);
  const priority = pickString(req.body.priority);

  if (title.length < 5 || description.length < 20) {
    return res.status(400).json({ error: 'title or description too short' });
  }
  if (!['bug', 'device', 'gateway', 'alert', 'other'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  const seq = await nextSequence('ticketId');
  const ticket = await Ticket.create({
    ticketId: buildTicketId(seq),
    userId: req.auth.user._id,
    userEmail: req.auth.user.email,
    userName: req.auth.user.name || req.auth.user.email,
    category,
    priority,
    status: 'open',
    title,
    description,
  });

  res.status(201).json(serializeTicket(ticket, req.auth.user.role === 'admin'));
});

app.get('/api/tickets', authenticate, requireAdmin, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const search = pickString(req.query.search);
  const query = {};
  const status = pickString(req.query.status);
  const category = pickString(req.query.category);
  const priority = pickString(req.query.priority);

  if (status) query.status = status;
  if (category) query.category = category;
  if (priority) query.priority = priority;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { ticketId: { $regex: escaped, $options: 'i' } },
    ];
  }

  const total = await Ticket.countDocuments(query);
  const records = await Ticket.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    tickets: records.map((ticket) => serializeTicket(ticket, true)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
      count: records.length,
    },
  });
});

app.get('/api/tickets/mine', authenticate, requireActiveUser, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const total = await Ticket.countDocuments({ userId: req.auth.user._id });
  const records = await Ticket.find({ userId: req.auth.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    tickets: records.map((ticket) => serializeTicket(ticket, false)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
      count: records.length,
    },
  });
});

app.patch('/api/tickets/:id', authenticate, requireAdmin, async (req, res) => {
  const ticketId = parseObjectId(req.params.id);
  if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id' });

  const updates = {};
  if (['open', 'in_progress', 'resolved', 'closed'].includes(req.body.status)) {
    updates.status = req.body.status;
    updates.resolvedAt = ['resolved', 'closed'].includes(req.body.status) ? new Date() : null;
  }
  if (typeof req.body.adminNote === 'string') {
    updates.adminNote = req.body.adminNote.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid updates provided' });
  }

  const ticket = await Ticket.findByIdAndUpdate(ticketId, { $set: updates }, { new: true });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(serializeTicket(ticket, true));
});

app.delete('/api/tickets/:id', authenticate, requireAdmin, async (req, res) => {
  const ticketId = parseObjectId(req.params.id);
  if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id' });

  const result = await Ticket.deleteOne({ _id: ticketId });
  if (!result.deletedCount) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true });
});

app.post('/api/chat/request', authenticate, requireActiveUser, async (req, res) => {
  const reason = pickString(req.body.reason);
  if (reason.length < 3) {
    return res.status(400).json({ error: 'reason too short' });
  }

  const existing = await Chat.findOne({ userId: req.auth.user._id, status: { $in: ['waiting', 'active', 'suspended'] } });
  if (existing) {
    return res.status(409).json({ error: 'An active support chat already exists', chat: serializeChat(existing) });
  }

  const chat = await Chat.create({
    userId: req.auth.user._id,
    userEmail: req.auth.user.email,
    status: 'waiting',
    reason,
    messages: [],
  });

  res.status(201).json({ chat: serializeChat(chat) });
});

app.get('/api/chat/mine', authenticate, requireActiveUser, async (req, res) => {
  const chat = await Chat.findOne({ userId: req.auth.user._id }).sort({ updatedAt: -1 });
  res.json({ chat: serializeChat(chat) });
});

app.get('/api/chat/waiting', authenticate, requireAdmin, async (_req, res) => {
  const waitingChats = await Chat.find({ status: 'waiting' }).sort({ createdAt: 1 });
  const userIds = waitingChats.map((chat) => chat.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const now = Date.now();

  res.json({
    waitingUsers: waitingChats.map((chat) => {
      const user = userById.get(String(chat.userId));
      return {
        userId: String(chat.userId),
        name: user?.name || chat.userEmail,
        email: user?.email || chat.userEmail,
        phone: user?.phone || '',
        address: '',
        nodeCount: null,
        accountStatus: user?.status || 'active',
        reason: chat.reason,
        status: chat.status,
        createdAt: new Date(chat.createdAt).toISOString(),
        waitTimeSeconds: Math.max(0, Math.floor((now - new Date(chat.createdAt).getTime()) / 1000)),
      };
    }),
  });
});

app.get('/api/chat/active', authenticate, requireAdmin, async (req, res) => {
  const selectedUserId = pickString(req.query.userId);
  let chat = null;

  if (selectedUserId) {
    const objectId = parseObjectId(selectedUserId);
    if (!objectId) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    chat = await Chat.findOne({ userId: objectId });
  } else {
    chat = await Chat.findOne({ status: { $in: ['active', 'suspended'] } }).sort({ updatedAt: -1, startedAt: -1 });
  }

  if (!chat) {
    return res.json({ chat: null, user: null });
  }

  const user = await User.findById(chat.userId);
  res.json({
    chat: serializeChat(chat),
    user: user ? {
      userId: String(user._id),
      name: user.name || user.email,
      email: user.email,
      phone: user.phone || '',
      address: '',
      nodeCount: null,
      accountStatus: user.status || 'active',
    } : null,
  });
});

app.get('/api/chat/admin', authenticate, requireAdmin, async (req, res) => {
  const chatDocs = await Chat.find({}).sort({ updatedAt: -1 });
  const userIds = Array.from(new Set(chatDocs.map((chat) => String(chat.userId))));
  const users = await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const conversations = chatDocs.map((chat) => {
    const user = userById.get(String(chat.userId));
    const lastMessage = chat.messages[chat.messages.length - 1] || null;
    return {
      userId: String(chat.userId),
      userName: user?.name || chat.userEmail,
      userEmail: user?.email || chat.userEmail,
      lastMessage: lastMessage?.text || '',
      lastMessageAt: lastMessage ? new Date(lastMessage.timestamp).toISOString() : null,
      messageCount: chat.messages.length,
    };
  });

  const selectedUserId = pickString(req.query.userId);
  if (!selectedUserId) {
    return res.json({ conversations });
  }

  const objectId = parseObjectId(selectedUserId);
  if (!objectId) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const selectedChat = await Chat.findOne({ userId: objectId });
  const selectedUser = await User.findById(objectId);
  res.json({
    conversations,
    selectedConversation: {
      userId: selectedUserId,
      userName: selectedUser?.name || selectedChat?.userEmail || 'Unknown User',
      userEmail: selectedUser?.email || selectedChat?.userEmail || '',
      messages: (selectedChat?.messages || []).map((message) => ({
        role: message.role,
        text: message.text,
        timestamp: new Date(message.timestamp).toISOString(),
      })),
    },
  });
});

app.post('/api/chat/accept', authenticate, requireAdmin, async (req, res) => {
  const userId = parseObjectId(req.body.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  const chat = await Chat.findOne({ userId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (chat.status !== 'waiting') return res.status(409).json({ error: 'Chat is not waiting' });

  chat.status = 'active';
  chat.startedAt = new Date();
  chat.endedAt = null;
  chat.suspendedBy = null;
  await chat.save();
  res.json({ chat: serializeChat(chat) });
});

app.post('/api/chat/moderate', authenticate, requireAdmin, async (req, res) => {
  const userId = parseObjectId(req.body.userId);
  const action = pickString(req.body.action);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  if (!['suspend', 'resume', 'end'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const chat = await Chat.findOne({ userId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  if (action === 'suspend') {
    chat.status = 'suspended';
    chat.suspendedBy = req.auth.user.name || req.auth.user.email;
  }
  if (action === 'resume') {
    chat.status = 'active';
    chat.suspendedBy = null;
    if (!chat.startedAt) chat.startedAt = new Date();
  }
  if (action === 'end') {
    chat.status = 'ended';
    chat.suspendedBy = null;
    chat.endedAt = new Date();
  }

  await chat.save();
  res.json({ chat: serializeChat(chat) });
});

app.post('/api/chat/send', authenticate, requireActiveUser, async (req, res) => {
  const text = pickString(req.body.text);
  if (!text) return res.status(400).json({ error: 'text is required' });

  const isAdmin = req.auth.user.role === 'admin';
  const targetUserId = isAdmin ? parseObjectId(req.body.userId) : req.auth.user._id;
  if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });

  const chat = await Chat.findOne({ userId: targetUserId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!['active', 'suspended', 'waiting'].includes(chat.status)) {
    return res.status(409).json({ error: 'Chat is not active' });
  }

  chat.messages.push({
    role: isAdmin ? 'admin' : 'user',
    text,
    timestamp: new Date(),
  });
  chat.updatedAt = new Date();
  chat.adminTyping = isAdmin ? null : chat.adminTyping;
  chat.operatorTyping = isAdmin ? chat.operatorTyping : null;
  await chat.save();
  res.json(serializeChat(chat));
});

app.post('/api/chat/typing', authenticate, requireActiveUser, async (req, res) => {
  const isAdmin = req.auth.user.role === 'admin';
  const targetUserId = isAdmin ? parseObjectId(req.body.userId) : req.auth.user._id;
  if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });

  const chat = await Chat.findOne({ userId: targetUserId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  if (isAdmin) chat.adminTyping = new Date();
  else chat.operatorTyping = new Date();
  await chat.save();
  res.json({ ok: true });
});

app.post('/api/chat/reply', authenticate, requireAdmin, async (req, res) => {
  const userId = parseObjectId(req.body.userId);
  const text = pickString(req.body.text);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  if (!text) return res.status(400).json({ error: 'text is required' });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let chat = await Chat.findOne({ userId });
  if (!chat) {
    chat = await Chat.create({
      userId,
      userEmail: user.email,
      reason: 'Admin initiated support follow-up',
      status: 'active',
      startedAt: new Date(),
      messages: [],
    });
  }

  chat.messages.push({
    role: 'admin',
    text,
    timestamp: new Date(),
  });
  chat.status = chat.status === 'ended' ? 'active' : chat.status;
  chat.adminTyping = null;
  await chat.save();
  res.json({
    chatId: String(chat._id),
    messages: chat.messages.map((message) => ({
      role: message.role,
      text: message.text,
      timestamp: new Date(message.timestamp).toISOString(),
    })),
    createdAt: new Date(chat.createdAt).toISOString(),
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
    releases: releases.map((release) => ({
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
    })),
  });
});

app.get('/api/fuota/releases/:id', authenticate, requireAdmin, async (req, res) => {
  const releaseId = parseObjectId(req.params.id);
  if (!releaseId) return res.status(400).json({ error: 'Invalid release id' });

  const release = await FirmwareRelease.findById(releaseId);
  if (!release) return res.status(404).json({ error: 'Release not found' });

  res.json({
    release: {
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
    },
  });
});

app.post('/api/fuota/releases', authenticate, requireAdmin, async (req, res) => {
  const platform = pickString(req.body.platform);
  const version = pickString(req.body.version);
  const channel = pickString(req.body.channel || 'stable');
  const url = pickString(req.body.url);
  const md5 = pickString(req.body.md5);
  const size = Number(req.body.size);

  if (!['gateway', 'node'].includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
  if (!version || !url || !md5 || !Number.isFinite(size) || size <= 0) {
    return res.status(400).json({ error: 'Invalid release payload' });
  }

  const release = await FirmwareRelease.create({
    platform,
    version,
    channel: ['stable', 'beta', 'canary'].includes(channel) ? channel : 'stable',
    url,
    md5,
    size,
    notes: pickString(req.body.notes),
    filename: pickString(req.body.filename),
    status: ['draft', 'active', 'archived'].includes(req.body.status) ? req.body.status : 'active',
    createdBy: req.auth.user._id,
    createdByEmail: req.auth.user.email,
  });

  res.status(201).json({
    success: true,
    release: {
      id: String(release._id),
      platform: release.platform,
      version: release.version,
      channel: release.channel,
      url: release.url,
      md5: release.md5,
      size: release.size,
      status: release.status,
      notes: release.notes,
      filename: release.filename,
    },
  });
});

app.patch('/api/fuota/releases/:id', authenticate, requireAdmin, async (req, res) => {
  const releaseId = parseObjectId(req.params.id);
  if (!releaseId) return res.status(400).json({ error: 'Invalid release id' });

  const updates = {};
  ['version', 'url', 'md5', 'notes', 'filename'].forEach((key) => {
    if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim();
  });
  if (['stable', 'beta', 'canary'].includes(req.body.channel)) updates.channel = req.body.channel;
  if (['draft', 'active', 'archived'].includes(req.body.status)) updates.status = req.body.status;
  if (Number.isFinite(Number(req.body.size)) && Number(req.body.size) > 0) updates.size = Number(req.body.size);

  const release = await FirmwareRelease.findByIdAndUpdate(releaseId, { $set: updates }, { new: true });
  if (!release) return res.status(404).json({ error: 'Release not found' });
  res.json({ success: true, release });
});

app.get('/api/fuota/deployments', authenticate, requireAdmin, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const records = await FirmwareDeployment.find({})
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await FirmwareDeployment.countDocuments({});

  res.json({
    deployments: records.map((record) => ({
      id: String(record._id),
      releaseId: record.releaseId ? String(record.releaseId) : null,
      targetType: record.targetType,
      gatewayId: record.gatewayId,
      nodeId: record.nodeId,
      version: record.version,
      status: record.status,
      requestedByEmail: record.requestedByEmail,
      upstreamStatusCode: record.upstreamStatusCode,
      createdAt: new Date(record.createdAt).toISOString(),
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

app.post('/api/fuota/deploy', authenticate, requireAdmin, async (req, res) => {
  const targetType = pickString(req.body.targetType);
  const gatewayId = pickString(req.body.gatewayId);
  const nodeId = pickString(req.body.nodeId).toUpperCase() || null;
  const releaseId = parseObjectId(req.body.releaseId);

  if (!['gateway', 'node'].includes(targetType)) {
    return res.status(400).json({ error: 'targetType must be gateway or node' });
  }
  if (!gatewayId) {
    return res.status(400).json({ error: 'gatewayId is required' });
  }
  if (targetType === 'node' && !nodeId) {
    return res.status(400).json({ error: 'nodeId is required for node deployment' });
  }

  let release = null;
  if (releaseId) {
    release = await FirmwareRelease.findById(releaseId);
    if (!release) return res.status(404).json({ error: 'Release not found' });
  }

  const payload = {
    url: release?.url || pickString(req.body.url),
    version: release?.version || pickString(req.body.version),
    md5: release?.md5 || pickString(req.body.md5),
    size: release?.size || Number(req.body.size),
  };

  if (!payload.url || !payload.version || !payload.md5 || !Number.isFinite(Number(payload.size)) || Number(payload.size) <= 0) {
    return res.status(400).json({ error: 'Invalid deployment payload' });
  }

  const deployment = await FirmwareDeployment.create({
    releaseId: release?._id || null,
    targetType,
    gatewayId,
    nodeId,
    version: payload.version,
    url: payload.url,
    md5: payload.md5,
    size: Number(payload.size),
    notes: release?.notes || pickString(req.body.notes),
    status: 'queued',
    requestedBy: req.auth.user._id,
    requestedByEmail: req.auth.user.email,
  });

  const route = targetType === 'gateway'
    ? `/api/gateways/${encodeURIComponent(gatewayId)}/firmware-update`
    : `/api/gateways/${encodeURIComponent(gatewayId)}/nodes/${encodeURIComponent(nodeId)}/firmware-update`;

  const upstream = await forwardToHardware(req, route, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  deployment.status = upstream.ok ? 'dispatched' : 'failed';
  deployment.upstreamStatusCode = upstream.status;
  deployment.upstreamResponse = upstream.payload;
  await deployment.save();

  res.status(upstream.ok ? 202 : upstream.status).json({
    success: upstream.ok,
    message: upstream.payload?.message || (upstream.ok ? 'Firmware deployment queued' : 'Firmware deployment failed'),
    deployment: {
      id: String(deployment._id),
      targetType: deployment.targetType,
      gatewayId: deployment.gatewayId,
      nodeId: deployment.nodeId,
      version: deployment.version,
      status: deployment.status,
    },
    upstream: upstream.payload,
  });
});

app.get('/api/stats/overview', authenticate, requireAdmin, async (_req, res) => {
  const payload = await loadSupportOverviewData();
  res.json(payload);
});

app.post('/api/stats/snapshots/collect', authenticate, requireAdmin, async (req, res) => {
  const payload = await loadSupportOverviewData();
  const snapshot = await StatsSnapshot.create({
    scope: pickString(req.body.scope || 'overview'),
    generatedBy: req.auth.user._id,
    generatedByEmail: req.auth.user.email,
    payload,
  });

  res.status(201).json({
    success: true,
    snapshot: {
      id: String(snapshot._id),
      scope: snapshot.scope,
      createdAt: new Date(snapshot.createdAt).toISOString(),
      payload: snapshot.payload,
    },
  });
});

app.get('/api/stats/snapshots', authenticate, requireAdmin, async (req, res) => {
  const { page, limit } = normalizePagination(req.query);
  const records = await StatsSnapshot.find({})
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await StatsSnapshot.countDocuments({});

  res.json({
    snapshots: records.map((record) => ({
      id: String(record._id),
      scope: record.scope,
      generatedByEmail: record.generatedByEmail,
      createdAt: new Date(record.createdAt).toISOString(),
      payload: record.payload,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
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
