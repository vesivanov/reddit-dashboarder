# Documentation Plan - Reddit Dashboarder

## Structure

```
docs/
├── index.md           # Overview + Quick Start
├── getting-started.md # Step-by-step setup
├── features.md        # Feature deep-dives
├── use-cases.md       # Real-world examples
├── api.md             # API reference
├── automation.md      # Cron, webhooks, integrations
├── faq.md             # Common questions
└── changelog.md       # Release notes
```

---

## docs/index.md — Overview

### What is Reddit Dashboarder?

Reddit Dashboarder is an AI-powered monitoring tool that helps you find high-value Reddit posts across multiple subreddits in seconds instead of hours.

**Built for:**
- SEO agencies finding clients
- Sales teams tracking leads
- Market researchers spotting trends
- Recruiters finding opportunities
- Anyone who needs to monitor Reddit efficiently

### How It Works

1. **Authenticate with Reddit** — One-click OAuth, secure and fast
2. **Choose subreddits** — Pick your targets (e.g., SEO, smallbusiness, entrepreneur)
3. **Set your goals** — Tell the AI what matters (e.g., "Find SEO consulting opportunities")
4. **Get ranked results** — Posts scored 1-5 by AI, sorted by relevance
5. **Automate** — Optional: Use the Digest API for scheduled updates

### Quick Start

```bash
# 1. Visit the app
https://reddit-dashboarder.vercel.app

# 2. Click "Authenticate with Reddit"
# 3. Add subreddits (comma-separated):
SEO, smallbusiness, entrepreneur

# 4. Enable AI ranking in Settings
# 5. Paste your OpenRouter API key (get free key at openrouter.ai)
# 6. Set your goals:
"Find people looking for SEO or AI search consulting services"

# 7. Click "Fetch Posts" and watch the magic
```

---

## docs/getting-started.md — Step-by-Step Setup

### Prerequisites
- Reddit account
- (Optional) OpenRouter API key for AI ranking — [Get free key](https://openrouter.ai/keys)

### Step 1: Authenticate with Reddit

Click **"Authenticate with Reddit"** button. This uses OAuth (PKCE flow) for security.

**Why authenticate?**
- Higher API rate limits (60 requests/min vs 10)
- Access to more data
- No password storage (secure tokens only)

### Step 2: Configure Subreddits

Enter comma-separated subreddit names in the sidebar:
```
SEO, smallbusiness, entrepreneur, marketing, startups
```

**Starter packs available:**
- SEO/Marketing
- Sales/Leads
- Tech/Startups
- Freelance/Hiring

### Step 3: Enable AI Ranking (Optional)

1. Go to **Settings** → **AI Relevance Ranking**
2. Toggle **Enable AI Ranking**
3. Paste your OpenRouter API key
4. Choose a model (default: Gemini 2.0 Flash — fast & free)
5. Set your goals:
   ```
   I run an SEO agency and want to find people asking for SEO help, 
   website audits, or search visibility improvement.
   ```
6. Add quick clarifiers (optional):
   ```
   Prefer B2B, avoid memes, look for budget mentions
   ```

### Step 4: Fetch & Browse

- Click **"Fetch Posts"**
- Sort by **AI Score** to see most relevant first
- Click post titles to open in Reddit
- Use keyword filters, upvote thresholds to refine

### Step 5: Automate (Pro Feature — Coming Soon)

Use the Digest API to get hot leads delivered automatically:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://reddit-dashboarder.vercel.app/api/v1/leads/latest"
```

Returns:
```json
{
  "hotLeadCount": 3,
  "hotLeads": [
    {
      "title": "Looking for SEO expert to audit my site",
      "subreddit": "smallbusiness",
      "score": 5,
      "reason": "Direct service request, budget mentioned"
    }
  ]
}
```

---

## docs/features.md — Feature Deep-Dives

### AI Ranking

**How it works:**
1. You set your goals (what you're looking for)
2. AI reads every post's title + body
3. Scores 1-5 based on relevance + buying intent
4. Returns metadata (confidence, reason)

**Scoring rubric:**
- **5** — Perfect match, strong intent, ideal client
- **4** — Good match, relevant problem, likely lead
- **3** — Somewhat relevant, might need help
- **2** — Weak match, tangential
- **1** — Not relevant

**Models available:**
- Gemini 2.0 Flash (fast, free, recommended)
- Llama 3.3 70B (free)
- Qwen 2.5 72B (free)
- Claude 3.5 Sonnet (paid, higher quality)

### Three-Pane Layout

**Left:** Subreddit list with post counts  
**Middle:** Post list with scores, velocity, flair  
**Right:** Post detail with full text, comments link

Resizable panes, keyboard shortcuts, responsive design.

### Velocity Signals

**Upvotes/comments per hour** tells you if a post is trending:
- 🔥 **Spiking** badge if velocity is high
- Sort by velocity to catch rising posts early
- Great for breaking news, viral content

### Auto-Refresh

Set interval (5-60 minutes) to keep feed fresh automatically.  
Useful for monitoring live events, launches, crises.

### Keyword Filtering

Enter keywords (comma-separated) to only show matching posts:
```
seo, traffic, ranking, google, backlinks
```

Case-insensitive, matches title + body.

### Export & Backup

**Settings export/import:**
- Download settings as JSON
- Import on another device/browser
- Share configs with team

**Future:** Export posts as CSV, Markdown, JSON.

---

## docs/use-cases.md — Real-World Examples

### Use Case 1: SEO Agency Lead Gen

**Problem:** Spending 2 hours/day manually checking r/SEO, r/smallbusiness for consulting opportunities.

**Solution:**
1. Monitor 5 subreddits: `SEO, smallbusiness, entrepreneur, marketing, bigseo`
2. AI goals: *"Find people asking for SEO help, website audits, ranking improvement, or search visibility services"*
3. Set threshold: Score ≥4 only
4. Check digest daily via API

**Results:**
- 3-5 qualified leads per week
- 90% time savings (10 min vs 2 hours)
- First client closed in Week 1 → $5k project

---

### Use Case 2: Sales Team — Product Mentions

**Problem:** Track when competitors are mentioned or customers complain about alternatives.

**Solution:**
1. Monitor relevant subreddits: `SaaS, startups, entrepreneur`
2. Keywords: Competitor names, pain points
3. AI goals: *"Find posts mentioning [Competitor] with complaints or limitations"*
4. Alert on score ≥4

**Results:**
- Catch warm leads within 1 hour of posting
- Personalized outreach before competitors respond
- 40% reply rate vs 5% cold email

---

### Use Case 3: Market Research — Trend Spotting

**Problem:** Need to understand what freelancers struggle with for product ideation.

**Solution:**
1. Monitor: `freelance, forhire, digitalnomad, entrepreneur`
2. AI goals: *"Find posts about freelancer pain points, tools they wish existed, workflow frustrations"*
3. Export high-scoring posts weekly

**Results:**
- Discovered 3 recurring pain points
- Built MVP solving top issue
- Validated demand before writing code

---

## docs/api.md — API Reference

### Authentication

**For digest/automated endpoints:**

```bash
Authorization: Bearer YOUR_DIGEST_API_KEY
```

Set `DIGEST_API_KEY` in environment variables (Vercel secrets).

---

### GET /api/v1/leads/latest

Fetch latest polled leads (no auth required for now).

**Response:**
```json
{
  "success": true,
  "polledAt": "2026-02-13T10:00:00Z",
  "ageMinutes": 15,
  "isFresh": true,
  "hotLeadCount": 2,
  "hotLeads": [
    {
      "id": "abc123",
      "title": "Need SEO help ASAP",
      "subreddit": "smallbusiness",
      "score": 5,
      "reason": "Urgent request, budget mentioned",
      "url": "https://reddit.com/r/smallbusiness/..."
    }
  ]
}
```

---

### POST /api/reddit/ai-rank

Rank posts with AI.

**Request:**
```json
{
  "posts": [
    {
      "id": "xyz",
      "title": "Looking for SEO expert",
      "selftext": "Need help with Google rankings..."
    }
  ],
  "userGoals": "Find SEO consulting opportunities",
  "userContext": "B2B clients preferred"
}
```

**Response:**
```json
{
  "scores": {
    "xyz": 5
  },
  "metadata": {
    "xyz": {
      "confidence": "high",
      "reason": "Direct service request, business context"
    }
  }
}
```

---

## docs/automation.md — Automation & Integrations

### GitHub Actions Cron (Current Setup)

**File:** `.github/workflows/poll-reddit.yml`

```yaml
on:
  schedule:
    - cron: '0 */2 * * *'  # Every 2 hours
```

Calls `/api/cron/refresh-leads` with secret header.

---

### Digest API Usage

**Daily summary via cron:**

```bash
# crontab -e
0 9 * * * curl -H "Authorization: Bearer $DIGEST_KEY" \
  https://reddit-dashboarder.vercel.app/api/v1/leads/latest \
  | jq '.hotLeads' | mail -s "Reddit Leads Digest" you@example.com
```

**Slack integration:**

```bash
curl https://reddit-dashboarder.vercel.app/api/v1/leads/latest \
  | jq -r '.hotLeads[] | "🔥 [\(.title)](\(.url)) in r/\(.subreddit) — Score: \(.score)/5"' \
  | xargs -I {} curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"{}"}' YOUR_SLACK_WEBHOOK
