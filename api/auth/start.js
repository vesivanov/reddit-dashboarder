const { generateCodeVerifier, generateCodeChallenge, randomState } = require('../../lib/pkce');
const { makeSignedCookie } = require('../../lib/cookies');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  let redirectUri = process.env.REDDIT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).send('Missing Reddit OAuth configuration');
    return;
  }

  // Normalize redirect URI - remove trailing slashes and ensure proper format
  redirectUri = redirectUri.trim().replace(/\/+$/, '');
  
  // Log the redirect URI being used (for debugging)
  console.log('=== OAuth Start ===');
  console.log('Client ID:', clientId ? `${clientId.substring(0, 8)}...` : 'MISSING');
  console.log('Redirect URI (raw from env):', process.env.REDDIT_REDIRECT_URI);
  console.log('Redirect URI (normalized):', redirectUri);
  console.log('IMPORTANT: This redirect URI must EXACTLY match what you configured in your Reddit app settings!');

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
