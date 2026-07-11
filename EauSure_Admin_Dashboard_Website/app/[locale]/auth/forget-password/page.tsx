import { redirect } from 'next/navigation';

export default async function ForgetPasswordAliasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/auth/forgot-password`);
}
