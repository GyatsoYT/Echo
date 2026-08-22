# Echo — Institutional Memory Engine

> **"People graduate. Knowledge shouldn't."**

Echo is a semantic, time-aware institutional memory layer for universities. Seniors leave voice "Echoes" — tagged by course/professor/topic. Juniors ask questions in plain language. Echo searches semantically, synthesises answers from multiple Echoes, surfaces knowledge gaps, and shows memory health badges.

---

## Quick Start

```bash
# 1. Clone / navigate to project
cd d:/Hackathon

# 2. Install dependencies
python -m pip install -r requirements.txt

# 3. Set up API keys (copy .env.example → .env, fill in keys)
copy .env.example .env
# Edit .env with your keys:
#   GROQ_API_KEY  → from https://console.groq.com/   (free, no credit card)
#   GEMINI_API_KEY → from https://aistudio.google.com/ (free, no credit card)

# 4. Run
python app.py

# 5. Open http://localhost:5000
```

---

## Project Structure

```
Echo/
├── app.py                    ← Flask app entry point (start here)
├── config.py                 ← All constants & API keys (tweak thresholds here)
├── requirements.txt
├── .env.example              ← Copy to .env, fill in keys
│
├── database/
│   └── db.py                 ← SQLite schema + all DB helpers
│
├── services/
│   ├── transcription.py      ← Groq Whisper (audio → text)
│   ├── embeddings.py         ← Gemini embedding + offline fallback
│   ├── search.py             ← Cosine similarity search over stored Echoes
│   ├── synthesis.py          ← "Ask the Batch" (Groq Llama + template fallback)
│   └── memory_health.py      ← Freshness + confirmation badge math
│
├── routes/
│   ├── echoes.py             ← POST /record, GET /echoes, GET /echoes/<id>
│   ├── search.py             ← GET/POST /search, GET /results
│   └── admin.py              ← GET /gaps, GET /qr/<id>, POST /seed
│
├── static/
│   ├── css/style.css         ← All styling (design system)
│   ├── js/recorder.js        ← MediaRecorder (in-browser audio capture)
│   └── js/app.js             ← Form handling, animations, alerts
│
└── templates/
    ├── base.html             ← Navbar, footer, shared layout
    ├── index.html            ← Landing page
    ├── record.html           ← Leave an Echo (senior view)
    ├── search.html           ← Ask a question (junior view)
    ├── results.html          ← Search results + Ask the Batch synthesis
    ├── echoes.html           ← Browse all Echoes
    ├── echo_detail.html      ← Single Echo + QR code + delete
    ├── gaps.html             ← Knowledge Gaps dashboard
    └── error.html            ← 404/500 error pages
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | Flask (Python) | Simple, fast to iterate |
| Frontend | HTML + Vanilla CSS + JS | No build tooling needed |
| Speech-to-text | Groq Whisper Large v3 Turbo | Free tier, 2000 req/day, blazing fast |
| Embeddings | Google Gemini `gemini-embedding-001` | Free tier, 1500 req/day, high quality |
| Synthesis | Groq Llama 3.1-8b-instant | Same free Groq account, fast |
| Similarity | numpy cosine similarity | Perfect for demo-scale data |
| Database | SQLite | Zero setup, file-based |
| Audio | MediaRecorder Web API | Native, no libraries |
| QR codes | `qrcode` Python package | One-line generation |

---

## API Keys Setup

### Groq (Whisper + LLM)
1. Go to https://console.groq.com/
2. Sign up (free, no credit card)
3. Navigate to API Keys → Create New Key
4. Copy the key to `.env` as `GROQ_API_KEY`

Free limits: **2,000 whisper requests/day**, **unlimited chat** (rate limited by token/minute but generous)

### Gemini Embeddings
1. Go to https://aistudio.google.com/
2. Sign in with Google
3. Get API Key → Create API Key
4. Copy to `.env` as `GEMINI_API_KEY`

Free limits: **1,500 embedding requests/day**, **10M tokens/minute**

---

## Features

### 1. Leave an Echo (Senior View)
- **URL:** `/record`
- Record audio in-browser (MediaRecorder) OR upload a file OR type manually
- Tag by course code (required), professor (optional), topic (optional)
- Auto-transcribes via Groq Whisper
- Auto-embeds via Gemini
- **Deduplication:** If a near-identical Echo already exists (>92% similarity + same course), confirmation count is bumped instead of inserting a duplicate

### 2. Ask the Batch (Junior View)
- **URL:** `/search` → `/results?q=...`
- Type a plain-language question
- Semantic search via cosine similarity across all Echo embeddings
- Returns top matches sorted by relevance
- If 2+ matches → triggers "Ask the Batch" synthesis (Groq LLM or template fallback)
- Every search is logged (powers Knowledge Gaps)

### 3. Memory Health Badge
- Shown on every Echo card
- `🟢 fresh` = < 6 months old
- `🟡 aging` = 6–12 months old
- `🔴 stale` = > 12 months old
- Also shows confirmation count ("confirmed by 3 seniors")

### 4. Knowledge Gaps
- **URL:** `/gaps`
- Shows searches where the best match scored below 0.45 similarity
- Grouped by query text, sorted by frequency
- Your demo's killer feature — shows the institution's blind spots

### 5. JIT Handover (QR Codes)
- **URL:** `/qr/<echo_id>`
- Generates a purple QR code image linking directly to that Echo
- Download and stick it on lab doors, notice boards, etc.

---

## Seeding Demo Data

The database starts empty. For demos, seed it first:

**Option A: Via UI (easiest)**
- Visit `http://localhost:5000`
- If no Echoes exist, a "🌱 Seed Demo Data" button appears
- Click it — inserts 15 realistic Echoes covering CS301, EC202, MATH101, portal quirks, etc.

