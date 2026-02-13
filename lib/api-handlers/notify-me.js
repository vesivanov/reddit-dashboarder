// Waitlist signup endpoint for Pro tier launch notifications
const { withCORS } = require('../cors');
const storage = require('../storage');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'POST, OPTIONS').status(204).end();
  }

  if (req.method !== 'POST') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const { email, tier } = req.body;

  if (!email || !email.includes('@')) {
    return withCORS(req, res).status(400).json({
      error: 'Invalid email',
      message: 'Please provide a valid email address'
    });
  }

  try {
    // Get existing waitlist
    const waitlist = (await storage.get('pro-waitlist')) || [];
    
    // Add email with timestamp and tier if not already there
    const entry = {
      email,
      tier: tier || 'pro',
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
