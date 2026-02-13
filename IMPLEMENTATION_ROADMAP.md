# Implementation Roadmap — Reddit Dashboarder Polish & Launch

## Phase 1: Fix Polling (Today) ✅

**Your tasks:**
```bash
cd reddit-dashboarder
vercel login
vercel link --yes
vercel storage add kv
vercel --prod
```

**My tasks:**
- ✅ Document the issue
- ✅ Provide clear instructions
- Test automated polling after KV is live

**Success criteria:**
- `/api/v1/leads/latest` returns real data
- GitHub Actions cron runs every 2 hours
- Data persists between runs

---

## Phase 2: Landing Page (Next 2-3 days)

### Option A: Banner on Existing Dashboard
Add hero section above the dashboard in `index.html`:

```html
<!-- Insert this BEFORE the existing app div -->
<div id="landing-hero" class="...">
  <!-- Copy from landing-copy.md -->
</div>

<!-- Existing dashboard -->
<div id="app">...</div>
```

**Pros:**
- Fast (1-2 hours)
- Same domain, no new deploys
- Users can try it immediately

**Cons:**
- Mixed experience (marketing + product)
- Hard to A/B test

### Option B: Separate Landing Page (Recommended)
Create `landing.html` as static page:

```
reddit-dashboarder.vercel.app        → landing.html (marketing)
reddit-dashboarder.vercel.app/app    → index.html (dashboard)
```

**Pros:**
- Clean separation
- Better SEO
- Easier to iterate on copy
- Can add analytics/heatmaps

**Cons:**
- Slightly more work (3-4 hours)

**Routing in `vercel.json`:**
```json
{
  "routes": [
    { "src": "/app", "dest": "/index.html" },
    { "src": "/", "dest": "/landing.html" },
    { "src": "/api/(.*)", "dest": "/api/index.js" }
  ]
}
```

### Landing Page Sections (Priority Order)
1. **Hero** — Headline, subheading, CTA
2. **Value props** — 3 columns (AI, Speed, Lead Gen)
3. **How it works** — 5 steps
4. **Social proof** — Use cases / testimonials
5. **CTA** — "Start free now"
6. **Footer** — Links, email capture

---

## Phase 3: Documentation Site (Next 3-5 days)

### Structure
```
docs/
├── index.html         # Docs home (overview)
├── getting-started/   # Step-by-step setup
├── features/          # Feature deep-dives
├── api/               # API reference
├── use-cases/         # Real examples
└── faq/               # Common questions
```

### Tech Stack Options

**Option A: Simple Static HTML**
- Each doc = one HTML file
- Shared header/footer via includes or copy-paste
- Deploy to `/docs` subdirectory

**Pros:** Simple, fast, no build step  
**Cons:** Manual navigation, no search

**Option B: VitePress / Docusaurus**
- Markdown files → static site
- Built-in navigation, search, themes

**Pros:** Professional, easy to maintain  
**Cons:** Learning curve, build step

**Recommendation:** Start with Option A (HTML), migrate to VitePress later if needed.

---

## Phase 4: Email Capture for "Notify Me" (1-2 hours)

### Simple Serverless Function

**File:** `api/notify-me.js`

```javascript
const { withCORS } = require('../lib/cors');
const storage = require('../lib/storage');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return withCORS(req, res).status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return withCORS(req, res).status(400).json({ error: 'Invalid email' });
  }

  try {
    // Get existing waitlist
    const waitlist = (await storage.get('pro-waitlist')) || [];
    
    // Add email if not already there
    if (!waitlist.includes(email)) {
      waitlist.push(email);
      await storage.set('pro-waitlist', waitlist);
    }

    // Also send to your email for immediate notification
    // (Optional: Use SendGrid, Resend, or Mailgun)

    return withCORS(req, res).status(200).json({
      success: true,
      message: 'Thanks! We'll notify you when Pro launches.'
    });
  } catch (error) {
    console.error('[notify-me] Error:', error);
    return withCORS(req, res).status(500).json({ error: 'Failed to save email' });
  }
}

module.exports = handler;
```

