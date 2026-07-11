// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// ------------------------------
// 0) LOGGING HELPERS
// ------------------------------
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // debug | info | warn | error
const levelRank = { debug: 10, info: 20, warn: 30, error: 40 };

function log(level, reqId, msg, obj) {
  if (levelRank[level] < levelRank[LOG_LEVEL]) return;
  const base = `[${new Date().toISOString()}] [${level.toUpperCase()}] [rid:${reqId}] ${msg}`;
  if (obj !== undefined) console.log(base, obj);
  else console.log(base);
}

function maskToken(token) {
  if (!token || token.length < 16) return '***';
  return token.slice(0, 8) + '...' + token.slice(-6);
}

function safeHeaders(headers) {
  // avoid leaking secrets
  const h = { ...headers };
  if (h.authorization) h.authorization = maskToken(h.authorization);
  if (h.cookie) h.cookie = '***';
  return h;
}

function getReqId(req) {
  return req.headers['x-request-id'] || crypto.randomUUID();
}

// Request logger + duration
app.use((req, res, next) => {
  req.reqId = getReqId(req);
  req._startAt = Date.now();

  log('info', req.reqId, `➡️ ${req.method} ${req.originalUrl}`, {
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    ua: req.headers['user-agent'],
    headers: safeHeaders(req.headers),
  });

  res.on('finish', () => {
    const ms = Date.now() - req._startAt;
    log('info', req.reqId, `⬅️ ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });

  next();
});

// ------------------------------
// 1) MONGODB CONFIGURATION
// ------------------------------
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) throw new Error("❌ MONGO_URI missing");
if (!JWT_SECRET) throw new Error("❌ JWT_SECRET missing");

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB(reqId) {
  if (cached.conn) {
    log('debug', reqId, '🟢 DB already connected (cached.conn)');
    return cached.conn;
  }

  if (!cached.promise) {
    log('info', reqId, '🟡 DB connecting...', {
      mongoUriHint: MONGO_URI.replace(/\/\/.*@/, '//***@') // hide creds
    });

    cached.promise = mongoose
      .connect(MONGO_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
      })
      .then((m) => {
        log('info', reqId, '🟢 DB connected');
        return m;
      })
      .catch((err) => {
        log('error', reqId, '🔴 DB connect failed', {
          name: err.name,
          message: err.message,
          code: err.code,
        });
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// ------------------------------
// 2) SCHEMAS
// ------------------------------

// UPDATED: Complete schema with all settings fields
const UserProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // email or auth ID
    bio: { type: String, default: "" },
    organization: { type: String, default: "" },
    role: { type: String, default: "" },
    phone: { type: String, default: "" },
    timezone: { type: String, default: "Africa/Tunis" },
    preferences: {
      // Theme preferences
      theme: { 
        type: String, 
        enum: ['light', 'dark', 'auto'], 
        default: 'auto' 
      },
      
      // Notifications - matching your JSON structure
      notifications: {
        push: { type: Boolean, default: true },
        fall_detection: { type: Boolean, default: true },
        emailAlerts: { type: Boolean, default: true },
        criticalOnly: { type: Boolean, default: false },
        dailySummary: { type: Boolean, default: true },
        maintenanceReminders: { type: Boolean, default: true }
      },
      
      // Units - complete with both temperature and distance
      units: {
        temperature: { 
          type: String, 
          enum: ['celsius', 'fahrenheit'], 
          default: 'celsius' 
        },
        distance: { 
          type: String, 
          enum: ['metric', 'imperial'], 
          default: 'metric' 
        }
      },
      
      // Security settings
      security: {
        biometric: { type: Boolean, default: false },
        twoFactor: { type: Boolean, default: false }
      },
      
      // Language
      language: { 
        type: String, 
        enum: ['en', 'fr', 'ar'], 
        default: "en" 
      }
    }
  },
  {
    timestamps: true,
    collection: 'userProfiles'
  }
);

UserProfileSchema.index({ userId: 1 }, { unique: true });

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    avatar: { type: String, default: "" },
    image: { type: String, default: "" },
    organization: { type: String, default: "" },
    phone: { type: String, default: "" },
    role: { type: String, default: "user" },
    isProfileComplete: { type: Boolean, default: false },
    lastLogin: { type: Date }
  },
  { timestamps: true, collection: "users" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', UserProfileSchema);

// ------------------------------
// 3) AUTH MIDDLEWARE (DETAILED)
// ------------------------------
const authenticateToken = (req, res, next) => {
  const reqId = req.reqId;

  const auth = req.headers['authorization'];
  const token = auth?.startsWith('Bearer ') ? auth.split(' ')[1] : null;

  if (!token) {
    log('warn', reqId, '🔒 Token missing');
    return res.status(401).json({ message: 'Token missing' });
  }

  log('debug', reqId, '🔐 Token received', { token: maskToken(token) });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      log('warn', reqId, '⛔ Token invalid', { name: err.name, message: err.message });
      return res.status(403).json({ message: 'Token invalid' });
    }

    // Log decoded payload (safe)
    log('debug', reqId, '✅ Token decoded', {
      keys: Object.keys(decoded || {}),
      decoded,
    });

    // identify
    req.userIdentifier = decoded.email || decoded.id || decoded.userId || decoded.sub;

    if (!req.userIdentifier) {
      log('error', reqId, '❌ Invalid token payload: missing identifier', { decoded });
      return res.status(400).json({ message: 'Invalid token payload' });
    }

    log('info', reqId, '👤 userIdentifier resolved', { userIdentifier: req.userIdentifier });

    next();
  });
};

// ------------------------------
// 4) ROUTES
// ------------------------------

// GET: merged user + profile with complete preferences
app.get('/api/me', authenticateToken, async (req, res) => {
  const reqId = req.reqId;
  await connectDB(reqId);

  try {
    const identifier = req.userIdentifier;

    log('info', reqId, '🧠 /api/me start', { identifier });

    // Try by email first
    let user = await User.findOne({ email: identifier }).lean();
    log('debug', reqId, '🔍 User findOne(email)', { identifier, found: !!user });

    // Fallback: identifier might be mongo _id
    if (!user && mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier).lean();
      log('debug', reqId, '🔍 User findById fallback', { identifier, found: !!user });
    }

    if (!user) {
      log('warn', reqId, '❌ User not found in users collection', { identifier });
      return res.status(404).json({ message: "User not found", identifierUsed: identifier });
    }

    const userKey = user.email; // normalize profiles by email
    log('info', reqId, '✅ User resolved', { email: userKey, userId: user._id });

    // profile fetch/create
    let profile = await UserProfile.findOne({ userId: userKey }).lean();
    log('debug', reqId, '🔎 UserProfile findOne', { userId: userKey, found: !!profile });

    if (!profile) {
      log('warn', reqId, '🆕 Profile missing -> create', { userId: userKey });
      profile = await UserProfile.create({ userId: userKey });
      profile = profile.toObject();
    }

    // MERGE with complete preferences structure
    const merged = {
      email: user.email,
      name: user.name || "",
      avatar: user.avatar || user.image || "",
      image: user.image || user.avatar || "",
      organization: user.organization || profile.organization || "",
      phone: user.phone || profile.phone || "",
      timezone: profile.timezone || "Africa/Tunis",
      preferences: {
        theme: profile.preferences?.theme || 'auto',
        language: profile.preferences?.language || 'en',
        notifications: {
          push: profile.preferences?.notifications?.push ?? true,
          emailAlerts: profile.preferences?.notifications?.emailAlerts ?? true,
          criticalOnly: profile.preferences?.notifications?.criticalOnly ?? false,
          fall_detection: profile.preferences?.notifications?.fall_detection ?? true,
          dailySummary: profile.preferences?.notifications?.dailySummary ?? true,
          maintenanceReminders: profile.preferences?.notifications?.maintenanceReminders ?? true,
        },
        units: {
          temperature: profile.preferences?.units?.temperature || 'celsius',
          distance: profile.preferences?.units?.distance || 'metric',
        },
        security: {
          biometric: profile.preferences?.security?.biometric ?? false,
          twoFactor: profile.preferences?.security?.twoFactor ?? false,
        }
      }
    };

    log('info', reqId, '✅ /api/me success', {
      email: merged.email,
      hasProfile: true,
      theme: merged.preferences.theme,
      prefsKeys: Object.keys(merged.preferences || {}),
      notifKeys: Object.keys(merged.preferences?.notifications || {}),
      unitsKeys: Object.keys(merged.preferences?.units || {}),
    });

    return res.json(merged);
  } catch (error) {
    log('error', req.reqId, '🔴 /api/me failed', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: error.message });
  }
});

// PUT: update user + profile (merged) with complete preferences support
app.put('/api/me', authenticateToken, async (req, res) => {
  const reqId = req.reqId;
  await connectDB(reqId);

  try {
    const identifier = req.userIdentifier;

    log('info', reqId, '🧠 /api/me PUT start', {
      identifier,
      bodyKeys: Object.keys(req.body || {}),
      body: req.body, // remove if too noisy
    });

    // Resolve user first (email or _id)
    let userDoc = await User.findOne({ email: identifier }).lean();
    if (!userDoc && mongoose.Types.ObjectId.isValid(identifier)) {
      userDoc = await User.findById(identifier).lean();
    }
    if (!userDoc) {
      log('warn', reqId, '❌ User not found for update', { identifier });
      return res.status(404).json({ message: "User not found", identifierUsed: identifier });
    }

    const email = userDoc.email;
    log('info', reqId, '✅ User for update resolved', { email, userId: userDoc._id });

    // Allowed updates for users collection
    const userUpdates = {};
    if (typeof req.body.name === "string") userUpdates.name = req.body.name;
    if (typeof req.body.avatar === "string") userUpdates.avatar = req.body.avatar;
    if (typeof req.body.image === "string") userUpdates.image = req.body.image;
    if (typeof req.body.organization === "string") userUpdates.organization = req.body.organization;
    if (typeof req.body.phone === "string") userUpdates.phone = req.body.phone;

    // Allowed updates for userProfiles collection
    const profileUpdates = {};
    if (typeof req.body.timezone === "string") profileUpdates.timezone = req.body.timezone;
    
    // Handle complete preferences object
    if (req.body.preferences && typeof req.body.preferences === "object") {
      const prefs = req.body.preferences;
      
      // Theme
      if (prefs.theme && ['light', 'dark', 'auto'].includes(prefs.theme)) {
        profileUpdates['preferences.theme'] = prefs.theme;
      }
      
      // Language
      if (prefs.language && ['en', 'fr', 'ar'].includes(prefs.language)) {
        profileUpdates['preferences.language'] = prefs.language;
      }
      
      // Notifications
      if (prefs.notifications && typeof prefs.notifications === "object") {
        const notifs = prefs.notifications;
        if (typeof notifs.push === 'boolean') 
          profileUpdates['preferences.notifications.push'] = notifs.push;
        if (typeof notifs.emailAlerts === 'boolean') 
          profileUpdates['preferences.notifications.emailAlerts'] = notifs.emailAlerts;
        if (typeof notifs.criticalOnly === 'boolean') 
          profileUpdates['preferences.notifications.criticalOnly'] = notifs.criticalOnly;
        if (typeof notifs.fall_detection === 'boolean') 
          profileUpdates['preferences.notifications.fall_detection'] = notifs.fall_detection;
        if (typeof notifs.dailySummary === 'boolean') 
          profileUpdates['preferences.notifications.dailySummary'] = notifs.dailySummary;
        if (typeof notifs.maintenanceReminders === 'boolean') 
          profileUpdates['preferences.notifications.maintenanceReminders'] = notifs.maintenanceReminders;
      }
      
      // Units
      if (prefs.units && typeof prefs.units === "object") {
        const units = prefs.units;
        if (units.temperature && ['celsius', 'fahrenheit'].includes(units.temperature)) 
          profileUpdates['preferences.units.temperature'] = units.temperature;
        if (units.distance && ['metric', 'imperial'].includes(units.distance)) 
          profileUpdates['preferences.units.distance'] = units.distance;
      }
      
      // Security
      if (prefs.security && typeof prefs.security === "object") {
        const security = prefs.security;
        if (typeof security.biometric === 'boolean') 
          profileUpdates['preferences.security.biometric'] = security.biometric;
        if (typeof security.twoFactor === 'boolean') 
          profileUpdates['preferences.security.twoFactor'] = security.twoFactor;
      }
    }

    log('debug', reqId, '🧩 Computed updates', { userUpdates, profileUpdates });

    // Update user by email (stable)
    const user = await User.findOneAndUpdate(
      { email },
      { $set: userUpdates },
      { new: true }
    ).lean();

    log('debug', reqId, '✏️ User updated', { updated: !!user });

    // Upsert profile by email
    const profile = await UserProfile.findOneAndUpdate(
      { userId: email },
      { $set: profileUpdates },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    log('debug', reqId, '✏️ Profile upserted', { updated: !!profile });

    // Return merged result
    const merged = {
      email: user.email,
      name: user.name || "",
      avatar: user.avatar || user.image || "",
      image: user.image || user.avatar || "",
      organization: user.organization || profile.organization || "",
      phone: user.phone || profile.phone || "",
      timezone: profile.timezone || "Africa/Tunis",
      preferences: {
        theme: profile.preferences?.theme || 'auto',
        language: profile.preferences?.language || 'en',
        notifications: {
          push: profile.preferences?.notifications?.push ?? true,
          emailAlerts: profile.preferences?.notifications?.emailAlerts ?? true,
          criticalOnly: profile.preferences?.notifications?.criticalOnly ?? false,
          fall_detection: profile.preferences?.notifications?.fall_detection ?? true,
          dailySummary: profile.preferences?.notifications?.dailySummary ?? true,
          maintenanceReminders: profile.preferences?.notifications?.maintenanceReminders ?? true,
        },
        units: {
          temperature: profile.preferences?.units?.temperature || 'celsius',
          distance: profile.preferences?.units?.distance || 'metric',
        },
        security: {
          biometric: profile.preferences?.security?.biometric ?? false,
          twoFactor: profile.preferences?.security?.twoFactor ?? false,
        }
      }
    };

    log('info', reqId, '✅ /api/me PUT success', {
      email: merged.email,
      theme: merged.preferences.theme,
      notifKeys: Object.keys(merged.preferences?.notifications || {}),
      unitsKeys: Object.keys(merged.preferences?.units || {}),
    });

    return res.json(merged);
  } catch (error) {
    log('error', req.reqId, '🔴 /api/me PUT failed', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: error.message });
  }
});

module.exports = app;
