/**
 * Debug endpoint: confirms API routing works. Root (/) is served as static index.html.
 * Check Vercel Logs for "[root-info]" to verify this runs.
 */
function handler(req, res) {
  const ts = new Date().toISOString();
  const msg = '[root-info] ' + ts + ' GET ' + (req.url || '/api/root-info');
  console.log(msg);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(
    JSON.stringify({
      ok: true,
      timestamp: ts,
      message: 'Root (/) is static index.html. This is /api/root-info.',
    })
  );
}

module.exports = handler;
