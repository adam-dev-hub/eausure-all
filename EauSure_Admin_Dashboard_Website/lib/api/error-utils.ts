export type ApiErrorLike = {
  status?: number;
  message?: string;
  errorCode?: string;
  errors?: Array<{ message?: string }>;
};

const TECHNICAL_PATTERNS = [
  /jwt/i,
  /token/i,
  /mongo/i,
  /mongodb/i,
  /mongoose/i,
  /stack/i,
  /trace/i,
  /syntaxerror/i,
  /typeerror/i,
  /referenceerror/i,
  /failed to fetch/i,
  /networkerror/i,
  /econn/i,
  /enotfound/i,
  /timeout/i,
  /timed out/i,
  /unauthorized/i,
  /forbidden/i,
  /internal server error/i,
  /external api request failed/i,
  /nextauth/i,
  /secret/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function getApiErrorDetails(error: unknown): ApiErrorLike {
  if (isRecord(error)) {
    const status = typeof error.status === 'number' ? error.status : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;
    const errorCode = typeof error.errorCode === 'string' ? error.errorCode : undefined;
    const errors = Array.isArray(error.errors)
      ? error.errors.filter(isRecord).map((item) => ({ message: typeof item.message === 'string' ? item.message : undefined }))
      : undefined;

    return { status, message, errorCode, errors };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return {};
}

export function parseApiErrorPayload(payload: unknown, status?: number): ApiErrorLike {
  if (!isRecord(payload)) return { status };

  const message =
    typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : undefined;
  const errors = Array.isArray(payload.errors)
    ? payload.errors.filter(isRecord).map((item) => ({ message: typeof item.message === 'string' ? item.message : undefined }))
    : undefined;
  const errorCode = typeof payload.errorCode === 'string' ? payload.errorCode : undefined;

  return { status, message, errorCode, errors };
}

export function isSafeSpecificApiMessage(message?: string) {
  if (!message) return false;
  const trimmed = message.trim();
  if (trimmed.length < 3 || trimmed.length > 180) return false;
  return !TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function classifyApiErrorKey(error: unknown): string {
  const details = getApiErrorDetails(error);
  if (details.errorCode) return details.errorCode;

  const message = details.message || details.errors?.map((item) => item.message).find(Boolean) || '';
  const normalized = message.toLowerCase();

  if (/timeout|timed out|abort/i.test(message)) return 'timeout';
  if (/failed to fetch|networkerror|load failed|econn|enotfound|network/i.test(message)) return 'network';

  switch (details.status) {
    case 400:
      return 'badRequest';
    case 401:
      return 'sessionExpired';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 408:
      return 'timeout';
    case 429:
      return 'rateLimited';
    case 500:
      return 'server';
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      break;
  }

  if (normalized.includes('no data') || normalized.includes('not found')) return 'notFound';
  if (normalized.includes('permission') || normalized.includes('forbidden')) return 'forbidden';
  if (normalized.includes('session') || normalized.includes('unauthorized')) return 'sessionExpired';

  return 'generic';
}

export function classifyApiError(error: unknown, translate?: (key: string) => string): string {
  const details = getApiErrorDetails(error);
  const specificMessage = details.message || details.errors?.map((item) => item.message).find(Boolean);

  if (isSafeSpecificApiMessage(specificMessage)) {
    return specificMessage!.trim();
  }

  const key = classifyApiErrorKey(error);
  return translate ? translate(`errors.api.${key}`) : key;
}

export async function apiErrorFromResponse(response: Response): Promise<ApiErrorLike> {
  const payload = await response.json().catch(() => null);
  const details = parseApiErrorPayload(payload, response.status);
  return {
    status: response.status,
    message: details.message,
    errorCode: details.errorCode,
    errors: details.errors,
  };
}
