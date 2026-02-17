// /api/notify-me — Waitlist signup for Pro tier launch notifications
// POST { email } → saves to KV storage, returns success message
//
// This file acts as both:
//   - A Vercel serverless function (if invoked directly by an older/custom routes config)
//   - A re-export shim so the handler lives in lib/api-handlers/notify-me.js
//     which is the canonical location registered in app.js

const handler = require('../lib/api-handlers/notify-me');

module.exports = handler;
