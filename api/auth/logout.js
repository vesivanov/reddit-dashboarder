const { clearCookie } = require('../../lib/cookies');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  res.setHeader('Set-Cookie', [
    clearCookie('access'),
    clearCookie('refresh'),
  ]);

  res.redirect('/');
};
