# Reddit Dashboard

Browse multiple subreddits efficiently with AI-powered post ranking.

## Features

- **Reddit OAuth** - Secure authentication
- **AI Ranking** - Rank posts by relevance (OpenRouter)
- **Three-Pane UI** - Subs, posts, detail view
- **Auto-Refresh** - Configurable intervals
- **Filtering** - Keywords, upvotes, time range
- **Velocity** - Track hot posts in real-time
- **Dark Mode** - System-aware theme
- **Settings API** - Import/export for automation

## Deploy

**Vercel** (recommended):
```bash
npm i -g vercel
vercel
```

**Local**:
```bash
npm install
npm run dev
```

## Env Variables

```bash
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx
REDDIT_REDIRECT_URI=http://localhost:3000/api/auth/callback
SESSION_COOKIE_SECRET=xxx
# Optional:
OPENROUTER_API_KEY=xxx
CRON_SECRET_KEY=xxx
```

## API

- `GET /api/v1/leads/latest` - Hot leads digest
- `POST /api/settings/import` - Import settings
- `GET /api/auth/status` - Check auth

## License

MIT
