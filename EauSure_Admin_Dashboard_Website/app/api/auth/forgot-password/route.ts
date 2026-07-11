import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/user';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendPasswordResetEmail } from '@/lib/password-reset-email';

interface ForgotPasswordBody {
  email?: string;
  locale?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ForgotPasswordBody;
    const email = body.email?.trim().toLowerCase();
    const locale = body.locale?.trim() || 'fr';

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);

    if (user) {
      const token = await createPasswordResetToken(email);
      const appUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin;
      const resetUrl = `${appUrl}/${locale}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      const sent = await sendPasswordResetEmail({
        to: email,
        resetUrl,
        locale,
      });

      if (!sent) {
        console.warn('Password reset email was not delivered.');
      }

      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json({
          message:
            'If that email exists in our system, a reset link has been sent.',
          resetUrl,
        });
      }
    }

    return NextResponse.json({
      message: 'If that email exists in our system, a reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
