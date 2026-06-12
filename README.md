# IE Manufacturing Planner

A full-stack project planning system for **Ingenious Engineering Pvt. Ltd.** — built with FastAPI, React, and Anthropic Claude.

## Setup

```bash
git clone <repo-url>
cd manufacturing-planner
```

### Backend

```bash
cd backend
cp .env.example .env        # Fill in DATABASE_URL and ANTHROPIC_API_KEY
pip install -r requirements.txt
alembic upgrade head        # Run all migrations
python seed.py              # Load demo data (projects, activities, persons)
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # Starts at http://localhost:5173
```

**Login:** `admin@ingenious.com` / `Admin@123`

---

## Architecture

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python 3.11) on port 8000 |
| Frontend | React 18 + Vite on port 5173 |
| Database | Neon PostgreSQL (cloud, async via asyncpg) |
| ORM | SQLAlchemy 2.0 async + Alembic migrations |
| Auth | JWT (HS256), stored in localStorage |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Scheduling | APScheduler 3.10.4 (IST timezone) |
| Notifications | In-app + Email (SMTP) + SMS (Twilio) |

---

## Environment Variables

Create `backend/.env` with:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `SECRET_KEY` | Yes | JWT signing secret (any long random string) |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key — AI endpoints return 503 without it |
| `ALGORITHM` | No | JWT algorithm (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Token lifetime (default: `60`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Refresh token lifetime (default: `7`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `SMTP_FROM` | No | Sender address (default: `noreply@ingenious.com`) |
| `TWILIO_ACCOUNT_SID` | No | Twilio SID for SMS alerts |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_FROM_NUMBER` | No | Twilio phone number |
| `APP_URL` | No | Frontend URL for email links (default: `http://localhost:5173`) |

> *AI features degrade gracefully: app starts without `ANTHROPIC_API_KEY`, but `/api/v1/ai/*` endpoints return 503.

---

## Features

- **Gantt Chart** — column-index timeline (EPOCH = 25 Mar 2026, 2 days/col). Colour-coded by status: Done (blue), On Track (green), Slow (amber), Delayed (red).
- **Activity Management** — create, edit, set actual dates, add remarks, status overrides.
- **Resource Management** — assign people to activities, detect scheduling conflicts, view per-person Gantt.
- **Performance Analytics** — leaderboard, score gauges, trend charts, daily snapshots.
- **Notifications & Alerts** — in-app bell, configurable rules (delay thresholds, digest emails, SMS).
- **AI Assistant** — floating chat panel powered by Claude. Context-aware quick actions per page. Streaming token-by-token output.
- **AI Project Health** — one-click health summary card on each project page (10-min cache).
- **AI Person Insights** — performance summaries, coaching tips, workload assessments per person.
- **Excel Export** — download full project plan as formatted `.xlsx`.

---

## API Reference

Interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs)

| Prefix | Purpose |
|---|---|
| `POST /api/v1/auth/login` | Get JWT |
| `GET /api/v1/projects/` | List projects |
| `GET /api/v1/activities/?project_id=` | List activities with computed status |
| `GET /api/v1/status/project/{id}` | Full project status summary |
| `POST /api/v1/ai/chat/stream` | SSE streaming chat |
| `POST /api/v1/ai/predict` | Structured predictions (delay_risk, critical_path, …) |
| `GET /api/v1/ai/quick-summary/{id}` | Cached project health summary |
| `POST /api/v1/ai/person-insight` | Per-person AI insights |
| `GET /api/v1/performance/leaderboard` | Performance rankings |
| `GET /api/v1/notifications/` | In-app notifications |

---

## Testing

```bash
cd backend
python -m pytest tests/ -v
```

Covers `StatusService.compute_status` and `compute_project_summary` with 16 unit tests.

---

## Manual Checklist

- [ ] Login works, JWT stored in localStorage
- [ ] Gantt shows activities with correct colours
- [ ] Delayed activities render red
- [ ] Today line visible at correct column
- [ ] Click activity → edit modal opens
- [ ] Add person → avatar shows, conflict warning if applicable
- [ ] Resources page shows person cards with workload bars
- [ ] Performance page shows score gauge and trend chart
- [ ] Notification bell shows unread count, updates `document.title`
- [ ] AI Assistant opens, streaming works token-by-token
- [ ] "Delay risks" quick action returns specific activity names
- [ ] AIPredictionCard loads on project page, expandable
- [ ] Person drawer AI tab returns insights
- [ ] Export downloads valid `.xlsx`
