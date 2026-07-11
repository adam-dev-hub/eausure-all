import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Providers from "../providers";
import { Toaster } from "@/components/ui/sonner";
import { ParticlesBackground } from "@/components/ui/particles-background";
import { LocaleDocumentAttributes } from "@/components/locale-document-attributes";

const locales = ['fr'];

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleDocumentAttributes locale={locale} />
      <Providers>
        <ParticlesBackground />
        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </Providers>
      <Toaster />
    </NextIntlClientProvider>
  );
}
