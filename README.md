# Reddit Dashboard

A powerful, feature-rich Reddit dashboard for efficiently browsing multiple subreddits with AI-powered post ranking, OAuth authentication, and a three-pane interface.

🧭 Vision / North Star

North Star: Decide what to do next on Reddit in minutes.

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
- **💾 Persistent Settings**: Subreddits and preferences in `localStorage` with backup/restore
- **📱 Responsive Design**: Works on desktop and mobile
- **🚀 Deploy Anywhere**: Vercel, Cloudflare Workers, or local Express

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
│   │   └── openrouter-key.js # Secure OpenRouter key storage (HttpOnly cookie)
│   ├── reddit.js             # Reddit data API
│   └── health.js             # Health check
├── lib/
│   ├── cookies.js            # Signed cookie helpers
│   ├── cors.js               # CORS helpers
│   └── pkce.js               # PKCE OAuth helpers
├── worker/
│   ├── worker.js             # Cloudflare Worker (optional)
│   └── wrangler.toml         # Worker config
├── index.html                # React SPA (Tailwind, DOMPurify)
├── server.js                 # Express server (local)
├── package.json
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
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

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

### Option 2: Deploy to Cloudflare Workers

See the `worker/` directory for Cloudflare Worker implementation. Note: OAuth and AI ranking features require additional setup for Workers.

### Option 3: Self-Hosted Express Server

The `server.js` file provides a full Express server that can be deployed to any Node.js hosting service (Railway, Render, Heroku, etc.).

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
3. **Option A**: Enter your own OpenRouter API key in the settings (get one free at [openrouter.ai/keys](https://openrouter.ai/keys)); it can be stored in an HttpOnly cookie for security
4. **Option B**: Use server-side API key by configuring `OPENROUTER_API_KEY` environment variable
5. Choose your preferred AI model (several free models available)
6. Posts will be scored 0-10 based on relevance to your goals
7. Sort by "AI Score" to see the most relevant posts first

**Available Models:**
- Free: Meta Llama 3.3 70B, Qwen 2.5 72B, Google Gemini 2.0 Flash
- Paid: Claude 3.5 Sonnet, GPT-4o, GPT-4o Mini, Gemini Pro 1.5

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
  "userGoals": "Find posts about React and TypeScript best practices"
}
```

**Response:**
```json
{
  "rankedPosts": [
    {
      "id": "post_id",
      "relevanceScore": 8.5,
      "reasoning": "Highly relevant because..."
    }
  ]
}
```

### Authentication Endpoints

- `GET /api/auth/start` - Initiate OAuth flow
- `GET /api/auth/callback` - OAuth callback
- `GET /api/auth/logout` - Logout
- `GET /api/auth/status` - Auth status

### Settings: OpenRouter Key (optional)

- `GET /api/settings/openrouter-key` - Check if a key is stored (`hasKey`, `keyPreview`; never returns the key)
- `POST /api/settings/openrouter-key` - Store key in HttpOnly signed cookie (body: `{ "apiKey": "sk-or-..." }`)
- `DELETE /api/settings/openrouter-key` - Remove stored key

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

### Project Scripts

- `npm run local` - Start Express server for local development
- `npm run dev` - Start Vercel dev server (requires Vercel CLI)
- `npm run deploy` - Deploy to Vercel production

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDDIT_CLIENT_ID` | Yes | Reddit OAuth app client ID |
| `REDDIT_CLIENT_SECRET` | Yes | Reddit OAuth app client secret |
| `REDDIT_REDIRECT_URI` | Yes | OAuth redirect URI (must match Reddit app settings) |
| `SESSION_COOKIE_SECRET` | Yes | Secret for signing cookies (32+ random bytes hex) |
| `OPENROUTER_API_KEY` | No | OpenRouter key for AI ranking (users can also store their own via Settings/HttpOnly cookie) |
| `OPENROUTER_MODEL` | No | Default model (e.g. `meta-llama/llama-3.3-70b-instruct:free`) |
| `OPENROUTER_REFERER` | No | HTTP-Referer sent to OpenRouter (default varies by deployment) |
| `REDDIT_USER_AGENT` | No | User-Agent for Reddit API |
| `APP_BASE_URL` | No | Base URL (used when `REDDIT_REDIRECT_URI` is not set; auth derives redirect from host otherwise) |
| `APP_DOMAIN` | No | Used by CORS for allowed origins |
| `NODE_ENV` | No | `development` or `production` |

## 🎨 Customization

### UI Themes

The dashboard uses Tailwind CSS with dark mode. See `design-system.md` for semantic tokens, component recipes, and patterns; override in `index.html` as needed.

### AI Models

Choose your AI model in the Settings panel under "AI Relevance Ranking", or set a default via `OPENROUTER_MODEL` environment variable. 

Popular free options:
- `meta-llama/llama-3.3-70b-instruct:free` (default)
- `qwen/qwen-2.5-72b-instruct:free`
- `google/gemini-2.0-flash-exp:free`

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