**Frontend form:**
```html
<form id="waitlist-form">
  <input type="email" id="email-input" placeholder="your@email.com" required>
  <button type="submit">Notify Me</button>
</form>

<script>
document.getElementById('waitlist-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email-input').value;
  
  const res = await fetch('/api/notify-me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  const data = await res.json();
  alert(data.message || data.error);
});
</script>
```

---

## Phase 5: Polish & SEO (2-3 days)

### SEO Essentials
- [ ] Meta tags (title, description, OG image)
- [ ] Sitemap.xml
- [ ] robots.txt
- [ ] Schema.org markup (SoftwareApplication)
- [ ] Google Analytics / Plausible

### Performance
- [ ] Optimize images (WebP, lazy loading)
- [ ] Minify CSS/JS
- [ ] Add Vercel Analytics

### Accessibility
- [ ] Semantic HTML
- [ ] ARIA labels
- [ ] Keyboard navigation
- [ ] Color contrast (WCAG AA)

---

## Phase 6: First 10 Customers (1-2 weeks)

### Distribution Channels

**1. Reddit (Dogfooding)**
- Post on r/SEO: "I built a tool to find Reddit leads 10x faster (free for now)"
- r/SaaS: Show/tell post with screenshots
- r/Entrepreneur: "How I automated my client prospecting with AI"
- Include your own success story (leads you found)

**2. Hacker News**
- Title: "Show HN: AI-powered Reddit monitoring for lead generation"
- Post on Saturday morning PT for best visibility
- Be active in comments, answer questions

**3. Product Hunt**
- Launch as "Reddit Dashboarder – Find leads 10x faster with AI"
- Maker story: "I was wasting 10 hours/week on Reddit prospecting..."
- Prepare screenshots, video demo, first comment

**4. Twitter/X**
- Thread: "I spent 2 hours daily checking Reddit for leads. Built this tool, now it takes 5 minutes. Here's how it works..."
- Tag relevant accounts (@naval, @levelsio if relevant)
- Use your @severeight account

**5. LinkedIn**
- Post case study: "How I found 3 clients in a week using Reddit + AI"
- Target SEO professionals, agency owners
- Share in relevant groups

**6. Cold Outreach (Targeted)**
- Find SEO agencies on Clutch, Upwork
- Email: "Hey [Name], noticed you're active on r/SEO. Built a tool that might save you 10 hours/week..."
- Offer free setup call

---

## Success Metrics

### Week 1
- [ ] 100 unique visitors
- [ ] 10 signups (Reddit OAuth)
- [ ] 5 active users (used it 3+ times)
- [ ] 20 waitlist emails

### Week 2
- [ ] 500 unique visitors
- [ ] 50 signups
- [ ] 20 active users
- [ ] 100 waitlist emails
- [ ] First paying customer (if Pro launches)

### Month 1
- [ ] 2,000 unique visitors
- [ ] 200 signups
- [ ] 50 active users
- [ ] 10 paying customers ($290 MRR)

---

## Next Steps (Right Now)

1. **You:** Set up Vercel KV (5 min)
2. **Me:** Test automated polling, verify data persists
3. **Together:** Choose landing page approach (A or B)
4. **Me:** Build landing page (2-3 hours)
5. **You:** Review, give feedback
6. **Me:** Build docs site skeleton (4-6 hours)
7. **Me:** Build email capture endpoint (1 hour)
8. **Together:** Launch plan (Reddit, HN, PH)

---

## Questions for You

1. **Landing page:** Option A (banner on dashboard) or B (separate landing.html)?
2. **Docs:** Simple HTML or VitePress?
3. **Testimonials:** Can I use your own usage as the first case study?
4. **Pricing:** Still thinking $29/mo for Pro, or different?
5. **Pro features:** Which should be paywalled? (AI, digest API, unlimited subs?)

Let me know and I'll start building! 🚀
