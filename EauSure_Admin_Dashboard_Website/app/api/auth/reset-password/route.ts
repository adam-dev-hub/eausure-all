import { NextResponse } from 'next/server';
import {
  consumePasswordResetToken,
} from '@/lib/password-reset';
import { updateUserPasswordByEmail } from '@/lib/user';

interface ResetPasswordBody {
  email?: string;
  token?: string;
  password?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResetPasswordBody;
    const email = body.email?.trim().toLowerCase();
    const token = body.token?.trim();
    const password = body.password;

    if (!email || !token || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const isTokenValid = await consumePasswordResetToken(email, token);
    if (!isTokenValid) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired' },
        { status: 400 }
      );
    }

    const updated = await updateUserPasswordByEmail(email, password);
    if (!updated) {
      return NextResponse.json(
        { error: 'Unable to reset password' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
