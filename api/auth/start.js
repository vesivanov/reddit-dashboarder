const { generateCodeVerifier, generateCodeChallenge, randomState } = require('../../lib/pkce');
const { makeSignedCookie } = require('../../lib/cookies');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;

  if (!clientId) {
    res.status(500).send('Missing Reddit OAuth configuration');
    return;
  }

  // Construct redirect URI dynamically from request
  // This ensures we always use the correct URI for the current environment
  // If REDDIT_REDIRECT_URI contains a comma (multiple URIs), ignore it and construct dynamically
  // Priority: x-forwarded-proto (Vercel/proxies) > connection.encrypted > default http
  let protocol = 'http';
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  } else if (req.connection && req.connection.encrypted) {
    protocol = 'https';
  } else if (req.headers['x-forwarded-ssl'] === 'on') {
    protocol = 'https';
  } else if (req.secure) {
    protocol = 'https';
  }
  
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  let baseUrl = process.env.APP_BASE_URL || `${protocol}://${host}`;
  // Remove trailing slash from APP_BASE_URL if present
  baseUrl = baseUrl.replace(/\/+$/, '');
  let redirectUri = `${baseUrl}/api/auth/callback`;
  
  // If REDDIT_REDIRECT_URI is set and is a single URI (not comma-separated), use it as override
  // But only if it matches the current request context
  const envRedirectUri = process.env.REDDIT_REDIRECT_URI;
  if (envRedirectUri && !envRedirectUri.includes(',')) {
    try {
      const envUri = envRedirectUri.trim().replace(/\/+$/, '');
      const envUrl = new URL(envUri);
      const currentHost = host.toLowerCase();
      const envHost = envUrl.host.toLowerCase();
      
      // Only use env var if it matches the current host
      if (envHost === currentHost || (envHost === 'localhost:3000' && currentHost === 'localhost:3000')) {
        redirectUri = envUri;
      }
    } catch (e) {
      // Invalid URL in env var, use dynamically constructed one
      console.warn('Invalid REDDIT_REDIRECT_URI in env, using dynamically constructed URI');
    }
  }
  
  // Normalize: remove trailing slashes and ensure proper format
  redirectUri = redirectUri.trim().replace(/\/+$/, '');
  
  // Log the redirect URI being used (for debugging)
  console.log('=== OAuth Start ===');
  console.log('Client ID:', clientId ? `${clientId.substring(0, 8)}...` : 'MISSING');
  console.log('Request URL:', req.url);
  console.log('Request host:', req.headers.host);
  console.log('X-Forwarded-Host:', req.headers['x-forwarded-host']);
  console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
  console.log('REDDIT_REDIRECT_URI env:', process.env.REDDIT_REDIRECT_URI);
  console.log('Final redirect URI:', redirectUri);
  console.log('⚠️  IMPORTANT: This redirect URI must EXACTLY match what you configured in your Reddit app settings!');
  console.log('⚠️  Check Reddit app settings at: https://www.reddit.com/prefs/apps');
  console.log('⚠️  Redirect URI should be one of:');
  console.log('    - http://localhost:3000/api/auth/callback');
  console.log('    - https://reddit-dashboarder.vercel.app/api/auth/callback');

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomState();

  res.setHeader('Set-Cookie', [
    makeSignedCookie('pkce_verifier', verifier, { maxAge: 300 }),
    makeSignedCookie('oauth_state', state, { maxAge: 300 }),
  ]);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state,
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: 'read',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  const location = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  console.log('Redirecting to Reddit OAuth with redirect_uri:', redirectUri);
  console.log('Encoded redirect_uri in URL:', params.get('redirect_uri'));
  console.log('Full OAuth URL:', location);
  console.log('');
  console.log('⚠️  TROUBLESHOOTING: If Reddit rejects this, verify in Reddit app settings:');
  console.log('   1. Go to https://www.reddit.com/prefs/apps');
  console.log('   2. Find your app and check "redirect uri" field');
  console.log('   3. It should contain BOTH of these (one per line or comma-separated):');
  console.log('      - https://reddit-dashboarder.vercel.app/api/auth/callback');
  console.log('      - http://localhost:3000/api/auth/callback');
  console.log('   4. Make sure there are NO extra spaces, trailing slashes, or typos');
  console.log('');
  res.redirect(location);
};
