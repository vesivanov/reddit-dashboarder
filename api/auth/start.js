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
  console.log('OAuth redirect URI:', redirectUri);

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
  res.redirect(location);
};
