# AI Agent Guide for Reddit Dashboarder

This guide explains how AI agents (like Rudi) can collaborate with users through the Reddit Dashboarder sync API.

## Overview

The Reddit Dashboarder provides a simple, stateless sync mechanism for AI agents to:
1. Access user's current Reddit data and settings
2. Identify hot leads (high-opportunity posts)
3. Provide recommendations for outreach 

## API Endpoints ..

### GET `/api/sync/:token`

Retrieve the user's current dashboard data including hot leads analysis.

**Response:**
```json
{
  "success": true,
  "token": "abc123...",
  "syncedAt": "2026-02-10T14:30:00Z",
  "expiresAt": "2026-02-11T14:30:00Z",
  "data": {
    "posts": [...],
    "settings": {
      "subs": ["smallbusiness", "SEO", "startups"],
      "aiGoals": "Find leads for SEO consulting",
      ...
    },
    "filters": {...},
    "timestamp": "2026-02-10T14:25:00Z"
  },
  "analysis": {
    "hotLeads": [
      {
        "id": "t3_abc123",
        "title": "Looking for SEO help for my e-commerce site",
        "subreddit": "smallbusiness",
        "score": 45,
        "num_comments": 12,
        "age_hours": 3.5,
        "url": "https://reddit.com/r/smallbusiness/comments/abc123/...",
        "hot_score": 18,
        "signals": ["intent: looking for, help", "service match: seo, marketing", "fresh (< 24h)", "active discussion"],
        "match_reason": "Intent detected + service match"
      }
    ],
    "totalPosts": 150,
    "hotLeadCount": 8
  }
}
```

### POST `/api/sync`

Store dashboard data (called by frontend). Not typically used by AI agents.

### DELETE `/api/sync/:token`

Clear stored data. Called when user wants to revoke AI access.

## Hot Leads Scoring

The API automatically identifies "hot leads" - posts with high potential value based on:

| Signal | Weight | Description |
|--------|--------|-------------|
| Intent keywords | 2x per match | "looking for", "need", "hire", "budget" |
| Service match | 3x per match | "seo", "search", "marketing", "traffic" |
| Freshness | 2-5 pts | < 24h = 5pts, < 48h = 2pts |
| Upvote velocity | 3 pts | > 10 upvotes/hour |
| Discussion activity | 3 pts | > 2 comments/hour |
| High engagement | 2-4 pts | Score > 50, Comments > 10 |
| AI relevance | 5 pts | User's AI scoring >= 4/5 |

**Threshold:** Score >= 8 to be considered a "hot lead"

## Workflow for AI Agents

### 1. Receive Token from User

User clicks "Sync with AI" in the dashboard. Token is copied to clipboard.

### 2. Fetch Data

```bash
curl https://reddit-dashboarder.vercel.app/api/sync/TOKEN_HERE
```

### 3. Analyze Hot Leads

Focus on leads with:
- High `hot_score` (15+)
- Fresh posts (`age_hours` < 12)
- Strong intent signals
- Service relevance

### 4. Report to User

Provide a summary like:

> **🔥 Hot Leads Found: 8**
> 
> **Top 3:**
> 1. "Looking for SEO help..." (r/smallbusiness, 3.5h ago, score: 18)
>    - Signals: Intent detected, service match, fresh, active discussion
> 2. "E-commerce traffic dropped 50%..." (r/SEO, 5h ago, score: 16)
> 3. "Need consultant for site audit..." (r/startups, 2h ago, score: 15)
>
> **Recommendation:** Focus outreach on posts #1 and #3 - both show urgent intent and are very fresh.

## Example Integration

```javascript
async function checkForLeads(token) {
  const response = await fetch(`/api/sync/${token}`);
  if (!response.ok) throw new Error('Sync failed');
  
  const { analysis } = await response.json();
  
  // Filter for very hot leads
  const veryHot = analysis.hotLeads.filter(l => l.hot_score >= 15 && l.age_hours < 6);
  
  if (veryHot.length > 0) {
    // Notify user of high-priority opportunities
    notifyUserOfHotLeads(veryHot);
  }
  
  return analysis;
}
```

## Best Practices

1. **Check regularly but not excessively** - Every 30-60 minutes is sufficient
2. **Respect expiry** - Tokens expire after 24h; users must re-sync
3. **Focus on quality** - Prioritize leads with hot_score >= 15 for immediate attention
4. **Consider timing** - Fresh posts (< 6h) have higher response rates
5. **Match user goals** - Check `settings.aiGoals` to align recommendations

## Token Lifecycle

1. **Created:** When user clicks "Sync with AI"
2. **Active:** 24 hours from creation
3. **Expired:** Returns 410 Gone
4. **Revoked:** User can delete at any time

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process data |
| 404 | Token not found | Ask user to re-sync |
| 410 | Token expired | Ask user to re-sync |
| 500 | Server error | Retry with backoff |
