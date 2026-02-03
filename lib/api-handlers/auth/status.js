const { readSignedCookie } = require('../../lib/cookies');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = readSignedCookie(req, 'access');
  const refreshToken = readSignedCookie(req, 'refresh');
  const authenticated = Boolean(accessToken || refreshToken);

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    authenticated,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
  });
};
