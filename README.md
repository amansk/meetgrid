# Meetgrid

Dead-simple scheduling polls — a no-login Doodle alternative.

Create a poll, share a link, collect Yes/No availability, pick a time, and close. Built on Cloudflare Workers + D1 with an MCP server for AI agents.

## What & why

**Meetgrid** helps groups find a meeting time without accounts, calendar integrations, or marketing fluff. Organizers get a public poll URL plus a secret capability token. Respondents enter a name and mark slots Yes or No. Results rank slots by yes-count; organizers mark the final choice and optionally close the poll.

## Features

- **Yes / No only** — no maybe votes
- **Manual time slots** (Doodle-style) — add date, start time, and duration per option; optional range generator
- **No accounts** — unguessable poll IDs, organizer secrets, and per-respondent edit tokens
- **Timezone-aware** — required on create; defaults to `America/Los_Angeles` in the UI
- **Three thin pages** — Create, Respond, Results (mobile-first, form aesthetic)
- **MCP tools** for agents — same HTTP API the UI uses

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via npm below)

### Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open [http://localhost:8787](http://localhost:8787).

### Deploy to Cloudflare

1. Create a D1 database:

```bash
npx wrangler d1 create meetgrid-db
```

2. Copy the returned `database_id` into `wrangler.toml` (replace `local-dev-placeholder`).

3. Apply migrations to production:

```bash
npm run db:migrate:remote
```

4. Deploy:

```bash
npm run deploy
```

## Project layout

```
├── src/
│   ├── index.ts           # Worker entry (Hono app)
│   ├── routes/
│   │   ├── api.ts         # REST API
│   │   └── pages.ts       # HTML pages
│   ├── db/queries.ts      # D1 queries
│   └── lib/               # crypto, slots, timezone, rate-limit
├── migrations/
│   └── 0001_initial.sql
├── mcp/                   # MCP server (stdio)
└── wrangler.toml
```

## API

Base URL: `https://your-worker.workers.dev` (or `http://localhost:8787` locally)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/polls` | Create poll |
| `GET` | `/api/polls/:id` | Public poll view (no organizer secret) |
| `POST` | `/api/polls/:id/respond` | Submit/update response |
| `GET` | `/api/polls/:id/my-response?edit_token=` | Load own votes by edit token |
| `POST` | `/api/polls/:id/decision` | Organizer: mark chosen slot |
| `POST` | `/api/polls/:id/close` | Organizer: close poll |
| `POST` | `/api/polls/:id/slots` | Organizer: add/remove slots |

Write endpoints are lightly rate-limited (30 requests / 60s per IP by default).

### curl examples

**Create a poll** (explicit slots — preferred)

```bash
curl -s -X POST http://localhost:8787/api/polls \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Team sync",
    "timezone": "America/Los_Angeles",
    "slots": [
      {"date": "2026-09-15", "start_time": "10:00", "duration_minutes": 30},
      {"date": "2026-09-16", "start_time": "14:00", "duration_minutes": 45}
    ]
  }'
```

**Create via range generator** (optional fallback when `slots` omitted)

```bash
curl -s -X POST http://localhost:8787/api/polls \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Team sync",
    "timezone": "America/Los_Angeles",
    "duration_minutes": 30,
    "start_date": "2026-09-15",
    "end_date": "2026-09-19",
    "daily_start": "09:00",
    "daily_end": "17:00",
    "weekdays": [1, 2, 3, 4, 5]
  }'
```

Save `poll_id`, `organizer_secret`, and `poll_url` from the response.

**Get poll (public)**

```bash
curl -s http://localhost:8787/api/polls/POLL_ID
```

**Respond**

```bash
curl -s -X POST http://localhost:8787/api/polls/POLL_ID/respond \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Alex",
    "votes": [
      {"slot_id": "SLOT_ID", "yes": true}
    ]
  }'
```

**Update a response** (pass `edit_token` from the prior response):

```bash
curl -s -X POST http://localhost:8787/api/polls/POLL_ID/respond \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Alex",
    "edit_token": "EDIT_TOKEN",
    "votes": [
      {"slot_id": "SLOT_ID", "yes": false}
    ]
  }'
```

**Mark chosen slot**

```bash
curl -s -X POST http://localhost:8787/api/polls/POLL_ID/decision \
  -H 'Content-Type: application/json' \
  -d '{
    "organizer_secret": "ORGANIZER_SECRET",
    "slot_id": "SLOT_ID"
  }'
```

**Close poll**

```bash
curl -s -X POST http://localhost:8787/api/polls/POLL_ID/close \
  -H 'Content-Type: application/json' \
  -d '{
    "organizer_secret": "ORGANIZER_SECRET"
  }'
```

## MCP server

The MCP server wraps the same HTTP API for AI agents (stdio transport).

### Setup

```bash
cd mcp
npm install
npm run build
```

Set `MEETGRID_API_URL` to your worker URL (defaults to `http://127.0.0.1:8787` for local dev).

### Cursor MCP config

Add to `.cursor/mcp.json` (or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "meetgrid": {
      "command": "node",
      "args": ["/absolute/path/to/meetgrid/mcp/dist/index.js"],
      "env": {
        "MEETGRID_API_URL": "http://127.0.0.1:8787"
      }
    }
  }
}
```

For production, set `MEETGRID_API_URL` to your deployed worker URL.

### MCP tools

| Tool | Description |
|------|-------------|
| `poll_create` | Create poll with auto-generated slots |
| `poll_get` | Get public poll view by ID |
| `poll_respond` | Submit or update Yes/No votes |
| `poll_set_decision` | Organizer marks chosen slot |
| `poll_close` | Organizer closes poll |

Organizer secrets are returned only from `poll_create` — never from `poll_get`.

## Security model

- **poll_id** — public, unguessable (12-char alphanumeric)
- **organizer_secret** — capability token; shown once at creation; stored hashed in D1
- **edit_token** — per-respondent; returned on respond; stored hashed; enables self-service edits via cookie or copyable link
- Public GET responses never include organizer secrets

## Pages

| URL | Purpose |
|-----|---------|
| `/` | Create poll |
| `/p/:id` | Respond (Yes/No per slot) |
| `/p/:id/results` | Ranked results + heatmap; organizer actions with `?secret=` |

## License

MIT
