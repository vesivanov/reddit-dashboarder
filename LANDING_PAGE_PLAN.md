# Landing Page Plan - Reddit Dashboarder

## Hero Section
**Headline:** Find Reddit Leads 10x Faster with AI  
**Subheading:** Stop wasting hours scrolling through subreddits. Get AI-ranked posts that match your business goals, delivered automatically.

**CTA:** Try it Free (Auth with Reddit button)

**Visual:** Screenshot of the dashboard showing AI-ranked posts with scores

---

## Problem (Pain Points)
- "I spend 2+ hours daily checking Reddit for leads"
- "I miss high-quality posts because they're buried in noise"
- "Manual prospecting doesn't scale"
- "Reddit's native tools are terrible for monitoring multiple subreddits"

---

## Solution (How It Works)
1. **Connect Your Reddit** — Secure OAuth, higher API limits
2. **Set Your Goals** — Tell the AI what you're looking for (clients, trends, mentions)
3. **Get Ranked Results** — AI scores every post 1-5 based on relevance
4. **Automate Everything** — Digest API delivers hot leads via cron/webhooks

---

## Key Features

### For Manual Users (Free Tier)
- ✅ Multi-subreddit dashboard
- ✅ Keyword filtering
- ✅ Velocity signals (upvotes/hour)
- ✅ Dark mode, auto-refresh
- ✅ Three-pane layout

### For Pro Users
- 🤖 **AI Ranking** — Gemini 2.0 Flash scores posts by relevance to your goals
- 📊 **Automated Polling** — Background fetch every 2 hours
- 🔌 **Digest API** — Integrate with Slack, email, your own tools
- ⚡ **Priority Support** — Direct help when you need it

---

## Use Cases

### SEO Agencies
*"I found 3 paying clients in the first week"*  
Monitor r/SEO, r/smallbusiness, r/entrepreneur for people asking for SEO help.

### Sales Teams
*"Our outbound team gets 5-10 warm leads daily"*  
Track product mentions, competitor complaints, buying intent signals.

### Market Researchers
*"Replaced 3 hours of manual work with a 5-minute digest"*  
Monitor industry trends, customer pain points, emerging topics.

### Recruiters
*"Spotted hiring posts 2 hours after they were posted"*  
Track job postings, freelance opportunities, talent searches.

---

## Pricing (Teaser — No Stripe Yet)

**Free Forever**
- Manual dashboard
- 3 subreddits
- No AI ranking
- Community support

**Pro (Coming Soon)**
- Everything in Free
- Unlimited subreddits
- AI ranking (OpenRouter models)
- Automated polling
- Digest API
- Priority support
- **$29/month** (early bird price)

**Notify me when Pro launches** → Email capture form

---

## Social Proof (To Build)
- Screenshots of real leads found
- Testimonials (start with Ves's own usage)
- "Used by SEO agencies, sales teams, and indie hackers"

---

## Footer
- GitHub repo link
- Documentation
- API docs
- Contact/Support
- Privacy policy (simple: "We don't store your data. OAuth tokens live in your browser.")

---

## Technical Notes
- **No backend authentication needed yet** — Reddit OAuth handles it
- **Landing page = static HTML** — Can be the existing index.html with a banner at top
- **Email capture** — Simple Vercel serverless function → stores in KV or sends to your email
- **Deploy** — Same domain, just add messaging about "coming soon" features
