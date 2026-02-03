# Reddit Dashboard

A powerful, feature-rich Reddit dashboard for efficiently browsing multiple subreddits with AI-powered post ranking, OAuth authentication, and a three-pane interface.

## 🧭 Vision / North Star

Reddit has real signal, but it doesn’t scale across multiple subreddits—the cost is attention. Reddit Dashboard is a triage cockpit: it turns a noisy stream into a prioritized queue you can skim quickly, open what matters, and decide the next action (reply, save, research, share, ignore) — then move on.

Definition: “What matters” = posts that match my intent and clear my action threshold (fresh enough + enough context + enough engagement).

Success looks like:

Review watched subreddits in under 10 minutes

Surface a short list of posts worth acting on

Trust the ordering enough to use it daily

## ✨ Features

- **🔐 Reddit OAuth Authentication**: Secure PKCE-based authentication for higher API rate limits
- **🤖 AI-Powered Ranking**: Uses OpenRouter API to rank posts by relevance to your goals (user or server API key)
- **📊 Three-Pane Dashboard**: Subreddit list, post list, and post detail views (React + Tailwind, `index.html` SPA)
- **🔒 Secure API Key Storage**: OpenRouter key can be stored in an HttpOnly signed cookie via `/api/settings/openrouter-key`
- **🌙 Dark Mode**: Dark/light theme with system preference detection
- **⚡ Auto-Refresh**: Configurable intervals (5–60 minutes)
- **🔍 Filtering**: Keywords, min upvotes/comments, time range, days
- **⚡ Velocity Signal**: Upvotes/comments per hour with "spiking" badge + velocity sorting
- **💾 Persistent Settings**: Subreddits and preferences in `localStorage` with backup/restore
- **🔌 Settings API**: Import/export settings via `/api/settings/import` for AI agents and automation
- **📱 Responsive Design**: Works on desktop and mobile
- **🚀 Deploy Anywhere**: Vercel, Cloudflare Workers, or local Express
- **🤖 Agent/Automation Ready**: Headless digest endpoint and settings API for bots and cron jobs

## 🎯 Final Vision

Reddit Dashboard aims to be the **one place to skim, filter, and act on Reddit**—for work (leads, trends, SEO) or personal use (learning, discovery).

- **One dashboard for many subs**: Aggregate and rank posts across any set of subreddits without tab-switching or manual checks.
- **AI that adapts to you**: Goals-based relevance scoring via OpenRouter so the feed reflects what you care about, with multiple models and secure, user-controlled or server-side API keys.
- **Deploy anywhere**: Same codebase on Vercel, Cloudflare Workers, or Express; same OAuth, Reddit API, and AI stack.
- **Design that scales**: Consistent, accessible UI (see `design-system.md`) with density modes, semantic tokens, and keyboard-friendly controls—from quick checks to power-user sessions.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React UI      │───▶│  Express/Vercel  │───▶│   Reddit API     │
│   (index.html)  │    │  Serverless API  │    │   (OAuth)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  OpenRouter API  │
                       │  (AI Ranking)    │
                       └──────────────────┘
```

## 📁 Project Structure

```
reddit-dashboarder/
├── api/
│   ├── auth/
│   │   ├── start.js          # OAuth initiation
│   │   ├── callback.js       # OAuth callback
│   │   ├── logout.js         # Logout
│   │   └── status.js         # Auth status
│   ├── reddit/
│   │   └── ai-rank.js        # AI post ranking (OpenRouter)
│   ├── settings/
│   │   ├── openrouter-key.js # Secure OpenRouter key storage (HttpOnly cookie)
│   │   └── import.js          # Settings import/export API (for AI agents)
│   ├── reddit.js             # Reddit data API
│   └── health.js             # Health check
├── lib/
│   ├── cookies.js            # Signed cookie helpers
│   ├── cors.js               # CORS helpers
│   ├── pkce.js               # PKCE OAuth helpers
│   └── ui-helpers.js         # UI utility functions (keyword extraction, scoring, etc.)
├── __tests__/                # Test suite (Jest)
│   ├── api/                  # API endpoint tests
│   ├── integration/          # Integration tests
│   └── unit/                 # Unit tests
├── worker/
│   ├── worker.js             # Cloudflare Worker (optional)
│   └── wrangler.toml         # Worker config
├── app.js                    # Express app factory (used by server.js and tests)
├── index.html                # React SPA (Tailwind, DOMPurify)
├── server.js                 # Express server (local)
├── package.json
├── jest.config.js            # Jest test configuration
├── vercel.json               # Vercel serverless config
├── design-system.md          # UI tokens, components, patterns
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Reddit OAuth App (for authentication)
- OpenRouter API Key (optional, for AI ranking)

