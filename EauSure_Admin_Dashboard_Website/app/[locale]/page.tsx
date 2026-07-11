import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);

  if (session) {
    redirect(`/${locale}/admin`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold">EauSure Admin</CardTitle>
          <CardDescription>
            Interface web réservée à l&apos;administration de la plateforme.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Link href={`/${locale}/admin/signin`} className="block">
              <Button className="w-full" size="lg">
                Accéder à l&apos;interface administrateur
              </Button>
            </Link>
          </div>

          <div className="pt-6 border-t">
            <h3 className="text-sm font-semibold mb-3">Périmètre web</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Gestion des utilisateurs et des rôles</li>
              <li>Supervision des nœuds et passerelles</li>
              <li>Maintenance firmware, OTA et FUOTA</li>
              <li>Incidents, tickets et diagnostic</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
