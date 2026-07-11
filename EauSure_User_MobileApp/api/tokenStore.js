let currentToken = null;

function maskToken(token) {
  if (!token) return '<missing>';
  if (token.length <= 18) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

export function setAuthToken(token) {
  currentToken = token || null;
  console.log('[TokenStore][SET]', {
    token: maskToken(currentToken),
    hasToken: !!currentToken,
  });
}

export function getAuthToken() {
  console.log('[TokenStore][GET]', {
    token: maskToken(currentToken),
    hasToken: !!currentToken,
  });
  return currentToken;
}

export function clearAuthToken() {
  console.log('[TokenStore][CLEAR]', {
    token: maskToken(currentToken),
    hadToken: !!currentToken,
  });
  currentToken = null;
}
