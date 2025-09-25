// Simple test endpoint to debug Reddit API connectivity
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

export default async function handler(req, res) {
  console.log('=== Test Endpoint Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);
  console.log('Timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return withCORS(res).status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(res).status(405).json({ error: 'Method not allowed' });
  }

  const { sub = 'programming' } = req.query;
  
  try {
    console.log(`Testing Reddit API with subreddit: ${sub}`);
    
    // Test a simple Reddit API call
    const testUrl = `https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`;
    console.log(`Making test request to: ${testUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(testUrl, {
      headers: { 'User-Agent': UA },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log(`Test response: ${response.status} ${response.statusText}`);
    
    const text = await response.text();
    console.log(`Response body length: ${text.length} chars`);
    console.log(`Response body preview: ${text.slice(0, 200)}...`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    
    // Try to parse JSON
    let jsonData;
    try {
      jsonData = JSON.parse(text);
      console.log('Successfully parsed JSON response');
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError.message);
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }
    
    // Extract some basic info
    const subredditData = jsonData?.data;
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      subreddit: sub,
      testUrl,
      responseStatus: response.status,
      responseSize: text.length,
      data: {
        name: subredditData?.display_name,
        title: subredditData?.title,
        subscribers: subredditData?.subscribers,
        active_users: subredditData?.active_user_count || subredditData?.accounts_active,
        created: subredditData?.created_utc,
        description: subredditData?.public_description?.slice(0, 100)
      }
    };
    
    console.log('Test completed successfully:', result);
    return withCORS(res).status(200).json(result);
    
  } catch (error) {
    console.error('Test failed:', error);
    
    const errorResult = {
      success: false,
      timestamp: new Date().toISOString(),
      subreddit: sub,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    };
    
    return withCORS(res).status(500).json(errorResult);
  }
}
