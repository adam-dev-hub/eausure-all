'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

export function useT(namespace: string) {
  const t = useTranslations(namespace);

  return useCallback((key: string, values?: Record<string, string | number | Date>) => {
    try {
      return t(key, values);
    } catch {
      return `${namespace}.${key}`;
    }
  }, [namespace, t]);
}
