const { readSignedCookie, makeSignedCookie, clearCookie } = require('../../lib/cookies');

async function exchangeCodeForTokens(code, verifier) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const redirectUri = process.env.REDDIT_REDIRECT_URI;
  const userAgent = process.env.REDDIT_USER_AGENT;

  if (!clientId || !clientSecret || !redirectUri || !userAgent) {
    throw new Error('Missing Reddit OAuth configuration');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  console.log('OAuth callback: Request received');
  console.log('OAuth callback: req.url:', req.url);
  console.log('OAuth callback: req.headers.host:', req.headers.host);

  const baseUrl = process.env.APP_BASE_URL || `http://${req.headers.host || 'localhost:3000'}`;
  const url = new URL(req.url, baseUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  console.log('OAuth callback: Parsed code:', code ? 'present' : 'missing');
  console.log('OAuth callback: Parsed state:', state ? 'present' : 'missing');

  const savedState = readSignedCookie(req, 'oauth_state');
  const verifier = readSignedCookie(req, 'pkce_verifier');

  console.log('OAuth callback: Saved state:', savedState ? 'present' : 'missing');
  console.log('OAuth callback: Verifier:', verifier ? 'present' : 'missing');

  if (!code || !state || !verifier || !savedState || state !== savedState) {
    console.error('OAuth callback: Validation failed', {
      hasCode: !!code,
      hasState: !!state,
      hasVerifier: !!verifier,
      hasSavedState: !!savedState,
      stateMatch: state === savedState
    });
    res.status(400).send('Invalid OAuth state');
    return;
  }

  try {
    const tokenResponse = await exchangeCodeForTokens(code, verifier);

    const cookies = [
      makeSignedCookie('access', tokenResponse.access_token, { maxAge: Math.max(0, (tokenResponse.expires_in || 3600) - 10) }),
      tokenResponse.refresh_token ? makeSignedCookie('refresh', tokenResponse.refresh_token, { maxAge: 60 * 60 * 24 * 30 }) : null,
      clearCookie('oauth_state'),
      clearCookie('pkce_verifier'),
    ].filter(Boolean);

    console.log('OAuth callback: Setting cookies:', cookies.map(c => c.split(';')[0]));
    console.log('OAuth callback: Cookie secure flag enabled:', process.env.NODE_ENV === 'production' || process.env.REDDIT_REDIRECT_URI?.startsWith('https://'));
    
    res.setHeader('Set-Cookie', cookies);
    res.redirect('/');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(error.message || 'Token exchange failed');
  }
};
