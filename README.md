# Reddit Highlights Dashboard

A dead-simple way to skim 30+ subreddits efficiently without dealing with cron jobs, databases, or paid services. This project consists of a Vercel serverless API that proxies Reddit feeds and a beautiful static dashboard that renders highlights in your browser.

## ✨ Features

- **Fast & Efficient**: Cached responses reduce Reddit API calls and improve load times
- **Serverless Architecture**: Vercel API routes handle Reddit data fetching
- **Persistent Settings**: Your subreddits and preferences are saved locally with backup/restore
- **Customizable**: Easy to modify subreddit lists and time ranges
- **Responsive Design**: Clean, modern UI built with Tailwind CSS and React
- **Free to Host**: Deployed on Vercel's free tier

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Static HTML   │───▶│  Vercel API      │───▶│   Reddit API    │
│   Dashboard     │    │  (Serverless)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 Project Structure

```
reddit-dashboard/
├── api/
│   └── reddit.js          # Vercel API route (Reddit proxy & cache)
├── index.html             # Main dashboard (React + Tailwind CSS)
├── package.json           # Project dependencies and scripts
├── vercel.json            # Vercel deployment configuration
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## 🚀 Quick Start

### Option 1: Deploy to Vercel (Recommended)

1. **Fork this repository** or push it to your GitHub account
2. **Go to [vercel.com](https://vercel.com)** and sign in with GitHub
3. **Click "New Project"** and import your repository
4. **Deploy** - Vercel will automatically detect the configuration
5. **Your dashboard is live!** - No additional configuration needed

### Option 2: Deploy to Other Platforms

For other platforms, you'll need to:
1. Deploy the static files (`index.html`) 
2. Set up the API route (`api/reddit.js`) as a serverless function
3. Update the API URL in the dashboard if needed

### Step 3: Using Your Dashboard

1. **Open your deployed dashboard**
2. **Add subreddits**: Enter comma-separated subreddit names (e.g., `programming,webdev,javascript`)
3. **Choose settings**: Select sorting mode, time range, and other preferences
4. **Click Refresh**: Your dashboard will load the latest posts
5. **Settings persist**: Your subreddits and preferences are automatically saved

## 🔧 Features

### Persistent Settings
- **Auto-save**: Subreddits and settings are automatically saved to localStorage
- **Backup/Restore**: Export your settings to clipboard or import from backup
- **Dual storage**: Primary + backup storage prevents data loss

### Advanced Options
- **Sorting modes**: `new` (chronological) or `top` (by popularity)
- **Time ranges**: Hour, day, week, month for top posts
- **Page limits**: Control how many pages to fetch (rate limiting)
- **Keyword filtering**: Search within fetched posts

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- Vercel CLI (optional): `npm i -g vercel`

### Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd reddit-dashboard
   ```

2. **Start local development server**:
   ```bash
   # Option 1: Using Vercel CLI (recommended)
   vercel dev

   # Option 2: Using any static server
   python3 -m http.server 8000
   # Then visit http://localhost:8000
   ```

3. **The API routes work automatically** - Vercel dev server handles both static files and API routes

### Testing API Directly

You can test the API endpoint directly:
```bash
curl "http://localhost:3000/api/reddit?subs=programming&mode=new&limit=5"
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
