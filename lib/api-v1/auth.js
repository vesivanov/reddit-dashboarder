function verifyAgentApiKey(req) {
  const apiKey = process.env.AGENT_API_KEY;

  if (!apiKey) {
    return { valid: false, error: 'AGENT_API_KEY not configured' };
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  if (match[1].trim() !== apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}

module.exports = {
  verifyAgentApiKey,
};
