// Debug endpoint to show what redirect URI is being constructed
module.exports = async function handler(req, res) {
  // Construct redirect URI the same way start.js does
  // If REDDIT_REDIRECT_URI contains a comma (multiple URIs), ignore it and construct dynamically
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
  // Remove trailing slash from APP_BASE_URL if present
  baseUrl = baseUrl.replace(/\/+$/, '');
  let redirectUri = `${baseUrl}/api/auth/callback`;
  
  // If REDDIT_REDIRECT_URI is set and is a single URI (not comma-separated), use it as override
  // But only if it matches the current request context
  const envRedirectUri = process.env.REDDIT_REDIRECT_URI;
  if (envRedirectUri && !envRedirectUri.includes(',')) {
    try {
      const envUri = envRedirectUri.trim().replace(/\/+$/, '');
      const envUrl = new URL(envUri);
      const currentHost = host.toLowerCase();
      const envHost = envUrl.host.toLowerCase();
      
      // Only use env var if it matches the current host
      if (envHost === currentHost || (envHost === 'localhost:3000' && currentHost === 'localhost:3000')) {
        redirectUri = envUri;
      }
    } catch (e) {
      // Invalid URL in env var, use dynamically constructed one
    }
  }
  
  // Normalize: remove trailing slashes and ensure proper format
  redirectUri = redirectUri.trim().replace(/\/+$/, '');
  
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Redirect URI Debug</title>
      <style>
        body { font-family: monospace; padding: 20px; background: #f5f5f5; }
        .box { background: white; padding: 20px; border-radius: 8px; margin: 10px 0; }
        .uri { font-size: 18px; color: #2563eb; font-weight: bold; word-break: break-all; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; }
        .info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 10px 0; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>🔍 Redirect URI Debug Information</h1>
      
      <div class="box">
        <h2>Constructed Redirect URI:</h2>
        <div class="uri">${redirectUri}</div>
      </div>
      
      <div class="warning">
        <strong>⚠️ IMPORTANT:</strong> This URI must EXACTLY match one of the URIs in your Reddit app settings.
      </div>
      
      <div class="box">
        <h2>Request Details:</h2>
        <ul>
          <li><strong>Host:</strong> ${req.headers.host || 'N/A'}</li>
          <li><strong>X-Forwarded-Host:</strong> ${req.headers['x-forwarded-host'] || 'N/A'}</li>
          <li><strong>X-Forwarded-Proto:</strong> ${req.headers['x-forwarded-proto'] || 'N/A'}</li>
          <li><strong>Protocol detected:</strong> ${redirectUri.startsWith('https') ? 'https' : 'http'}</li>
          <li><strong>REDDIT_REDIRECT_URI env:</strong> ${process.env.REDDIT_REDIRECT_URI || 'Not set (using dynamic construction)'}</li>
          <li><strong>REDDIT_REDIRECT_URI contains comma:</strong> ${process.env.REDDIT_REDIRECT_URI && process.env.REDDIT_REDIRECT_URI.includes(',') ? 'YES (will be ignored, using dynamic construction)' : 'NO'}</li>
          <li><strong>APP_BASE_URL env:</strong> ${process.env.APP_BASE_URL || 'Not set'}</li>
          <li><strong>Constructed from:</strong> ${process.env.REDDIT_REDIRECT_URI && !process.env.REDDIT_REDIRECT_URI.includes(',') ? 'Environment variable (single URI)' : 'Dynamic construction from request headers'}</li>
        </ul>
      </div>
      
      <div class="info">
        <h3>📝 How to Fix:</h3>
        <ol>
          <li>Go to <a href="https://www.reddit.com/prefs/apps" target="_blank">https://www.reddit.com/prefs/apps</a></li>
          <li>Click on your app to edit it</li>
          <li>In the <code>redirect uri</code> field, enter:</li>
          <ul>
            <li><code>http://localhost:3000/api/auth/callback</code> (for local development)</li>
            <li><code>https://reddit-dashboarder.vercel.app/api/auth/callback</code> (for production)</li>
          </ul>
          <li><strong>Use NEWLINES or COMMAS to separate them, NOT semicolons</strong></li>
          <li>Make sure there are NO trailing slashes, extra spaces, or typos</li>
          <li>The URI above (in green) must match one of these EXACTLY</li>
        </ol>
      </div>
      
      <div class="box">
        <h2>Test:</h2>
        <p><a href="/api/auth/start">Try signing in again</a></p>
      </div>
    </body>
    </html>
  `);
};
