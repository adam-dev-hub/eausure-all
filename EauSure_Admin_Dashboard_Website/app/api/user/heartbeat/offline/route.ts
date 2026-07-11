import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { updateUserPresenceByEmail, updateUserPresenceById } from '@/lib/user';

const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-eausure.session'
    : 'eausure.session';

export async function POST(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
  });
  const email = typeof token?.email === 'string' ? token.email : null;
  const userId = typeof token?.id === 'string' ? token.id : null;

  if (!email && !userId) {
    return new Response(null, { status: 204 });
  }

  try {
    let updated = false;
    if (userId) {
      updated = await updateUserPresenceById(userId, 'offline');
    }

    if (!updated && email) {
      await updateUserPresenceByEmail(email, 'offline');
    }
  } catch (error) {
    console.error('[POST /api/user/heartbeat/offline]', error);
  }

  return new Response(null, { status: 204 });
}
