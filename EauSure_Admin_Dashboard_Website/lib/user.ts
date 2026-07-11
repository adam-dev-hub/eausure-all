import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { hashPassword } from './auth';

const DB_NAME = process.env.MONGODB_DB || 'water_quality';

export interface User {
  _id: ObjectId;
  name: string;
  email: string;
  phone?: string;
  address?: string | {
    street?: string;
    city?: string;
    country?: string;
  };
  iotNodeCount?: number;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  timezone?: string;
  language?: 'fr' | 'en' | 'ar';
  theme?: 'light' | 'dark' | 'system';
  sidebarCollapsed?: boolean;
  compactMode?: boolean;
  sidebarDefaultCollapsed?: boolean;
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  timeFormat?: '24h' | '12h';
  notificationsEnabled?: boolean;
  alertSound?: boolean;
  alertDisplayThreshold?: 'all' | 'medium' | 'high' | 'critical';
  sessionTimeout?: number;
  presenceVisible?: boolean;
  loginHistory?: Array<{
    timestamp: Date;
    timezone: string;
  }>;
  sensorRefreshRate?: number;
  dashboardDefaultTab?: 'overview' | 'live' | 'alerts' | 'devices';
  tempUnit?: 'C' | 'F';
  volumeUnit?: 'L' | 'gal';
  reducedMotion?: boolean;
  highContrast?: boolean;
  fontSize?: 'sm' | 'md' | 'lg';
  presence?: {
    status: 'online' | 'away' | 'offline';
    lastActive?: Date | null;
    lastSeen?: Date | null;
  };
  password?: string;
  image?: string;
  emailVerified?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get a user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const user = await db.collection<User>('users').findOne({ email });
    return user;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

/**
 * Get a user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const user = await db
      .collection<User>('users')
      .findOne({ _id: new ObjectId(id) });
    return user;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}

/**
 * Create a new user
 */
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: 'user' | 'admin' = 'user'
): Promise<User | null> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const result = await db.collection<Omit<User, '_id'>>('users').insertOne({
      name,
      email,
      phone: '',
      address: '',
      iotNodeCount: 0,
      role,
      status: 'active',
      timezone: 'Africa/Tunis',
      language: 'fr',
      theme: 'system',
      sidebarCollapsed: false,
      compactMode: false,
      sidebarDefaultCollapsed: false,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      notificationsEnabled: false,
      alertSound: false,
      alertDisplayThreshold: 'all',
      sessionTimeout: role === 'admin' ? 120 : 60,
      presenceVisible: true,
      loginHistory: [],
      sensorRefreshRate: 10,
      dashboardDefaultTab: 'overview',
      tempUnit: 'C',
      volumeUnit: 'L',
      reducedMotion: false,
      highContrast: false,
      fontSize: 'md',
      presence: {
        status: 'offline',
        lastActive: null,
        lastSeen: null,
      },
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Get the created user
    const user = await db
      .collection<User>('users')
      .findOne({ _id: result.insertedId });
    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Update a user
 */
export async function updateUser(
  id: string,
  updates: Partial<Omit<User, '_id' | 'createdAt'>>
): Promise<User | null> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    await db.collection<User>('users').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    const user = await getUserById(id);
    return user;
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}

/**
 * Update user password by email
 */
export async function updateUserPasswordByEmail(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const hashedPassword = await hashPassword(password);

    const result = await db.collection<User>('users').updateOne(
      { email },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      }
    );

    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error updating password by email:', error);
    return false;
  }
}

/**
 * Update user presence by email
 */
export async function updateUserPresenceByEmail(
  email: string,
  presenceStatus: 'online' | 'away' | 'offline'
): Promise<boolean> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const now = new Date();
    const setFields: Record<string, Date | string> = {
      'presence.status': presenceStatus,
      'presence.lastSeen': now,
      updatedAt: now,
    };

    if (presenceStatus === 'online') {
      setFields['presence.lastActive'] = now;
    }

    const result = await db.collection<User>('users').updateOne(
      { email },
      {
        $set: setFields,
      }
    );

    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error updating user presence by email:', error);
    return false;
  }
}

/**
 * Update user presence by ID
 */
export async function updateUserPresenceById(
  id: string,
  presenceStatus: 'online' | 'away' | 'offline'
): Promise<boolean> {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const now = new Date();
    const setFields: Record<string, Date | string> = {
      'presence.status': presenceStatus,
      'presence.lastSeen': now,
      updatedAt: now,
    };

    if (presenceStatus === 'online') {
      setFields['presence.lastActive'] = now;
    }

    const result = await db.collection<User>('users').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: setFields,
      }
    );

    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error updating user presence by ID:', error);
    return false;
  }
}
