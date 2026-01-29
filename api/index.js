// Serve index.html for SPA routes
const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  try {
    const indexPath = path.join(__dirname, '..', 'index.html');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Not found');
    }
    
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error in index handler:', error);
    res.status(500).send('Internal server error');
  }
};
