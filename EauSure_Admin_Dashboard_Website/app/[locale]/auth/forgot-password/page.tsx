'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ForgotPasswordResponse = {
  message?: string;
  error?: string;
  resetUrl?: string;
};

export default function ForgotPasswordPage() {
  const params = useParams<{ locale?: string | string[] }>();
  const locale = useMemo(() => {
    if (Array.isArray(params?.locale)) {
      return params.locale[0] || 'fr';
    }
    return params?.locale || 'fr';
  }, [params]);

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const signInPath = `/${locale}/auth/signin`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetUrl('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, locale }),
      });

      const data = (await response.json()) as ForgotPasswordResponse;

      if (!response.ok) {
        setError(data.error || 'Unable to process request');
        return;
      }

      setMessage(
        data.message ||
          'If that email exists in our system, a reset link has been sent.'
      );

      if (data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email and we will send you a password reset link.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {message && (
              <div className="rounded-md bg-primary/10 p-3 border border-primary/20">
                <p className="text-sm text-foreground">{message}</p>
                {resetUrl && (
                  <p className="text-xs text-muted-foreground mt-2 break-all">
                    Dev reset link: <a href={resetUrl}>{resetUrl}</a>
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="user@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Remembered your password?{' '}
              <Link
                href={signInPath}
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
