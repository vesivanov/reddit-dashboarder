// Test endpoint to show the exact OAuth URL that would be sent to Reddit
module.exports = async function handler(req, res) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  
  if (!clientId) {
    return res.status(500).send('REDDIT_CLIENT_ID not configured');
  }

  // Construct redirect URI the same way start.js does
  let protocol = 'http';
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  } else if (req.connection && req.connection.encrypted) {
    protocol = 'https';
  } else if (req.headers['x-forwarded-ssl'] === 'on') {
    protocol = 'https';
  } else if (req.secure) {
    protocol = 'https';
  }
  
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  let baseUrl = process.env.APP_BASE_URL || `${protocol}://${host}`;
  baseUrl = baseUrl.replace(/\/+$/, '');
  let redirectUri = `${baseUrl}/api/auth/callback`;
  
  const envRedirectUri = process.env.REDDIT_REDIRECT_URI;
  if (envRedirectUri && !envRedirectUri.includes(',')) {
    try {
      const envUri = envRedirectUri.trim().replace(/\/+$/, '');
      const envUrl = new URL(envUri);
      const currentHost = host.toLowerCase();
      const envHost = envUrl.host.toLowerCase();
      
      if (envHost === currentHost || (envHost === 'localhost:3000' && currentHost === 'localhost:3000')) {
        redirectUri = envUri;
      }
    } catch (e) {
      // Use dynamically constructed one
    }
  }
  
  redirectUri = redirectUri.trim().replace(/\/+$/, '');

  // Create a sample OAuth URL (without actually redirecting)
  const { URLSearchParams } = require('url');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state: 'test_state',
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: 'read',
    code_challenge_method: 'S256',
    code_challenge: 'test_challenge',
  });

  const oauthUrl = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OAuth URL Test</title>
      <style>
        body { font-family: monospace; padding: 20px; background: #f5f5f5; }
        .box { background: white; padding: 20px; border-radius: 8px; margin: 10px 0; }
        .url { font-size: 12px; color: #2563eb; word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px; }
        .param { margin: 5px 0; padding: 5px; background: #f9fafb; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; }
        .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 10px 0; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
        .button { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; margin: 10px 5px 10px 0; }
        .button:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <h1>🔍 OAuth URL Test</h1>
      
      <div class="box">
        <h2>Redirect URI Being Used:</h2>
        <div class="url">${redirectUri}</div>
      </div>
      
      <div class="box">
        <h2>OAuth Parameters:</h2>
        ${Array.from(params.entries()).map(([key, value]) => `
          <div class="param">
            <strong>${key}:</strong> 
            <code>${key === 'redirect_uri' ? `<span style="color: #2563eb;">${value}</span>` : value}</code>
          </div>
        `).join('')}
      </div>
      
      <div class="box">
        <h2>Full OAuth URL:</h2>
        <div class="url">${oauthUrl}</div>
      </div>
      
      <div class="warning">
        <strong>⚠️ IMPORTANT:</strong> The redirect_uri above must EXACTLY match one of the URIs in your Reddit app settings.
      </div>
      
      <div class="box">
        <h2>Verification Steps:</h2>
        <ol>
          <li>Go to <a href="https://www.reddit.com/prefs/apps" target="_blank">https://www.reddit.com/prefs/apps</a></li>
          <li>Click on your app</li>
          <li>Check the <code>redirect uri</code> field</li>
          <li>It should contain: <code>${redirectUri}</code></li>
          <li>Make sure there are NO extra spaces, trailing slashes, or typos</li>
          <li>The URI must match EXACTLY (case-sensitive, including protocol)</li>
        </ol>
      </div>
      
      <div class="box">
        <h2>Test:</h2>
        <p><a href="/api/auth/start" class="button">Try Sign In (Actual OAuth Flow)</a></p>
        <p><a href="/api/auth/debug-redirect" class="button">View Debug Info</a></p>
      </div>
      
      <div class="box">
        <h2>Copy Redirect URI for Reddit Settings:</h2>
        <input type="text" value="${redirectUri}" readonly style="width: 100%; padding: 10px; font-family: monospace; font-size: 14px;" onclick="this.select()">
        <p><small>Click the field above and copy the URI, then paste it into your Reddit app settings.</small></p>
      </div>
    </body>
    </html>
  `);
};
