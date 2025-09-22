# Reddit Highlights Dashboard

A dead-simple way to skim 30+ subreddits efficiently without dealing with cron jobs, databases, or paid services. This project consists of a single Cloudflare Worker that proxies Reddit feeds and a beautiful static dashboard that renders highlights in your browser.

## ✨ Features

- **Fast & Efficient**: Cached responses reduce Reddit API calls and improve load times
- **No Backend Required**: Pure static frontend with serverless worker
- **Customizable**: Easy to modify subreddit lists and time ranges
- **Responsive Design**: Clean, modern UI built with Tailwind CSS
- **Free to Host**: Uses Cloudflare Workers (free tier) + any static hosting

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Static HTML   │───▶│ Cloudflare Worker│───▶│   Reddit API    │
│   Dashboard     │    │   (Proxy/Cache)  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 Project Structure

```
reddit-dashboard/
├── worker/
│   ├── worker.js          # Cloudflare Worker (API proxy & cache)
│   ├── package.json       # Worker dependencies
│   └── wrangler.toml      # Cloudflare Worker config
├── static/
│   ├── index.html         # Main dashboard (Tailwind CSS)
│   └── react-dashboard.html # Alternative React version
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## 🚀 Quick Start

### Step 1: Deploy the Cloudflare Worker

Choose one of these deployment methods:

#### Option A: Dashboard Deploy (No CLI Required)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages → Create → HTTP handler**
3. Replace the starter code with the contents of `worker/worker.js`
4. Click **Deploy** and copy the URL (ends with `.workers.dev`)
5. **Optional**: Adjust cache TTL by modifying `s-maxage` in the `Cache-Control` header

#### Option B: CLI Deploy with Wrangler

```bash
# Install Wrangler globally
npm install -g wrangler@3

# Authenticate with Cloudflare
wrangler login

# Deploy from worker directory
cd worker
wrangler deploy
```

Copy the deployed URL from the output (e.g., `https://your-worker.your-subdomain.workers.dev`)

### Step 2: Host the Static Dashboard

Choose any static hosting platform:

| Platform | Instructions |
|----------|-------------|
| **Netlify** | Drag & drop `static/` folder to [netlify.com/drop](https://netlify.com/drop) |
| **Vercel** | Connect your GitHub repo or use [vercel.com/new](https://vercel.com/new) |
| **GitHub Pages** | Push to GitHub and enable Pages in repository settings |
| **Cloudflare Pages** | Connect your repo at [pages.cloudflare.com](https://pages.cloudflare.com) |

**Important**: After hosting, edit the `WORKER_URL` constant in your HTML file:

```javascript
// Change this line in your HTML file
const WORKER_URL = 'https://your-worker.your-subdomain.workers.dev/api';
```

### Step 3: Configure Your Dashboard

1. **Open your hosted dashboard**
2. **Add subreddits**: Enter comma-separated subreddit names (e.g., `programming,webdev,javascript`)
3. **Choose sorting**: Select `top` or `new`
4. **Set time range**: For `top` posts, choose time period (hour, day, week, month, year, all)
5. **Click Refresh**: Your dashboard will load the latest posts

> 💡 **Pro Tip**: Responses are cached for ~10 minutes, so refreshes are fast and don't hit Reddit's API limits

## 🛠️ Local Development

### Prerequisites
- Node.js 16+ 
- Python 3 (for local server)

### Setup

1. **Start the Cloudflare Worker locally**:
   ```bash
   cd worker
   wrangler dev --ip 127.0.0.1 --port 8787
   ```

2. **Serve the static dashboard**:
   ```bash
   cd static
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

3. **Open your browser**: Navigate to `http://127.0.0.1:8000/`

4. **Update the worker URL** in your HTML file for local development:
   ```javascript
   const WORKER_URL = 'http://127.0.0.1:8787/api';
   ```

## 🎨 Customization Ideas

### Easy Enhancements
- **💾 Save subreddit lists**: Use `localStorage` to remember your favorite subreddits
- **🔍 Add search**: Implement client-side filtering by post title/content
- **🌙 Dark mode**: Add Tailwind `dark:` variants for better night viewing
- **📱 Mobile optimization**: Enhance responsive design for mobile devices

### Advanced Features
- **⚡ Increase cache TTL**: Modify `s-maxage` for less frequent updates
- **📊 Analytics**: Add post engagement metrics (upvotes, comments)
- **🏷️ Categories**: Group subreddits by topic (tech, news, entertainment)
- **🔔 Notifications**: Browser notifications for high-engagement posts

## 📋 API Reference

### Worker Endpoint
```
GET /api?subreddits=sub1,sub2&sort=top&t=day
```

**Parameters:**
- `subreddits` (required): Comma-separated subreddit names
- `sort` (optional): `top` or `new` (default: `top`)
- `t` (optional): Time range for `top` posts (`hour`, `day`, `week`, `month`, `year`, `all`)

**Response:**
```json
{
  "subreddits": [
    {
      "name": "programming",
      "posts": [
        {
          "title": "Post title",
          "url": "https://reddit.com/...",
          "score": 1234,
          "comments": 56,
          "created_utc": 1640995200
        }
      ]
    }
  ]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Powered by [Reddit API](https://www.reddit.com/dev/api/)