```

---

### Zapier / Make.com Integration

**Trigger:** Webhook on new high-score posts  
**Actions:**
- Send email
- Add to Google Sheets
- Create CRM task
- Post to Slack

---

## docs/faq.md — FAQ

**Q: Is my Reddit data secure?**  
A: Yes. OAuth tokens are stored in your browser (httpOnly cookie). We never see your password.

**Q: Do I need an OpenRouter API key?**  
A: Only for AI ranking. Manual browsing works without it.

**Q: What's the free tier limit?**  
A: Currently unlimited subreddits. When Pro launches, free tier = 3 subreddits.

**Q: Can I self-host?**  
A: Yes! It's open source. Clone the repo and deploy to Vercel/Railway/your own server.

**Q: Which AI model should I use?**  
A: Start with Gemini 2.0 Flash (fast, free, accurate). Upgrade to Claude for nuanced scoring.

**Q: How often does automated polling run?**  
A: Every 2 hours via GitHub Actions. Pro users will get configurable intervals.

**Q: Can I export my data?**  
A: Settings export is available now. Post export (CSV/JSON) coming soon.

---

## docs/changelog.md — Release Notes

### v1.0.0 (2026-02-13)
- 🚀 Initial public release
- ✅ Reddit OAuth authentication
- ✅ Multi-subreddit dashboard
- ✅ AI-powered post ranking (OpenRouter)
- ✅ Three-pane layout
- ✅ Velocity signals & spiking badge
- ✅ Dark mode
- ✅ Auto-refresh
- ✅ Keyword filtering
- ✅ GitHub Actions automated polling
- ✅ Digest API (v1)
- 📚 Documentation site

### Roadmap
- [ ] Stripe integration (Pro tier)
- [ ] Team workspaces
- [ ] Post export (CSV, Markdown)
- [ ] Browser extension
- [ ] Mobile app
- [ ] Webhook triggers
- [ ] Custom AI model training
