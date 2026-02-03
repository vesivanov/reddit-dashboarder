// Vercel serverless function catch-all for all API routes
// Consolidates all API routes into a single function to avoid the 12-function limit

const createApp = require('../app');

// Create the Express app (Vercel will cache this)
const app = createApp();

// Export the Express app directly - Vercel handles the routing
module.exports = app;