**Option B: Via API**
```bash
curl -X POST http://localhost:5000/seed
```

**Option C: While the app is running**, navigate to `/gaps` after seeding and do a few test searches to populate the Knowledge Gaps table too.

---

## Configuration (config.py)

Tweak these constants without touching core logic:

```python
SIMILARITY_THRESHOLD = 0.45   # Minimum cosine similarity to show as a result
GAP_THRESHOLD = 0.45          # Below this → logged as a Knowledge Gap
ASK_BATCH_MIN_MATCHES = 2     # Min results before triggering synthesis
HEALTH_GREEN_DAYS = 180       # < 6 months → 🟢 fresh
HEALTH_YELLOW_DAYS = 365      # < 12 months → 🟡 aging
```

---

## Fallback Plan (Demo Day)

If APIs are down or wifi is flaky:

| Feature | Fallback |
|---|---|
| Groq Whisper fails | Show manual transcript input (already coded) |
| Gemini embedding fails | Uses hash-based bag-of-words embedding (already coded) |
| Groq LLM synthesis fails | Uses template-based synthesis (already coded) |

All fallbacks are already in the code as `try/except` blocks. Zero extra work needed.

Pre-compute and cache seed Echo embeddings before the demo while wifi is confirmed good.

---

## Routes Reference

| Method | Route | Description |
|---|---|---|
| GET | `/` | Landing page |
| GET | `/record` | Leave an Echo page |
| POST | `/record` | Submit audio/transcript |
| GET | `/echoes` | Browse all Echoes |
| GET | `/echoes/<id>` | Single Echo detail |
| POST | `/echoes/<id>/delete` | Delete an Echo |
| GET | `/search` | Search page |
| POST | `/search` | JSON search API |
| GET | `/results?q=...` | Rendered results page |
| GET | `/gaps` | Knowledge Gaps view |
| GET | `/qr/<id>` | Generate QR code image |
| GET | `/api/stats` | JSON stats |
| POST | `/seed` | Seed demo data |

---

## Data Model

```sql
-- Echoes: the core memory units
CREATE TABLE echoes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_tag      TEXT    NOT NULL,
    professor_tag   TEXT,
    topic_tag       TEXT,
    transcript      TEXT    NOT NULL,
    audio_path      TEXT    NOT NULL,
    embedding       BLOB    NOT NULL,   -- JSON float array
    confirmations   INTEGER DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Searches: powers Knowledge Gaps
CREATE TABLE searches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query_text      TEXT    NOT NULL,
    best_match_score REAL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Team Task Split

### Backend (Gyatso — owner)
- `app.py`, `config.py`, `database/`, `services/`, `routes/`
- Groq + Gemini API integration
- Seed data

### Frontend (teammate 1)
- `static/css/style.css` — enhance/polish the design system
- `templates/` — add UI improvements, animations
- `static/js/app.js` — any additional interactions

### Docs / Demo (teammate 2)
- `README.md` — polish for submission
- Demo script (see PRD §10)
- Seed more realistic Echoes for your actual institution
- QR codes — generate and print for the JIT Handover demo

---

## Demo Script (Quick Reference)

1. Open app, show zero-state → click "Seed Demo Data"
2. Go to `/search` → ask "does Prof. Mehta recycle exam questions?"
3. Show results: Echo cards + Memory Health badges + Ask the Batch synthesis
4. Go to `/gaps` → "17 students asked X. No Echo answers it yet." ← killer line
5. Go to `/record` → live-record a 30-second voice Echo
6. Search for it → show it appearing semantically
7. Show QR code for JIT Handover concept
8. Close: "People graduate. Knowledge shouldn't."