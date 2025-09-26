const crypto = require('crypto');

function urlSafeBase64(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateCodeVerifier() {
  return urlSafeBase64(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return urlSafeBase64(hash);
}

function randomState() {
  return urlSafeBase64(crypto.randomBytes(16));
}

module.exports = {
  urlSafeBase64,
  generateCodeVerifier,
  generateCodeChallenge,
  randomState,
};
