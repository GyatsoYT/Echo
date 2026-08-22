# Echo WhatsApp Bot

A WhatsApp capture bot that turns **group reply-to-message pairs** into searchable Echoes in the Echo institutional memory engine.

## How it works

```
[WhatsApp group]
    Someone asks: "Does Prof. Mehta give extensions?"
    A senior REPLIES to that message: "Yes, email him before the deadline..."
         │
         ▼ (bot detects the reply)
    LLM filter: Is this a real campus Q&A? YES
         │
         ▼
    POST /api/ghosts → Flask backend → SQLite + embedding
         │
         ▼
    👻 Ghost emoji reaction sent on the reply to confirm capture
         │
         ▼
    Echo website shows new entry with 💬 WhatsApp badge
```

## Setup (one-time)

### Prerequisites
- Node.js 18+ (already installed via `winget`)
- A **spare WhatsApp account** (a second SIM, or WhatsApp on an emulator) to use as the bot number
- Your Groq API key (free at [console.groq.com](https://console.groq.com))

### Steps

```bash
cd whatsapp-bot

# 1. Install dependencies
npm install

# 2. Copy env file and fill in your Groq API key
copy .env.example .env
# Edit .env: set GROQ_API_KEY=gsk_...

# 3. Start the bot
node bot.js
```

You'll see a QR code in the terminal. **Scan it** with the bot's WhatsApp number (not your personal one).

Then:
1. Add the bot's number to your test WhatsApp group
2. Have someone send a question in the group
3. Have a teammate **reply to that question** with an answer
4. Watch the bot react with 👻 and the Echo appear on your website

## Demo script (for judges)

> "You asked why someone would come to our website instead of WhatsApp. Let me show you."
> 
> *(Switch to the test WhatsApp group)*
> 
> "I'm going to ask a question." *(Type a question)*
> "My teammate is going to reply to it." *(Teammate hits Reply and types an answer)*
> 
> *(Switch back to the Echo website — open /echoes)*
> 
> "That reply just became a Ghost — searchable, tagged, with Memory Health tracking. Automatically."
> 
> "This is our test group. The next step is a single opt-in pilot with an official group — we want to do consent and reliability right before we scale."

## Architecture

This is a **separate process** — it never modifies the Flask app, SQLite schema, or embedding pipeline. It only calls:
- `POST /api/ghosts` — the additive endpoint added to Flask

## Quality filters

The bot uses two layers:
1. **Length filter**: question ≥ 10 chars, answer ≥ 15 chars
2. **LLM filter** (via Groq, free): validates the pair is a genuine campus Q&A. Passes questions like "how does Prof. Mehta grade?" but rejects "lol ok thanks" or memes.

If GROQ_API_KEY is not set, falls back to heuristic: checks for `?` + minimum length.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | Groq API key for LLM quality filtering |
| `FLASK_URL` | `http://127.0.0.1:5000` | URL of your running Flask backend |

## Honest notes for judges (if asked)

- **Baileys is unofficial** — it automates WhatsApp Web, against WhatsApp ToS. Fine for a hackathon prototype in a controlled group. A production version would evaluate Meta's official Business API.
- **Opt-in only** — we tested this in our own group with full awareness. We wouldn't deploy to any existing group without every member's explicit consent.
- The bot only captures messages that someone **explicitly replies to**, which is already a public signal within the group.
