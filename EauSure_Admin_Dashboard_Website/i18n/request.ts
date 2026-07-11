import { getRequestConfig } from 'next-intl/server';

const supportedLocales = ['fr', 'en', 'ar'] as const;

type Locale = (typeof supportedLocales)[number];

function isSupportedLocale(locale: string | undefined): locale is Locale {
  return Boolean(locale && supportedLocales.includes(locale as Locale));
}

async function loadMessages(locale: Locale) {
  return (await import(`../messages/${locale}.json`)).default;
}

function mergeMessages(base: Record<string, unknown>, override: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeMessages(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = isSupportedLocale(locale) ? locale : 'fr';
  const fallbackMessages = await loadMessages('fr');
  const localeMessages = resolvedLocale === 'fr' ? fallbackMessages : await loadMessages(resolvedLocale);
  const messages = mergeMessages(fallbackMessages, localeMessages);
  
  return {
    locale: resolvedLocale,
    messages,
    onError(error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[i18n missing key]', error.message);
      }
    },
    getMessageFallback({ namespace, key }) {
      return process.env.NODE_ENV === 'development' ? `⚠ ${namespace}.${key}` : key;
    },
  };
});
