// Waitlist signup endpoint for Pro tier launch notifications
const { withCORS } = require('../cors');
const storage = require('../storage');

// Email validation regex (RFC 5322 compliant subset)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Sanitize string input
function sanitizeString(input, maxLength = 255) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength).replace(/[<>\"']/g, '');
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'POST, OPTIONS').status(204).end();
  }

  if (req.method !== 'POST') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const { email: rawEmail, tier: rawTier } = req.body;

  // Validate email
  const email = sanitizeString(rawEmail, 254);
  if (!email || !EMAIL_REGEX.test(email)) {
    return withCORS(req, res).status(400).json({
      error: 'Invalid email',
      message: 'Please provide a valid email address'
    });
  }

  // Validate tier
  const tier = sanitizeString(rawTier, 50);
  const validTiers = ['pro', 'team', 'enterprise'];
  const normalizedTier = validTiers.includes(tier?.toLowerCase()) ? tier.toLowerCase() : 'pro';

  try {
    // Get existing waitlist
    const waitlist = (await storage.get('pro-waitlist')) || [];

    // Prevent storage abuse - max 10,000 entries
    const MAX_WAITLIST_SIZE = 10000;
    if (waitlist.length >= MAX_WAITLIST_SIZE) {
      return withCORS(req, res).status(503).json({
        error: 'Waitlist full',
        message: 'Our waitlist is currently full. Please try again later.'
      });
    }

    // Add email with timestamp and tier if not already there
    const entry = {
      email,
      tier: normalizedTier,
      timestamp: new Date().toISOString()
    };

    const existingIndex = waitlist.findIndex(e => e.email === email);
    if (existingIndex === -1) {
      waitlist.push(entry);
      await storage.set('pro-waitlist', waitlist, 365 * 24 * 60 * 60); // 1 year TTL
    }

    return withCORS(req, res).status(200).json({
      success: true,
      message: "Thanks! We'll notify you when Pro launches. 🚀"
    });
  } catch (error) {
    console.error('[notify-me] Error:', error);
    return withCORS(req, res).status(500).json({
      error: 'Failed to save email',
      message: 'Please try again later'
    });
  }
}

module.exports = handler;
