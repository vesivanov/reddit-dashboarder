/**
 * Serves index.html for the root path only.
 * Kept minimal so it never blocks or times out.
 */
const fs = require('fs');
const path = require('path');

module.exports = function (req, res) {
  try {
    const file = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(html);
  } catch (e) {
    res.status(500).end('Error loading page');
  }
};
