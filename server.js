// Load environment variables
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const path = require('path');
const redditHandler = require('./api/reddit.js');
const redditTestHandler = require('./api/reddit-test.js');
const authStartHandler = require('./api/auth/start.js');
const authCallbackHandler = require('./api/auth/callback.js');
const authLogoutHandler = require('./api/auth/logout.js');
const authStatusHandler = require('./api/auth/status.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from root
app.use(express.static(__dirname));

// API routes
app.get('/api/reddit', redditHandler);
app.get('/api/reddit-test', redditTestHandler);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.get('/api/auth/start', authStartHandler);
app.get('/api/auth/callback', authCallbackHandler);
app.get('/api/auth/logout', authLogoutHandler);
app.get('/api/auth/status', authStatusHandler);

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
