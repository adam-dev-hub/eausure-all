import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserByEmail } from './user';

const nextAuthSecret = process.env.NEXTAUTH_SECRET || '';
const jwtSecret = process.env.JWT_SECRET || '';

if (nextAuthSecret.length < 64) {
  console.warn('NEXTAUTH_SECRET is shorter than 64 characters.');
}

if (jwtSecret && jwtSecret.length < 64) {
  console.warn('JWT_SECRET is shorter than 64 characters when set.');
}

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Host-eausure.session'
          : 'eausure.session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        role: { label: 'Role', type: 'text' },
        expectedRole: { label: 'Expected Role', type: 'text' },
        roleMismatchError: { label: 'Role Mismatch Error', type: 'text' },
        rememberMe: { label: 'Remember Me', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const authBaseUrl = (
          process.env.NEXT_PUBLIC_AUTH_API_URL ||
          process.env.AUTH_API_URL ||
          'https://eau-sure-app-auth.vercel.app/api'
        ).replace(/\/$/, '');

        const loginResponse = await fetch(`${authBaseUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
          cache: 'no-store',
        }).catch(() => null);

        if (!loginResponse?.ok) {
          return null;
        }

        const loginPayload = await loginResponse.json().catch(() => null);
        const accessToken = typeof loginPayload?.token === 'string' ? loginPayload.token : '';
        if (!accessToken) {
          return null;
        }

        const meResponse = await fetch(`${authBaseUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        }).catch(() => null);

        if (!meResponse?.ok) {
          return null;
        }

        const mePayload = await meResponse.json().catch(() => null);
        const remoteUser = mePayload?.user;
        const actualRole: 'user' | 'admin' = remoteUser?.role === 'admin' ? 'admin' : 'user';
        if (actualRole !== 'admin') {
          return null;
        }

        return {
          id: String(remoteUser?._id || remoteUser?.id || credentials.email),
          email: String(remoteUser?.email || credentials.email),
          name: String(remoteUser?.name || credentials.email),
          role: actualRole,
          timezone: remoteUser?.timezone ?? 'Africa/Tunis',
          language: remoteUser?.language ?? 'fr',
          theme: remoteUser?.theme ?? 'system',
          accessToken,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/fr/admin/signin',
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.userId = user.id;
        token.email = user.email;
        token.role = user.role;
        token.timezone = user.timezone ?? 'Africa/Tunis';
        token.language = user.language ?? 'fr';
        token.theme = user.theme ?? 'system';
        token.rememberMe = user.rememberMe;
        token.accessToken = user.accessToken;
      }

      if (trigger === 'update' && token.email) {
        const updatedUser = await getUserByEmail(token.email as string);
        if (updatedUser) {
          token.name = updatedUser.name;
          token.picture = updatedUser.image;
          token.timezone = updatedUser.timezone ?? 'Africa/Tunis';
          token.language = updatedUser.language ?? 'fr';
          token.theme = updatedUser.theme ?? 'system';
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.id = token.id as string;
        session.user.role = token.role === 'admin' ? 'admin' : 'user';
        session.user.timezone = token.timezone ?? 'Africa/Tunis';
        session.user.language = token.language ?? 'fr';
        session.user.theme = token.theme ?? 'system';
        session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : undefined;
      }
      return session;
    },
  },
};
