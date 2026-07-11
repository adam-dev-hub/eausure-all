export const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-eausure.session'
    : 'eausure.session';
