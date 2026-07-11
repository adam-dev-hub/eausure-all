import { ObjectId } from 'mongodb';
import { createHash, randomBytes } from 'crypto';
import clientPromise from './mongodb';

const DB_NAME = process.env.MONGODB_DB || 'water_quality';
const RESET_COLLECTION = 'password_resets';
const TOKEN_TTL_MINUTES = 30;

export interface PasswordResetToken {
  _id: ObjectId;
  email: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createPasswordResetToken(email: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000);

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const collection = db.collection<PasswordResetToken>(RESET_COLLECTION);
  const collectionForInsert = db.collection<Omit<PasswordResetToken, '_id'>>(RESET_COLLECTION);

  await collection.deleteMany({ email });
  await collectionForInsert.insertOne({
    email,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  return token;
}

export async function consumePasswordResetToken(
  email: string,
  token: string
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const collection = db.collection<PasswordResetToken>(RESET_COLLECTION);

  const result = await collection.findOneAndUpdate(
    {
      email,
      tokenHash,
      usedAt: { $exists: false },
      expiresAt: { $gt: now },
    },
    {
      $set: {
        usedAt: now,
      },
    }
  );

  return !!result;
}
