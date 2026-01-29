// Serve index.html for SPA routing
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // Only handle GET requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Serve index.html
  const indexPath = path.join(__dirname, '..', 'index.html');
  
  try {
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Internal server error');
  }
};
