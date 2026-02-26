// Load environment variables
require('dotenv').config({ path: '.env.local' });

const createApp = require('./app');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const app = createApp();

const server = app.listen(PORT, HOST, () => {
  const baseUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`Local server running at ${baseUrl}`);
  console.log(`Dashboard: ${baseUrl}`);
  console.log(`API: ${baseUrl}/api/reddit`);
  console.log(`Health: ${baseUrl}/api/health`);
  console.log(`Auth: ${baseUrl}/api/auth/start`);
});

server.on('error', (error) => {
  console.error(`[Startup Error] ${error.code || 'UNKNOWN'}: ${error.message}`);
  process.exit(1);
});
