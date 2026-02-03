// Vercel serverless function entry point
// Consolidates all API routes into a single function to avoid the 12-function limit

const createApp = require('../app');

// Create the Express app
const app = createApp();

// Export as Vercel serverless function
module.exports = app;
