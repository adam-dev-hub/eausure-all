import { Resend } from 'resend';

interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  locale: string;
}

type MailProvider = 'resend' | 'brevo';

function getMailProvider(): MailProvider {
  const configured = (process.env.MAIL_PROVIDER || 'resend').trim().toLowerCase();
  return configured === 'brevo' ? 'brevo' : 'resend';
}

function parseFromAddress(value: string) {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }
  return trimmed;
}

async function sendWithResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const resend = new Resend(params.apiKey);
  const result = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (result.error) {
    console.error('Resend API error:', result.error);
    return false;
  }

  return true;
}

async function sendWithBrevo(params: {
  apiKey: string;
  from: string;
  appName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const senderEmail = parseFromAddress(params.from);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': params.apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: params.appName,
      },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('Brevo API error:', details || `HTTP ${response.status}`);
    return false;
  }

  return true;
}

function getLocalizedCopy(locale: string) {
  if (locale === 'fr') {
    return {
      subject: 'Reinitialisation de votre mot de passe EauSure',
      greeting: 'Bonjour,',
      intro:
        'Nous avons recu une demande de reinitialisation de mot de passe pour votre compte.',
      action: 'Reinitialiser mon mot de passe',
      expiry: 'Ce lien expire dans 30 minutes.',
      ignore:
        "Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email.",
    };
  }

  if (locale === 'ar') {
    return {
      subject: 'Reset your EauSure password',
      greeting: 'Hello,',
      intro: 'We received a password reset request for your account.',
      action: 'Reset my password',
      expiry: 'This link expires in 30 minutes.',
      ignore: 'If you did not request this, you can safely ignore this email.',
    };
  }

  return {
    subject: 'Reset your EauSure password',
    greeting: 'Hello,',
    intro: 'We received a password reset request for your account.',
    action: 'Reset my password',
    expiry: 'This link expires in 30 minutes.',
    ignore: 'If you did not request this, you can safely ignore this email.',
  };
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  locale,
}: PasswordResetEmailInput): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const brevoApiKey = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;
  const appName = process.env.APP_NAME || 'EauSure';
  const provider = getMailProvider();

  if (!from) {
    console.warn('Password reset email skipped: missing MAIL_FROM');
    return false;
  }

  if (provider === 'resend' && !resendApiKey) {
    console.warn('Password reset email skipped: missing RESEND_API_KEY');
    return false;
  }

  if (provider === 'brevo' && !brevoApiKey) {
    console.warn('Password reset email skipped: missing BREVO_API_KEY');
    return false;
  }

  const copy = getLocalizedCopy(locale);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827; line-height: 1.5;">
      <h2 style="margin-bottom: 12px;">${copy.greeting}</h2>
      <p>${copy.intro}</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 16px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 8px;">
          ${copy.action}
        </a>
      </p>
      <p>${copy.expiry}</p>
      <p>${copy.ignore}</p>
      <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">
        ${appName}<br />
        ${resetUrl}
      </p>
    </div>
  `;

  const text = `${copy.greeting}\n\n${copy.intro}\n\n${copy.action}: ${resetUrl}\n\n${copy.expiry}\n${copy.ignore}`;

  try {
    if (provider === 'brevo') {
      return await sendWithBrevo({
        apiKey: brevoApiKey as string,
        from,
        appName,
        to,
        subject: copy.subject,
        html,
        text,
      });
    }

    return await sendWithResend({
      apiKey: resendApiKey as string,
      from,
      to,
      subject: copy.subject,
      html,
      text,
    });
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}
