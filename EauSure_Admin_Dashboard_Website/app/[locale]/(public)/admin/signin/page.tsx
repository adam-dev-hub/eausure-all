'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useT } from '@/lib/useT';

export default function AdminSignInPage() {
  const router = useRouter();
  const t = useT('home.auth.adminSignin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const locale = 'fr';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        role: 'admin',
        expectedRole: 'admin',
        roleMismatchError: 'admin',
      });

      if (result?.error) {
        setError(t('errors.invalidCredentials'));
        setIsLoading(false);
        return;
      }

      router.push(`/${locale}/admin`);
      router.refresh();
    } catch {
      setError(t('errors.unexpected'));
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 start-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-4">
        <Card className="w-full border-border/60 shadow-none">
          <CardHeader className="space-y-2 px-8 pt-8 pb-3">
            <CardTitle className="text-3xl font-bold tracking-tight">{t('title')}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">{t('description')}</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 px-8 py-4">
              {error && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="admin-email">{t('emailLabel')}</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">{t('passwordLabel')}</Label>
                <PasswordInput
                  id="admin-password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="text-end">
                  <Link
                    href={`/${locale}/auth/forgot-password`}
                    className="text-[13px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t('forgotPassword')}
                  </Link>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 px-8 pt-2 pb-8">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('signingIn') : t('submit')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
