# Vercel Deployment Debugging Guide

This guide will help you debug your Reddit Dashboard deployment on Vercel.

## Quick Debugging Steps

### 1. Test Health Check Endpoint
First, test if your deployment is working at all:
```bash
# Replace YOUR_VERCEL_URL with your actual Vercel deployment URL
curl https://YOUR_VERCEL_URL/api/health
```

### 2. Test Simple Reddit API Call
Test if the Reddit API connectivity works:
```bash
# Test with default subreddit (programming)
curl https://YOUR_VERCEL_URL/api/test

# Test with a specific subreddit
curl "https://YOUR_VERCEL_URL/api/test?sub=technology"
```

### 3. Test Main Reddit API Endpoint
Test your main API with minimal parameters:
```bash
# Simple test with one subreddit
curl "https://YOUR_VERCEL_URL/api/reddit?subs=programming&limit=5&max_pages=1"
```

### 4. Check Vercel Logs
View real-time logs from your deployment:
```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Login to Vercel (if not already logged in)
vercel login

# View live logs
vercel logs --follow

# Or view recent logs
vercel logs
```

### 5. Local Testing
Test your functions locally before deploying:
```bash
# Install dependencies
npm install

# Start local development server
vercel dev

# Test endpoints locally:
# http://localhost:3000/api/health
# http://localhost:3000/api/test
# http://localhost:3000/api/reddit?subs=programming&limit=5
```

## Common Issues and Solutions

### Issue 1: Function Timeout
**Symptoms:** Request hangs or times out after 30 seconds
**Solution:** 
- Check the logs for which Reddit API call is hanging
- Reduce `max_pages` parameter (try 1-2 pages first)
- Reduce number of subreddits in the request

### Issue 2: Rate Limiting
**Symptoms:** "Rate limited by Reddit" or "Too Many Requests" errors
**Solution:**
- Wait a few minutes between requests
- Reduce the number of concurrent requests
- Consider implementing exponential backoff

### Issue 3: CORS Issues
**Symptoms:** Browser shows CORS errors in console
**Solution:**
- Check that CORS headers are being set correctly
- Verify the Vercel configuration includes proper headers

### Issue 4: Invalid JSON Response
**Symptoms:** "Invalid JSON body" errors
**Solution:**
- Check if Reddit is returning HTML error pages instead of JSON
- Look at the response body preview in logs

## Debugging with Browser DevTools

1. Open your deployed site in a browser
2. Open Developer Tools (F12)
3. Go to the Network tab
4. Try to fetch data using the dashboard
5. Look for failed requests and examine:
   - Status codes
   - Response headers
   - Response body
   - Console errors

## Environment Variables Check

Your deployment should have these environment variables available:
- `VERCEL=1` (automatically set by Vercel)
- `VERCEL_ENV` (preview, production, or development)
- `VERCEL_REGION` (deployment region)

Check these in the health endpoint response.

## Log Analysis

Look for these patterns in your Vercel logs:

### Success Patterns:
```
=== API Request Started ===
fetchJSON: Successfully parsed JSON for https://www.reddit.com/r/programming/about.json
=== API Request Completed Successfully ===
```

### Error Patterns:
```
fetchJSON: All 3 attempts failed for https://...
Rate limited by Reddit: ...
=== API Request Failed ===
```

## Next Steps

1. Run through the debugging steps above
2. Check the logs for specific error messages
3. Start with simple requests (1 subreddit, 1 page)
4. Gradually increase complexity once basic functionality works

If you're still having issues, share the output from the health check and test endpoints, along with any error messages from the Vercel logs.
