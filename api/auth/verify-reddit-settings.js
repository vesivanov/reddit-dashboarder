// Verification endpoint to help troubleshoot Reddit OAuth setup
module.exports = async function handler(req, res) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  
  // Construct redirect URI
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

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reddit OAuth Verification Checklist</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; max-width: 900px; margin: 0 auto; }
        .checklist { background: white; padding: 25px; border-radius: 8px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .item { padding: 15px; margin: 10px 0; border-left: 4px solid #3b82f6; background: #eff6ff; }
        .item.completed { border-left-color: #10b981; background: #d1fae5; }
        .item.error { border-left-color: #ef4444; background: #fee2e2; }
        .uri-box { background: #1f2937; color: #f9fafb; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 14px; margin: 10px 0; word-break: break-all; }
        .copy-btn { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        .copy-btn:hover { background: #1d4ed8; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 4px; }
        h1 { color: #1f2937; }
        h2 { color: #374151; margin-top: 0; }
        ol { padding-left: 20px; }
        li { margin: 8px 0; line-height: 1.6; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 10px 10px 10px 0; font-weight: 500; }
        .button:hover { background: #1d4ed8; }
        .button-secondary { background: #6b7280; }
        .button-secondary:hover { background: #4b5563; }
      </style>
    </head>
    <body>
      <h1>✅ Reddit OAuth Setup Verification</h1>
      
      <div class="checklist">
        <h2>📋 Step-by-Step Checklist</h2>
        
        <div class="item">
          <h3>Step 1: Verify Your Redirect URI</h3>
          <p><strong>Your app is using this redirect URI:</strong></p>
          <div class="uri-box" id="redirectUri">${redirectUri}</div>
          <button class="copy-btn" onclick="copyToClipboard('${redirectUri}')">Copy URI</button>
          <p style="margin-top: 10px;"><small>This URI is correctly formatted and ready to use.</small></p>
        </div>
        
        <div class="item">
          <h3>Step 2: Update Reddit App Settings</h3>
          <ol>
            <li>Go to <a href="https://www.reddit.com/prefs/apps" target="_blank"><strong>https://www.reddit.com/prefs/apps</strong></a></li>
            <li>Find your app (Client ID: <code>${clientId ? clientId.substring(0, 8) + '...' : 'NOT SET'}</code>)</li>
            <li>Click on it to edit</li>
            <li>Scroll to the <strong>"redirect uri"</strong> field</li>
            <li>Make sure it contains <strong>EXACTLY</strong> this (copy from above):</li>
          </ol>
          <div class="uri-box">${redirectUri}</div>
          <div class="warning">
            <strong>⚠️ CRITICAL:</strong>
            <ul style="margin: 10px 0 0 20px;">
              <li>If you need both local and production URIs, put them on <strong>separate lines</strong> or <strong>comma-separated</strong></li>
              <li><strong>NO semicolons</strong> - Reddit doesn't accept semicolons as separators</li>
              <li><strong>NO trailing slashes</strong> - Must end with <code>/callback</code> not <code>/callback/</code></li>
              <li><strong>NO extra spaces</strong> - Copy exactly as shown above</li>
              <li><strong>Case-sensitive</strong> - Must match exactly including <code>https://</code></li>
            </ul>
          </div>
        </div>
        
        <div class="item">
          <h3>Step 3: Verify App Type</h3>
          <p>Make sure your Reddit app is set as a <strong>"web app"</strong> (not "script" or "installed app").</p>
          <p>If it's not a web app, you may need to create a new app with the correct type.</p>
        </div>
        
        <div class="item">
          <h3>Step 4: Save and Wait</h3>
          <ol>
            <li>Click <strong>"update information"</strong> or <strong>"save"</strong> in Reddit</li>
            <li><strong>Wait 1-2 minutes</strong> for Reddit's servers to update</li>
            <li>Reddit's changes can take a moment to propagate</li>
          </ol>
        </div>
        
        <div class="item">
          <h3>Step 5: Test the OAuth Flow</h3>
          <p>After updating Reddit settings and waiting a minute:</p>
          <a href="/api/auth/start" class="button">🚀 Try Sign In Now</a>
          <a href="/api/auth/test-oauth-url" class="button button-secondary">View OAuth URL Details</a>
        </div>
      </div>
      
      <div class="checklist">
        <h2>🔍 Common Issues & Solutions</h2>
        
        <div class="item error">
          <h3>❌ "invalid redirect_uri parameter"</h3>
          <p><strong>Cause:</strong> The redirect URI in Reddit settings doesn't match exactly.</p>
          <p><strong>Solution:</strong></p>
          <ul>
            <li>Copy the URI from Step 1 above</li>
            <li>Paste it exactly into Reddit (no modifications)</li>
            <li>Make sure there are no semicolons, extra spaces, or trailing slashes</li>
            <li>Wait 1-2 minutes after saving</li>
          </ul>
        </div>
        
        <div class="item error">
          <h3>❌ "bad request" or "invalid request"</h3>
          <p><strong>Cause:</strong> Usually the same as above, or app type mismatch.</p>
          <p><strong>Solution:</strong> Follow all steps above, especially verifying app type is "web app".</p>
        </div>
        
        <div class="item">
          <h3>✅ Still Not Working?</h3>
          <p>If you've followed all steps and it still doesn't work:</p>
          <ol>
            <li>Double-check the redirect URI in Reddit matches <strong>exactly</strong> (character by character)</li>
            <li>Try creating a new Reddit app with the redirect URI set correctly from the start</li>
            <li>Clear your browser cache and cookies</li>
            <li>Try in an incognito/private window</li>
          </ol>
        </div>
      </div>
      
      <div class="success">
        <h3>✅ Current Configuration</h3>
        <ul>
          <li><strong>Redirect URI:</strong> <code>${redirectUri}</code></li>
          <li><strong>Client ID:</strong> <code>${clientId ? clientId.substring(0, 8) + '...' : 'NOT SET'}</code></li>
          <li><strong>Environment:</strong> ${host.includes('localhost') ? 'Local Development' : 'Production (Vercel)'}</li>
        </ul>
      </div>
      
      <script>
        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            alert('Copied to clipboard!');
          }).catch(err => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Copied to clipboard!');
          });
        }
      </script>
    </body>
    </html>
  `);
};
