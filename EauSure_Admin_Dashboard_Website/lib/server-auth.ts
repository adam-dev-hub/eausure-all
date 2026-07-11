import { getToken, type JWT } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { sessionCookieName } from './session-cookie';
import { getUserByEmail } from './user';

export type RequestAuthContext = {
  token: JWT;
  email: string;
  role: 'admin' | 'user';
  userId: string;
};

export async function getRequestAuthContext(
  req: NextRequest
): Promise<RequestAuthContext | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return null;
  }

  const token = await getToken({ req, secret, cookieName: sessionCookieName });
  const email = typeof token?.email === 'string' ? token.email : null;

  if (!token || !email) {
    return null;
  }

  const user = await getUserByEmail(email);
  if (!user || user.status === 'suspended') {
    return null;
  }

  return {
    token,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
    userId: user._id.toString(),
  };
}

export async function requireAdminContext(
  req: NextRequest
): Promise<RequestAuthContext | null> {
  const auth = await getRequestAuthContext(req);
  if (!auth || auth.role !== 'admin') {
    return null;
  }

  return auth;
}

export async function requireOperatorContext(
  req: NextRequest
): Promise<RequestAuthContext | null> {
  void req;
  return null;
}
