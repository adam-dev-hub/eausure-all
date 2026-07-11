import { NextRequest } from 'next/server';

export function isSameOriginRequest(request: NextRequest): boolean {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const source = originHeader || refererHeader;

  if (!source) {
    return false;
  }

  try {
    return new URL(source).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}