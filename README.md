<div align="center">

# 👻 ECHO
### The Living Institutional Memory Engine for Universities

**"Every batch leaves. Make sure their knowledge didn't take everything with them."**

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Embeddings%20%26%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq-Whisper%20%26%20LLM-F55036?style=for-the-badge)](https://groq.com/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp%20Bot-Baileys%20Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Deployed on Railway](https://img.shields.io/badge/Railway-Production%20Live-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app)

</div>

---

## 📌 The Problem

At modern engineering colleges and universities, senior wisdom is trapped in ephemeral WhatsApp groups, late-night DMs, and hallway conversations. 

* *Which professor is strict with midterms?*
* *How do you balance an IIT Madras dual degree with 48-hour project sprints?*
* *How did past juniors crack international internships in Singapore or the Apple Academy?*

When senior batches graduate, **years of institutional survival knowledge vanish forever**. Junior batches repeatedly make the same mistakes, ask the same unanswered questions, and struggle with the same unwritten rules.

---

## 💡 What is ECHO?

**ECHO** is an AI-powered institutional memory engine that continuously captures, organizes, and synthesizes campus knowledge from both voice recordings on the web and real-time conversations across WhatsApp group chats.

```
       ┌────────────────────────────────────────────────────────┐
       │                 CAMPUS KNOWLEDGE SOURCES                │
       └────────────────────────────────────────────────────────┘
                 │                                    │
    🎙️ Voice Notes & Web Submissions        💬 WhatsApp Group Chats
                 │                                    │
                 ▼                                    ▼
       [ Groq Whisper Large v3 ]             [ Baileys Event Stream ]
        • Speech-to-Text Transcription        • Multi-lingual Intent Detection
                 │                            • Q&A Verification (Groq/Gemini)
                 ▼                                    │
       [ Gemini Embeddings Engine ] ◄─────────────────┘
        • 3072-Dimensional Vector Generation
        • Cross-Group Deduplication & Consensus Merging
                 │
                 ▼
       ┌────────────────────────────────────────────────────────┐
       │             ECHO MULTI-CHANNEL CORE (SQLite)           │
       │    • Persistent Knowledge Store   • Time-Decay Engine  │
       │    • Knowledge Gaps Tracker       • Consensus Metrics  │
       └────────────────────────────────────────────────────────┘
                 │                                    │
                 ▼                                    ▼
       🌐 WEB APP DISCOVERY                  💬 WHATSAPP BOT REPLIES
        • Semantic Cosine Search              • Automated Instant Answers
        • Senior Consensus Synthesis          • DM Fallback for Locked Groups
        • Interactive Knowledge Radar         • 👻 Silent Confirmation Reactions
```

---

## 🚀 Key Features

### 1. 💬 Autonomous WhatsApp Knowledge Bot
* **Multi-Lingual Question Intent Detection**: Understands questions in plain English, Hindi, and Hinglish (e.g. *"Pushkar sir kaisa padhate h"*, *"attendance criteria kya hai"*), with or without question marks.
* **Instant Auto-Replies**: When a student asks a question in any group, Echo semantically matches the knowledge base and delivers a verified answer in seconds.
* **Locked Announcement Channel Support**: If the bot lacks permission to post in a restricted announcement channel, it privately direct-messages (DM) the student the verified answer.
* **Passive Conversation Capture**: When a senior answers a junior's question in chat, Echo verifies the pair via LLM and saves it to the central repository with a 👻 ghost reaction.
* **Silent Confirmation Voting**: Reactions like 👍, 💯, or messages like `+1` / `vouch` automatically boost the memory's confidence score across groups.

### 2. 🧠 "Ask the Batch" — Consensus Synthesis
* Instead of returning disconnected search links, Echo analyzes matching senior memories and uses **Google Gemini** & **Groq** to generate a single synthesized consensus answer.
* Displays a live **Senior Agreement Meter** showing the percentage of seniors aligned on the advice.

### 3. 🎙️ 60-Second Senior Voice Studio
* Built-in browser audio recorder powered by native `MediaRecorder` and real-time audio equalizers.
* Automatic transcription via **Groq Whisper Large v3 Turbo** with near-zero latency.
* Tagged by Course Code, Professor, and Category with a real-time live preview card.

### 4. 📡 The Knowledge Gaps Radar
* Automatically logs every student search query that currently lacks a senior answer.
* Visualizes campus blind spots ranked by question frequency, enabling senior mentors and student councils to address high-demand topics with 1-click answer workflows.

### 5. 🧬 Time-Decay Memory Health
* Every piece of advice has a dynamic health score based on time-decay math and confirmation counts:
  - 🟢 **Fresh** (< 6 months / recently reconfirmed)
  - 🟡 **Aging** (6–12 months)
  - 🔴 **Stale** (> 1 year / outdated curriculum)
* Students can click **"Mark as Still True"** to re-verify older advice and restore freshness.

### 6. 🏷️ JIT (Just-In-Time) QR Handover
* One-click printable QR code generation for any specific Echo.
* Stick them on hardware lab doors, hostel noticeboards, or professor cabins so juniors can scan and listen to senior notes right where they need them.

---

## 🛠️ Technology Stack

| Domain | Technology | Purpose |
|---|---|---|
| **Backend** | Python 3.11+, Flask | High-throughput REST API and templating engine |
| **Speech-to-Text** | Groq Whisper Large v3 Turbo | Blazing-fast voice note transcription |
| **Vector Embeddings** | Google Gemini `gemini-embedding-001` | 3072-dimensional semantic vector search |
| **Synthesis & LLM** | Google Gemini 3.1 Flash + Groq | Multi-perspective consensus answer synthesis |
| **WhatsApp Layer** | Node.js + `@whiskeysockets/baileys` | Multi-device WebSocket connection to WhatsApp |
| **Database** | SQLite + NumPy | Local vector math and institutional storage |
| **Styling & UI** | Vanilla CSS3 (Custom Design System) | Glassmorphism, CSS keyframe animations, dark mode |
| **Deployment** | Railway | Microservices architecture with persistent volumes |

---

## 🏁 Quick Start (Run Locally)

### 1. Prerequisites
- Python 3.11 or higher
- Node.js 18+ (for WhatsApp Bot)
- Free API keys from [Groq Console](https://console.groq.com/) and [Google AI Studio](https://aistudio.google.com/)

### 2. Backend Setup
```bash
# Clone the repository
git clone https://github.com/GyatsoYT/Echo.git
cd Echo

# Install Python dependencies
pip install -r requirements.txt

# Create environment configuration
cp .env.example .env
```

Edit `.env` with your API keys:
```ini
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
SECRET_KEY=your-secret-key
```

Run the Flask server:
```bash
python app.py
```
*Visit `http://localhost:5000` in your browser.*

---

### 3. WhatsApp Bot Setup
```bash
cd whatsapp-bot
npm install
node bot.js
```
*Scan the QR code printed in the terminal (or at `http://localhost:5000/bot/qr`) using WhatsApp on your phone (`Linked Devices`).*

---

## 🏛️ Architecture & Data Model

```sql
-- Core Memory Units (Audio, Transcripts, Vector Embeddings)
CREATE TABLE echoes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    course_tag        TEXT    NOT NULL,
    professor_tag     TEXT,
    topic_tag         TEXT,
    transcript        TEXT    NOT NULL,
    audio_path        TEXT    DEFAULT '',
    embedding         BLOB    NOT NULL,
    confirmations     INTEGER DEFAULT 1,
    source            TEXT    DEFAULT 'web',
    question_context  TEXT,
    group_names       TEXT    DEFAULT '[]',
    group_count       INTEGER DEFAULT 1,
    last_confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Search Analytics (Powers the Knowledge Gaps Radar)
CREATE TABLE searches (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    query_text        TEXT    NOT NULL,
    best_match_score  REAL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🌐 Production Deployment (Railway)

ECHO is configured for turnkey multi-service deployment on **Railway**:

1. **Flask Web API**: Deployed with `Procfile` / `railway.toml` using `gunicorn app:app`.
2. **WhatsApp Bot Worker**: Deployed in `whatsapp-bot/` using persistent volume storage for WhatsApp session keys (`/data/auth_session`).
3. **Zero-Config Persistent Storage**: Configured via `DATABASE_PATH` and `UPLOAD_FOLDER` environment variables.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>Built for the Scaler School of Technology (SST) Community · People graduate. Knowledge shouldn't.</sub>
</div>