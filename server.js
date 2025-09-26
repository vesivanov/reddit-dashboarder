// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Debug: Check if env vars are loaded
console.log('Environment check:');
console.log('REDDIT_CLIENT_ID:', process.env.REDDIT_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('REDDIT_REDIRECT_URI:', process.env.REDDIT_REDIRECT_URI ? 'SET' : 'NOT SET');
console.log('SESSION_COOKIE_SECRET:', process.env.SESSION_COOKIE_SECRET ? 'SET' : 'NOT SET');
console.log('APP_BASE_URL:', process.env.APP_BASE_URL ? 'SET' : 'NOT SET');
console.log('REDDIT_USER_AGENT:', process.env.REDDIT_USER_AGENT ? 'SET' : 'NOT SET');

const express = require('express');
const path = require('path');
const redditHandler = require('./api/reddit.js');
const authStartHandler = require('./api/auth/start.js');
const authCallbackHandler = require('./api/auth/callback.js');
const authLogoutHandler = require('./api/auth/logout.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from root
app.use(express.static(__dirname));

// API routes
app.get('/api/reddit', redditHandler);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.get('/api/auth/start', authStartHandler);
app.get('/api/auth/callback', authCallbackHandler);
app.get('/api/auth/logout', authLogoutHandler);

// Serve index.html for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/reddit`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Auth: http://localhost:${PORT}/api/auth/start`);
});
