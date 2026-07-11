import { redirect } from 'next/navigation';

export default async function MaintenanceRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/deploy-updates`);
}