### Step 1: Create Reddit OAuth App

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Click "create another app..." or "create app"
3. Choose "web app"
4. Set redirect URI to: `http://localhost:3000/api/auth/callback` (for local) or your production URL
5. Note your **Client ID** and **Client Secret**

### Step 2: Get OpenRouter API Key (Optional)

AI ranking can work in two ways:
- **Option A (Recommended for personal use)**: Enter your own API key in the UI settings after setup
- **Option B (For shared deployments)**: Configure a server-side API key in environment variables

To get an API key:
1. Sign up at [OpenRouter.ai](https://openrouter.ai/)
2. Go to [Keys](https://openrouter.ai/keys) and create an API key
3. The free tier includes access to several powerful models (Llama 3.3 70B, Qwen 2.5 72B, Gemini 2.0 Flash)

### Step 3: Environment Setup

Create a `.env.local` file in the project root:

```bash
# Reddit OAuth Configuration (Required)
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session Security (Required)
SESSION_COOKIE_SECRET=your_random_secret_key_here

# OpenRouter AI Configuration (Optional - for AI ranking)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free

# Optional Configuration
REDDIT_USER_AGENT=YourApp/1.0.0
APP_BASE_URL=http://localhost:3000
NODE_ENV=development
```

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Install Dependencies

```bash
npm install
```

### Step 5: Run Locally

```bash
npm run local
```

The dashboard will be available at `http://localhost:3000`

## 🌐 Deployment

### Option 1: Deploy to Vercel (Recommended)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "New Project" and import your repository
   - Add environment variables in Vercel dashboard:
     - `REDDIT_CLIENT_ID`
     - `REDDIT_CLIENT_SECRET`
     - `REDDIT_REDIRECT_URI` (your Vercel app URL + `/api/auth/callback`)
     - `SESSION_COOKIE_SECRET`
     - `OPENROUTER_API_KEY` (optional)
   - Deploy!

3. **Update Reddit App Redirect URI**:
   - Update your Reddit app's redirect URI to match your Vercel URL: `https://your-app.vercel.app/api/auth/callback`

### Quick deploy: Vercel KV + Digest API

To enable the headless digest and admin token APIs (free tier):

```bash
# 1. Add Vercel KV (free tier)
vercel storage add kv

# 2. Set your digest API key
vercel env add DIGEST_API_KEY
# (enter a random secret when prompted)

# 3. Deploy
vercel --prod
```

Then:

4. **Auth once in browser** — Visit your app → click **"Authenticate with Reddit"** (the refresh token is saved to KV).
5. **Verify**:
   ```bash
   curl -H "Authorization: Bearer <your-key>" \
     https://reddit-dashboarder.vercel.app/api/admin/token
   ```
   Replace `<your-key>` with the value you set for `DIGEST_API_KEY`, and use your actual Vercel app URL if different. You should see `"source": "kv"` and `"hasToken": true`.

### Option 2: Deploy to Cloudflare Workers

See the `worker/` directory for Cloudflare Worker implementation. Note: OAuth and AI ranking features require additional setup for Workers.

### Option 3: Self-Hosted Express Server

The `server.js` file provides a full Express server that can be deployed to any Node.js hosting service (Railway, Render, Heroku, etc.).

### Setting Up Vercel KV (for Agent/Digest Endpoint)

If you want to use the `/api/reddit/digest` endpoint for automated monitoring (bots, cron jobs), set up Vercel KV to persist the Reddit refresh token:

1. **Add Vercel KV to your project**:
   ```bash
   vercel storage add kv
   ```
   Or via Vercel Dashboard: Project → Storage → Create Database → KV

2. **Link to your project** (if not auto-linked):
   ```bash
   vercel link
   vercel env pull
   ```
   This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

3. **Set up the digest API key**:
   ```bash
   vercel env add DIGEST_API_KEY
   # Enter a secure random string
   ```

4. **Authenticate once via browser**:
   - Visit your app and click "Authenticate with Reddit"
   - The refresh token is automatically saved to Vercel KV

5. **Verify setup**:
   ```bash
   curl -H "Authorization: Bearer your-digest-api-key" \
     "https://your-app.vercel.app/api/admin/token"
   ```
   Should show `"source": "kv"` and `"hasToken": true`.

Now the digest endpoint can access Reddit without browser authentication!

## 📖 Usage

### Authentication

1. Click "Authenticate with Reddit" button
2. Authorize the app on Reddit
3. You'll be redirected back and authenticated automatically

### Adding Subreddits

- Enter comma-separated subreddit names (e.g., `programming,webdev,javascript`)
- Or use starter packs for quick setup
- Settings are automatically saved to localStorage

### AI Ranking (Optional)

1. Enable AI ranking in the Settings panel
2. Enter your goals/objectives (e.g., "I run an SEO agency and am looking for leads")
3. Optionally add quick clarifiers (e.g., "prefer launches, avoid memes")
4. **Option A**: Enter your own OpenRouter API key in the settings (get one free at [openrouter.ai/keys](https://openrouter.ai/keys)); it can be stored in an HttpOnly cookie for security
5. **Option B**: Use server-side API key by configuring `OPENROUTER_API_KEY` environment variable
6. Choose your preferred AI model (several free models available)
7. Posts will be scored 0-5 based on strict relevance to your goals (5s are rare and represent must-read posts)
8. Sort by "AI Score" to see the most relevant posts first

**Available Models:**
- Models are loaded dynamically from OpenRouter in the Settings panel (recommended)
- Default: Google Gemini 2.0 Flash (fast + strong for monitoring)

### Features

- **Sorting**: `new` (chronological) or `top` (by popularity)
- **Time Range**: Hour, day, week, month, year, all (for top posts)
- **Days Filter**: Filter posts from last N days (for new posts)
- **Keyword Search**: Filter posts by keywords in title/content
- **Upvote/Comment Filters**: Show only posts with minimum upvotes/comments
- **Auto-Refresh**: Automatically refresh posts at set intervals
- **Dark Mode**: Toggle dark/light theme

## 📋 API Reference

### Main Reddit Endpoint

```
GET /api/reddit
```

**Query Parameters:**
- `subs` (required): Comma-separated subreddit names
- `mode` (optional): `new` or `top` (default: `new`)
- `time` (optional): `hour`, `day`, `week`, `month`, `year`, `all` (default: `day`)
- `days` (optional): Number of days to look back for `new` mode (default: `1`)
- `limit` (optional): Posts per page (default: `50`, max: `100`)
- `max_pages` (optional): Maximum pages to fetch per subreddit (default: `10`)

**Response:**
```json
{
  "mode": "new",
  "time": "day",
  "days": 1,
  "limit": 50,
  "max_pages": 5,
  "results": [
    {
      "subreddit": "programming",
      "meta": { "subscribers": 1000, "title": "Programming" },
      "posts": [...],
      "partial": false
    }
  ],
  "fetched_at": 1234567890,
  "rate_limited": false,
  "metrics": {
    "subredditCount": 2,
    "totalPosts": 50,
    "rateLimitedCount": 0,
    "durationMs": 1234
  }
}
```

**Response Headers:**
- `X-RDD-Metrics`: JSON string containing performance metrics (same as `metrics` in response body)
- `X-Rate-Limited`: Set to `"1"` if any subreddit was rate limited
- `Cache-Control`: Caching directives

**Example:**
```bash
curl "http://localhost:3000/api/reddit?subs=programming,webdev&mode=new&days=1&limit=50&max_pages=5"
```

### AI Ranking Endpoint

```
POST /api/reddit/ai-rank
```

**Request Body:**
```json
{
  "posts": [
    {
      "id": "post_id",
      "title": "Post title",
      "selftext": "Post content",
      "subreddit": "programming"
    }
  ],
  "userGoals": "Find posts about React and TypeScript best practices",
  "userContext": "Prefer hands-on guides, avoid memes"
}
```

**Response:**
```json
{
  "scores": {
    "post_id": 5,
    "post_id_2": 4
  },
  "metadata": {
    "post_id": {
      "confidence": "high",
      "reason": "Highly relevant because..."
    }
  },
  "model": "google/gemini-2.0-flash-exp:free",
  "promptVersion": "v3.0",
  "processed": 2,
  "metrics": {
    "batchCount": 1,
    "processedCount": 2,
    "failedCount": 0,
    "durationMs": 1234,
    "promptVersion": "v3.0"
  },
  "failedPostIds": []
}
```

**Response Headers:**
- `X-RDD-Metrics`: JSON string containing performance metrics (same as `metrics` in response body)

### Agent Digest Endpoint (Headless/Automated)

```
GET /api/reddit/digest
```

Agent-friendly endpoint for automated monitoring. Fetches posts, ranks them with AI, and returns only high-priority posts. Uses server-side Reddit authentication (no browser OAuth required).

**Authentication:**
- Requires `Authorization: Bearer <token>` header
- Token must match `DIGEST_API_KEY` environment variable

**Query Parameters:**
- `subs` (optional): Comma-separated subreddits (default: `DIGEST_SUBREDDITS` env var)
- `goals` (optional): AI ranking goals (default: `DIGEST_GOALS` env var)
- `context` (optional): Additional context/clarifiers (default: `DIGEST_CONTEXT` env var)
- `threshold` (optional): Minimum AI score to include (0-5, default: `4`)
- `days` (optional): Days to look back (1-7, default: `1`)
- `model` (optional): OpenRouter model (default: `OPENROUTER_MODEL` env var)
- `format` (optional): `json` or `markdown` (default: `json`)

**Required Environment Variables:**
- `DIGEST_API_KEY` - Bearer token for authentication
- `OPENROUTER_API_KEY` - For AI ranking

**Reddit Authentication (one of these):**
- **Option A (Recommended):** Set up Vercel KV, then authenticate once via browser. The refresh token is automatically stored and kept fresh.
- **Option B:** Set `REDDIT_REFRESH_TOKEN` env var manually (may need updating if Reddit rotates the token).

**Optional Environment Variables:**
- `DIGEST_SUBREDDITS` - Default subreddits
- `DIGEST_GOALS` - Default AI goals
- `DIGEST_CONTEXT` - Default AI context
- `DIGEST_THRESHOLD` - Default score threshold

**Response (JSON):**
```json
{
  "highPriorityPosts": [
    {
      "id": "abc123",
      "title": "Looking for SEO consultant...",
      "subreddit": "smallbusiness",
      "author": "user123",
      "url": "https://www.reddit.com/r/smallbusiness/...",
      "score": 5,
      "redditScore": 42,
      "numComments": 15,
      "ageHours": 3,
      "reason": "Direct service request matching profile",
      "confidence": "high",
      "flair": "Help Wanted",
      "preview": "First 200 chars of post body..."
    }
  ],
  "stats": {
    "subreddits": 3,
    "total": 147,
    "scored": 147,
    "highPriority": 2,
    "threshold": 4,
    "model": "google/gemini-2.0-flash-exp:free",
    "durationMs": 8500
  }
}
```

**Example:**
```bash
curl -H "Authorization: Bearer your-secret-key" \
  "https://your-app.vercel.app/api/reddit/digest?subs=smallbusiness,entrepreneur&goals=Find%20leads%20for%20SEO%20services&threshold=4"
```

**Markdown Format:**
```bash
curl -H "Authorization: Bearer your-secret-key" \
  "https://your-app.vercel.app/api/reddit/digest?format=markdown"
```

### Authentication Endpoints

- `GET /api/auth/start` - Initiate OAuth flow
- `GET /api/auth/callback` - OAuth callback (also saves refresh token to Vercel KV if configured)
- `GET /api/auth/logout` - Logout
- `GET /api/auth/status` - Auth status

### Admin Token Endpoint

Manage the server-side Reddit refresh token. Requires `Authorization: Bearer <DIGEST_API_KEY>`.

- `GET /api/admin/token` - View token status (source, preview, last updated)
- `POST /api/admin/token` - Manually set token (body: `{ "token": "..." }`)
- `DELETE /api/admin/token` - Delete token from Vercel KV

**Example:**
```bash
# Check token status
curl -H "Authorization: Bearer your-api-key" \
  "https://your-app.vercel.app/api/admin/token"

# Response:
{
  "hasToken": true,
  "source": "kv",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "tokenPreview": "12345678...abcd",
  "kvConfigured": true,
  "envVarSet": false
}
```

### Settings: OpenRouter Key (optional)

- `GET /api/settings/openrouter-key` - Check if a key is stored (`hasKey`, `keyPreview`; never returns the key)
- `POST /api/settings/openrouter-key` - Store key in HttpOnly signed cookie (body: `{ "apiKey": "sk-or-..." }`)
- `DELETE /api/settings/openrouter-key` - Remove stored key

### Settings: Import/Export (for AI agents)

- `GET /api/settings/import` - Export stored settings (returns `{ hasSettings: boolean, settings: {...} }`)
- `POST /api/settings/import` - Import settings (body: settings JSON object)
- `DELETE /api/settings/import` - Clear stored settings

Settings include: `subs`, `maxPages`, `autoRefreshEnabled`, `autoRefreshInterval`, `notificationsEnabled`, `upvoteThreshold`, `alertKeywords`, `notifyHighRelevance`, `highRelevanceThreshold`, `notifiedHighRelevancePostIds`, `aiGoals`, `aiContext`, `aiEnabled`, `openRouterModel`, `aiLlmPostLimit`.

**Note**: The OpenRouter API key is stored separately via `/api/settings/openrouter-key` for security reasons.

**Example:**
```bash
# Export settings
curl -X GET "http://localhost:3000/api/settings/import" \
  --cookie "rdd_dashboard_settings=..."

# Response:
{
  "hasSettings": true,
  "settings": {
    "subs": ["programming", "webdev"],
    "maxPages": 5,
    "aiEnabled": true,
    "aiGoals": "Find posts about React and TypeScript",
    "openRouterModel": "google/gemini-2.0-flash-exp:free"
  }
}

# Import settings
curl -X POST "http://localhost:3000/api/settings/import" \
  -H "Content-Type: application/json" \
  --cookie-jar cookies.txt \
  -d '{
    "subs": ["programming", "webdev", "javascript"],
    "maxPages": 5,
    "aiEnabled": true,
    "aiGoals": "Find posts about React and TypeScript best practices",
    "aiContext": "Prefer hands-on guides, avoid memes",
    "openRouterModel": "google/gemini-2.0-flash-exp:free"
  }'

# Response:
{
  "success": true,
  "settings": { ... }
}
```

Settings are stored in an HttpOnly signed cookie, so they persist across sessions and are accessible via the API for AI agents and automation tools.

### Health Check

```
GET /api/health
```

Returns server status and environment information.

## 🛠️ Development

### Local Development

```bash
# Start Express server
npm run local

# Or use Vercel CLI for serverless simulation
npm run dev
```

### Testing

The project includes a comprehensive test suite using Jest:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Test structure:
- **Unit tests** (`__tests__/unit/`): Test individual functions and modules
- **API tests** (`__tests__/api/`): Test API endpoints
- **Integration tests** (`__tests__/integration/`): Test complete workflows and error handling

See `__tests__/README.md` for more details on the test suite.

### Project Scripts

- `npm run local` - Start Express server for local development
- `npm run dev` - Start Vercel dev server (requires Vercel CLI)
- `npm run deploy` - Deploy to Vercel production
- `npm test` - Run test suite (Jest)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDDIT_CLIENT_ID` | Yes | Reddit OAuth app client ID |
| `REDDIT_CLIENT_SECRET` | Yes | Reddit OAuth app client secret |
| `REDDIT_REDIRECT_URI` | Yes | OAuth redirect URI (must match Reddit app settings) |
| `SESSION_COOKIE_SECRET` | Yes | Secret for signing cookies (32+ random bytes hex) |
| `OPENROUTER_API_KEY` | No | OpenRouter key for AI ranking (users can also store their own via Settings/HttpOnly cookie) |
| `OPENROUTER_MODEL` | No | Default model (e.g. `google/gemini-2.0-flash-exp:free`) |
| `OPENROUTER_REFERER` | No | HTTP-Referer sent to OpenRouter (default varies by deployment) |
| `REDDIT_USER_AGENT` | No | User-Agent for Reddit API |
| `APP_BASE_URL` | No | Base URL (used when `REDDIT_REDIRECT_URI` is not set; auth derives redirect from host otherwise) |
| `APP_DOMAIN` | No | Used by CORS for allowed origins |
| `NODE_ENV` | No | `development` or `production` |
| `DIGEST_API_KEY` | No | Bearer token for `/api/reddit/digest` and `/api/admin/token` auth |
| `REDDIT_REFRESH_TOKEN` | No | Fallback Reddit refresh token (Vercel KV is preferred) |
| `KV_REST_API_URL` | No | Vercel KV REST API URL (auto-set when you add Vercel KV) |
| `KV_REST_API_TOKEN` | No | Vercel KV REST API token (auto-set when you add Vercel KV) |
| `DIGEST_SUBREDDITS` | No | Default subreddits for digest endpoint |
| `DIGEST_GOALS` | No | Default AI goals for digest endpoint |
| `DIGEST_CONTEXT` | No | Default AI context for digest endpoint |
| `DIGEST_THRESHOLD` | No | Default score threshold for digest (0-5, default: 4) |

## 🎨 Customization

### UI Themes

The dashboard uses Tailwind CSS with dark mode. See `design-system.md` for semantic tokens, component recipes, and patterns; override in `index.html` as needed.

### AI Models

Choose your AI model in the Settings panel under "AI Relevance Ranking", or set a default via `OPENROUTER_MODEL` environment variable. 

Popular free options:
- `google/gemini-2.0-flash-exp:free` (default)
- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen-2.5-72b-instruct:free`

Paid options (requires credits):
- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `google/gemini-pro-1.5`

### Rate Limiting

The app includes built-in rate limiting and retry logic. Adjust concurrency and delays in `api/reddit.js` if needed.

## 🔒 Security

- **Signed Cookies**: Session and OpenRouter-key cookies are cryptographically signed
- **HttpOnly OpenRouter Key**: User-supplied OpenRouter keys can be stored in an HttpOnly cookie (via `/api/settings/openrouter-key`) so they are not exposed to XSS
- **PKCE OAuth Flow**: Secure PKCE for Reddit OAuth
- **Environment Variables**: Secrets in env; never committed
- **HTTPS**: Use HTTPS in production

## 🐛 Troubleshooting

### "OpenRouter API key required"

AI ranking requires an OpenRouter API key. You have two options:
- **Option A (Recommended)**: Enter your personal API key in the Settings panel under "AI Relevance Ranking"
  - Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)
- **Option B**: Configure `OPENROUTER_API_KEY` environment variable on the server
  - Useful for shared deployments where all users use the same API key

### "Missing Reddit OAuth configuration"

Ensure all required Reddit OAuth environment variables are set:
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_REDIRECT_URI`

### OAuth Redirect URI Mismatch

The redirect URI in your `.env.local` must **exactly** match what's configured in your Reddit app settings, including:
- Protocol (`http://` vs `https://`)
- Domain
- Port (if applicable)
- Path (`/api/auth/callback`)

### Rate Limiting

If you hit Reddit rate limits:
- Authenticate with Reddit OAuth for higher limits
- Reduce `max_pages` or `limit` parameters
- Increase delays between requests

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [DOMPurify](https://github.com/cure53/DOMPurify)
- [Vercel](https://vercel.com/), [Cloudflare Workers](https://workers.cloudflare.com/)
- [Reddit API](https://www.reddit.com/dev/api/), [OpenRouter](https://openrouter.ai/)
- [PKCE](https://oauth.net/2/pkce/) for OAuth
