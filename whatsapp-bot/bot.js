/**
 * Echo WhatsApp Capture Bot
 * ─────────────────────────
 * Built with @whiskeysockets/baileys
 *
 * What it does:
 *   1. Listens in a WhatsApp group for "reply-to-message" events
 *   2. Uses an LLM (Groq, free) to verify the original is a genuine
 *      campus/college question and the reply is a genuine answer
 *   3. If both pass, POSTs to your Echo Flask backend as a new Ghost
 *   4. Optionally, when someone asks a question (non-reply), checks
 *      the Echo search API and replies with a pointer if found
 *
 * Setup:
 *   npm install
 *   node bot.js
 *   → Scan the QR code with the bot's WhatsApp account
 *   → Add the bot number to your test WhatsApp group
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} from "@whiskeysockets/baileys";

import fetch from "node-fetch";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import os from "os";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getLocalLanIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

// ── Config ───────────────────────────────────────────────────────────────────

const lanIp = getLocalLanIp();

const CONFIG = {
  // Flask backend URL (change port if different)
  FLASK_URL: process.env.FLASK_URL || "http://127.0.0.1:5000",

  // Public/LAN URL for clickable links in WhatsApp messages
  PUBLIC_URL: process.env.PUBLIC_URL || `http://${lanIp}:5000`,

  // Optional phone number for 8-digit pairing code (e.g. 919876543210)
  PHONE_NUMBER: process.env.PHONE_NUMBER || "",

  // API keys for quality filtering
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",

  // Minimum length for a message to even be considered
  MIN_QUESTION_LEN: 10,
  MIN_ANSWER_LEN:   12,

  // Cooldown: don't send auto-replies more than once per N ms per user
  AUTO_REPLY_COOLDOWN_MS: 60_000,

  // Auth session folder
  // On Railway: set AUTH_FOLDER=/data/auth_session (persistent volume)
  // Locally: ./auth_session
  AUTH_FOLDER: process.env.AUTH_FOLDER || path.join(__dirname, "auth_session"),

  // Whether to post pointer replies in group when Q matches an existing Echo
  ENABLE_POINTER_REPLIES: true,
};

// Load .env manually
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const [k, ...v] = trimmed.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    });
    if (process.env.GROQ_API_KEY)   CONFIG.GROQ_API_KEY   = process.env.GROQ_API_KEY;
    if (process.env.GEMINI_API_KEY) CONFIG.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (process.env.FLASK_URL)      CONFIG.FLASK_URL      = process.env.FLASK_URL;
    if (process.env.PUBLIC_URL)     CONFIG.PUBLIC_URL     = process.env.PUBLIC_URL;
    if (process.env.AUTH_FOLDER)    CONFIG.AUTH_FOLDER    = process.env.AUTH_FOLDER;
  }
} catch {}

// ── Logger ───────────────────────────────────────────────────────────────────

const logger = pino({ level: "silent" }); // suppress Baileys internal noise
const log = (...args) => console.log("[EchoBot]", ...args);
const warn = (...args) => console.warn("[EchoBot] WARN:", ...args);

// ── Auto-reply cooldown map ───────────────────────────────────────────────────

const autoReplyCooldowns = new Map();

// ── Safe fetch with timeout to prevent hanging ────────────────────────────────

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Smart heuristic fallback ──────────────────────────────────────────────────

function isHeuristicValidQAPair(question, answer) {
  const qLower = question.toLowerCase().trim();
  const aLower = answer.toLowerCase().trim();

  if (qLower.length < CONFIG.MIN_QUESTION_LEN || aLower.length < CONFIG.MIN_ANSWER_LEN) {
    return false;
  }

  // Answer cannot be just a repetition of the question or a question itself
  if (qLower === aLower) return false;
  if (aLower.endsWith("?") && aLower.length < 35) return false;

  // Question words (English + Hindi/Hinglish anywhere in query)
  const questionPattern = /\b(what|how|when|where|why|which|can|is|does|do|should|could|would|who|whom|whose|any|will|are|sir|prof|professor|pushkar|mehta|sharma|math|cs|ec|icp|exam|lab|attendance|assignment|portal|hostel|wifi|placement|kaun|kon|kya|kab|kaise|kaisa|kaisi|kesa|kesi|kese|kyun|kyu|kaha|kahan|kahape|kidhar|kidhr|kitna|kitne|kitni|konsa|konsi|konse|kaunsa|kaunsi|kisme|kisko|kisne|batao|bata|bataiye|btao|pata|scene)\b|(\b(h|hai|hein)\s+kya\b)/i;
  const isQuestion = question.includes("?") || questionPattern.test(qLower);

  // Reject generic conversational noise
  const noisePattern = /^(ok|okay|k|thanks|thank you|ty|thx|lol|lmao|haha|nice|cool|yep|yes|no|done|fine|sahi hai|theek hai|got it)\b/i;
  const isNoise = noisePattern.test(aLower) && aLower.length < 25;

  return isQuestion && !isNoise;
}

// ── LLM Quality Filter ────────────────────────────────────────────────────────

async function isValidQAPair(question, answer) {
  const qTrim = question.trim();
  const aTrim = answer.trim();

  // Basic sanity check: answer cannot just be the same question or a short query
  if (qTrim.toLowerCase() === aTrim.toLowerCase()) return false;
  if (aTrim.endsWith("?") && aTrim.length < 35) return false;

  const prompt = `You are a binary classifier for a college/campus institutional memory system.
You understand English, Hindi, and Hinglish (e.g. "teacher kaun hai", "attendance kitni chahiye").

Given this WhatsApp group message exchange:
QUESTION: "${qTrim}"
ANSWER: "${aTrim}"

Criteria:
1. QUESTION must be a genuine college/campus question in any language (about courses, professors, labs, exams, attendance, hostel, deadlines, placements, assignments, etc.)
2. ANSWER must be an informative response to that question (NOT just repeating the question, not a meme, not a joke, not "ok/thanks").

Respond with EXACTLY the single word: YES or NO.`;

  // 1. Try Gemini 3.1 Flash Lite / Flash first (multilingual + high quota)
  if (CONFIG.GEMINI_API_KEY) {
    for (const model of ["gemini-3.1-flash-lite", "gemini-3.6-flash"]) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }, 3500);

        if (res.ok) {
          const data = await res.json();
          const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toUpperCase();
          log(`QA verdict (Gemini ${model}): "${text}" | Q: "${qTrim.slice(0, 40)}" | A: "${aTrim.slice(0, 40)}"`);
          if (text === "YES" || text.startsWith("YES")) return true;
          if (text === "NO" || text.startsWith("NO")) return false;
        }
      } catch (err) {
        // Fallback
      }
    }
  }

  // 2. Try Groq (groq/compound-mini - ultra-fast binary output)
  if (CONFIG.GROQ_API_KEY) {
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model: "groq/compound-mini",
          messages: [
            { role: "system", content: "You are a binary classifier. Reply with ONLY 'YES' or 'NO'." },
            { role: "user", content: prompt },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
      }, 3500);

      if (res.ok) {
        const data = await res.json();
        let verdict = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
        verdict = verdict.replace(/<THINK>[\s\S]*?(<\/THINK>|$)/gi, "").trim();
        log(`QA verdict (Groq): "${verdict}" | Q: "${qTrim.slice(0, 40)}" | A: "${aTrim.slice(0, 40)}"`);
        if (verdict === "YES" || verdict.startsWith("YES")) return true;
        if (verdict === "NO" || verdict.startsWith("NO")) return false;
      }
    } catch (err) {
      warn("Groq validation timed out/failed:", err.message);
    }
  }

  // 3. Smart Heuristic Fallback
  const heuristicResult = isHeuristicValidQAPair(qTrim, aTrim);
  log(`QA verdict (Heuristic): ${heuristicResult ? "YES" : "NO"} | Q: "${qTrim.slice(0, 40)}" | A: "${aTrim.slice(0, 40)}"`);
  return heuristicResult;
}

// ── Course tag extraction ──────────────────────────────────────────────────────
// Tries to extract a course code from the message text (e.g. CS301, ICP101)

// ── Recent questions tracker for unquoted conversation capture ───────────────
// Maps group jid -> array of { text, sender, key, timestamp } (expires after 5 mins)
const recentGroupQuestions = new Map();
const QUESTION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function recordRecentQuestion(jid, text, sender, key) {
  if (!recentGroupQuestions.has(jid)) {
    recentGroupQuestions.set(jid, []);
  }
  const list = recentGroupQuestions.get(jid);
  const now = Date.now();
  // Filter out expired entries
  const fresh = list.filter((q) => now - q.timestamp < QUESTION_EXPIRY_MS);
  fresh.push({ text, sender, key, timestamp: now });
  // Keep max 5 most recent
  recentGroupQuestions.set(jid, fresh.slice(-5));
}

function getRecentQuestions(jid, excludeSender = null) {
  const list = recentGroupQuestions.get(jid) || [];
  const now = Date.now();
  const fresh = list.filter((q) => now - q.timestamp < QUESTION_EXPIRY_MS);
  recentGroupQuestions.set(jid, fresh);
  if (excludeSender) {
    return fresh.filter((q) => q.sender !== excludeSender);
  }
  return fresh;
}

function removeRecentQuestion(jid, text) {
  const list = recentGroupQuestions.get(jid) || [];
  const remaining = list.filter((q) => q.text.trim().toLowerCase() !== text.trim().toLowerCase());
  recentGroupQuestions.set(jid, remaining);
}

// ── Reaction helper ──────────────────────────────────────────────────────────

async function sendGhostReaction(sock, jid, msgKey) {
  try {
    if (!msgKey) return;
    const cleanKey = {
      remoteJid: msgKey.remoteJid || jid,
      id: msgKey.id,
      fromMe: Boolean(msgKey.fromMe),
      participant: msgKey.participant || undefined,
    };
    await sock.sendMessage(jid, {
      react: {
        text: "👻",
        key: cleanKey,
      },
    });
    log(`Ghost emoji reaction sent for message ${msgKey.id}`);
  } catch (err) {
    warn("Reaction failed:", err.message);
  }
}

// ── Check existing Echoes & get synthesis ──────────────────────────────────────

async function searchEchoSynthesis(query) {
  try {
    const res = await fetchWithTimeout(`${CONFIG.FLASK_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }, 10000);

    if (!res.ok) return null;
    const data = await res.json();

    if (data.result_count > 0 && data.synthesis && data.synthesis.answer) {
      const ans = data.synthesis.answer.trim();
      // Ignore fallback messages that say no memories exist
      if (ans.toLowerCase().includes("no seniors have shared memories") ||
          ans.toLowerCase().includes("no matching echoes found")) {
        return null;
      }
      return {
        answer: ans,
        resultCount: data.result_count,
        url: `${CONFIG.PUBLIC_URL}/results?q=${encodeURIComponent(query)}`,
      };
    }
    return null;
  } catch (err) {
    if (err.name !== "AbortError") {
      warn("Flask search request failed:", err.message);
    }
    return null;
  }
}

// ── Group names cache ────────────────────────────────────────────────────────
const groupNamesCache = new Map();

async function getGroupName(sock, jid) {
  if (groupNamesCache.has(jid)) return groupNamesCache.get(jid);
  try {
    const meta = await sock.groupMetadata(jid);
    const name = meta?.subject || "WhatsApp Group";
    groupNamesCache.set(jid, name);
    return name;
  } catch {
    return "WhatsApp Group";
  }
}

// ── Course tag extraction ──────────────────────────────────────────────────────
// Tries to extract a course code from the message text (e.g. CS301, ICP101)

function extractCourseTag(text) {
  const match = text.match(/\b([A-Z]{2,6}\s*\d{2,4})\b/i);
  if (match) return match[1].toUpperCase().replace(/\s+/, "");
  // Keyword-based fallback
  const keywords = [
    ["exam", "exams"],
    ["lab"],
    ["hostel", "wifi", "campus"],
    ["portal", "registration"],
    ["internship", "placement"],
    ["library"],
    ["professor", "prof", "sir"],
    ["attendance"],
    ["assignment"],
  ];
  const lower = text.toLowerCase();
  for (const [primary, ...aliases] of keywords) {
    if ([primary, ...(aliases || [])].some((k) => lower.includes(k))) return primary;
  }
  return "general";
}

// ── POST to Flask backend (with Cross-Group Tagging & Deduplication) ───────────

async function saveToEcho(question, answer, groupName = "") {
  const courseTag = extractCourseTag(question + " " + answer);

  try {
    const res = await fetchWithTimeout(`${CONFIG.FLASK_URL}/api/ghosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_tag:       courseTag,
        transcript:       answer,
        question_context: question,
        source:           "whatsapp",
        group_name:       groupName,
      }),
    }, 6500);

    const data = await res.json();
    if (res.ok) {
      if (data.status === "confirmed") {
        log(`📌 Cross-group duplicate merged! echo_id=${data.echo_id}, heard in ${data.group_count} groups (${data.group_names?.join(", ")})`);
      } else {
        log(`Saved to Echo! echo_id=${data.echo_id}, course=${courseTag}, group="${groupName}"`);
      }
      return data.echo_id;
    } else {
      warn("Flask rejected Ghost:", data.error);
      return null;
    }
  } catch (err) {
    warn("Failed to reach Flask backend:", err.message);
    return null;
  }
}

// ── Silent Confirmation (+1, 👍, vouch helper) ───────────────────────────────

async function confirmEcho(queryOrId, groupName = "") {
  try {
    const payload =
      typeof queryOrId === "number"
        ? { echo_id: queryOrId, group_name: groupName }
        : { query: queryOrId, group_name: groupName };

    const res = await fetchWithTimeout(`${CONFIG.FLASK_URL}/api/ghosts/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 5000);

    if (res.ok) {
      const data = await res.json();
      log(`[Silent Confirmation] echo_id=${data.echo_id}, total confirmations=${data.confirmations}, groups=${data.group_count}`);
      return data.echo_id;
    }
  } catch (err) {
    warn("Confirm API failed:", err.message);
  }
  return null;
}

// ── Lightweight HTTP Server for QR viewing (if port available) ─────────────────

let _activeQrString = null;
let _httpServerStarted = false;

function ensureQrServer() {
  if (_httpServerStarted) return;
  const port = process.env.PORT || 3000;
  try {
    const server = http.createServer((req, res) => {
      if (req.url === "/qr" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if (!_activeQrString) {
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff;">
              <h2>✅ WhatsApp Bot Connected or Initializing...</h2>
              <p>Check the server logs if you need to reconnect.</p>
            </body></html>
          `);
        } else {
          const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(_activeQrString)}`;
          res.end(`
            <html>
            <head><meta http-equiv="refresh" content="6"><title>Scan WhatsApp QR</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:30px;background:#0F1117;color:#fff;">
              <h2 style="color:#25D366;margin-bottom:8px;">📱 Link WhatsApp Bot</h2>
              <p style="color:#aaa;margin-bottom:20px;">Open WhatsApp > Linked Devices > Link a Device, then scan:</p>
              <div style="background:#fff;padding:16px;display:inline-block;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);">
                <img src="${qrImgUrl}" width="320" height="320" style="display:block;" />
              </div>
              <p style="color:#666;font-size:13px;margin-top:16px;">Auto-refreshing every 6s</p>
            </body>
            </html>
          `);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, () => {
      log(`Local QR viewer server running on port ${port}`);
    });
    _httpServerStarted = true;
  } catch (err) {
    warn("Could not start local QR HTTP server:", err.message);
  }
}

// ── Main bot ──────────────────────────────────────────────────────────────────

async function startBot() {
  ensureQrServer();

  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  log(`Starting Echo WhatsApp Bot (Baileys v${version.join(".")})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    getMessage: async () => ({ conversation: "" }),
  });

  // Save credentials on update
  sock.ev.on("creds.update", saveCreds);

  // Optional: Pairing Code authentication (no QR camera needed!)
  if (!sock.authState.creds.registered && CONFIG.PHONE_NUMBER) {
    const cleanNumber = CONFIG.PHONE_NUMBER.replace(/[^0-9]/g, "");
    if (cleanNumber.length >= 10) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(cleanNumber);
          log("\n=======================================================");
          log(`🔑 OPTION A: WHATSAPP PAIRING CODE (NO QR SCAN NEEDED)`);
          log(`👉 8-DIGIT PAIRING CODE: ${code}`);
          log(`=======================================================`);
          log(`Steps on phone:`);
          log(`1. Open WhatsApp -> Settings -> Linked Devices`);
          log(`2. Tap "Link a Device" -> "Link with phone number instead"`);
          log(`3. Enter this code: ${code}\n`);
        } catch (err) {
          warn("Pairing code error:", err.message);
        }
      }, 3000);
    }
  }

  // Handle connection updates
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      _activeQrString = qr;
      const directImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;

      log("\n=======================================================");
      log("📱 OPTION B: SCAN QR CODE IN YOUR BROWSER");
      log("Click or open this link to see a crystal-clear QR image:");
      log(`👉 ${directImageUrl}`);
      if (CONFIG.PUBLIC_URL || CONFIG.FLASK_URL) {
        log(`👉 OR ON YOUR WEBSITE: ${(CONFIG.PUBLIC_URL || CONFIG.FLASK_URL).replace(/\/$/, '')}/bot/qr`);
      }
      log("=======================================================\n");

      // Also sync to Flask backend
      fetchWithTimeout(`${CONFIG.FLASK_URL}/api/bot/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr, status: "waiting" }),
      }, 2500).catch(() => {});
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      warn(`Connection closed (code ${code}). Reconnecting in 3s: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startBot, 3000);
    } else if (connection === "open") {
      _activeQrString = null;
      log("\n=======================================================");
      log("✅ CONNECTED TO WHATSAPP! Bot is listening in groups.");
      log(`Flask backend: ${CONFIG.FLASK_URL}`);
      log(`Clickable Public URL: ${CONFIG.PUBLIC_URL}`);
      log(`Pointer replies: ${CONFIG.ENABLE_POINTER_REPLIES ? "enabled" : "disabled"}`);
      log("=======================================================\n");

      // Sync connected status to Flask backend
      fetchWithTimeout(`${CONFIG.FLASK_URL}/api/bot/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr: null, status: "connected" }),
      }, 2500).catch(() => {});
    }
  });

  // ── Reaction listener (Silent Confidence Capture from 👍, ❤️, 💯, 👏, 🔥) ───
  sock.ev.on("messages.reaction", async (reactions) => {
    try {
      for (const r of reactions) {
        const jid = r.key?.remoteJid;
        if (!jid || !isJidGroup(jid)) continue;
        const text = r.reaction?.text;
        if (text && /^(👍|❤️|💯|👏|🔥|💡|✅|👻|➕)/.test(text)) {
          const groupName = await getGroupName(sock, jid);
          const pendingQuestions = getRecentQuestions(jid);
          for (const q of pendingQuestions) {
            if (q.key?.id === r.key.id) {
              log(`[Reaction Vote "${text}"] boosting confidence for question: "${q.text.slice(0, 50)}"`);
              await confirmEcho(q.text, groupName);
              break;
            }
          }
        }
      }
    } catch (rxErr) {
      warn("Error handling reaction event:", rxErr.message);
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        // Skip own messages, broadcasts, status updates
        if (msg.key.fromMe) continue;
        if (!isJidGroup(msg.key.remoteJid)) continue;  // only listen in groups

        const jid   = msg.key.remoteJid;
        const senderId = msg.key.participant || jid;
        const groupName = await getGroupName(sock, jid);

        // Extract text content
        const body =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          "";

        const cleanText = body.trim();
        if (!cleanText || cleanText.length < 2) continue;

        // ── Flow 0: Silent Confirmation (+1, same, agreed, vouch, this, fr) ────
        const isConfirmation =
          /^((\+1|same|true|agreed|vouch|this|fr|yes this|valid|confirmed|seconded|upvote|\+100|yep|definitely))\b/i.test(cleanText) &&
          cleanText.length < 25;

        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedId  = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

        if (isConfirmation) {
          const quotedText = (
            quotedMsg?.conversation ||
            quotedMsg?.extendedTextMessage?.text ||
            quotedMsg?.imageMessage?.caption ||
            ""
          ).trim();

          const targetQuery = quotedText || (getRecentQuestions(jid, senderId)[0]?.text);
          if (targetQuery) {
            log(`[Silent Confirmation Detected: "${cleanText}"] in group "${groupName}" for: "${targetQuery.slice(0, 60)}"`);
            const confirmedId = await confirmEcho(targetQuery, groupName);
            if (confirmedId) {
              await sendGhostReaction(sock, jid, msg.key);
              continue;
            }
          }
        }

        const isQuestion =
          cleanText.includes("?") ||
          /\b(what|how|when|where|who|why|which|can|is|does|do|should|could|would|are|will|whom|whose|kaun|kon|kya|kab|kaise|kaisa|kaisi|kesa|kesi|kese|kyun|kyu|kaha|kahan|kahape|kidhar|kidhr|kitna|kitne|kitni|konsa|konsi|konse|kaunsa|kaunsi|kisme|kisko|kisne|batao|bata|bataiye|btao|pata|scene)\b|(\b(h|hai|hein)\s+kya\b)/i.test(cleanText);

        // ── Flow 1: Explicit Quoted Reply ──────────────────────────────────────
        if (quotedMsg && quotedId && !isConfirmation) {
          const question = (
            quotedMsg.conversation ||
            quotedMsg.extendedTextMessage?.text ||
            quotedMsg.imageMessage?.caption ||
            ""
          ).trim();
          const answer = cleanText;

          if (question.length >= CONFIG.MIN_QUESTION_LEN && answer.length >= CONFIG.MIN_ANSWER_LEN) {
            log(`\n[Explicit Reply in "${groupName}"]`);
            log(`  Q: "${question.slice(0, 80)}"`);
            log(`  A: "${answer.slice(0, 80)}"`);

            const valid = await isValidQAPair(question, answer);
            if (valid) {
              log("  -> Valid! Saving to Echo...");
              const echoId = await saveToEcho(question, answer, groupName);
              if (echoId) {
                // React 👻 to the answer message
                await sendGhostReaction(sock, jid, msg.key);
                // Also react to the quoted question
                if (quotedId) {
                  await sendGhostReaction(sock, jid, {
                    remoteJid: jid,
                    id: quotedId,
                    fromMe: false,
                    participant: quotedParticipant,
                  });
                }
                removeRecentQuestion(jid, question);
                continue;
              }
            } else {
              log("  -> Skipped (not a valid campus Q&A pair)");
            }
          }
        }

        // ── Flow 2: Implicit Sequential Answer (answered without clicking reply) ─
        if (!quotedMsg && !isQuestion && !isConfirmation && cleanText.length >= CONFIG.MIN_ANSWER_LEN) {
          const pendingQuestions = getRecentQuestions(jid, senderId);
          let capturedImplicit = false;

          // Check newest to oldest pending question
          for (let i = pendingQuestions.length - 1; i >= 0; i--) {
            const candidateQ = pendingQuestions[i];
            log(`\n[Checking Sequential Candidate in "${groupName}"]`);
            log(`  Candidate Q: "${candidateQ.text.slice(0, 70)}"`);
            log(`  Answer:      "${cleanText.slice(0, 70)}"`);

            const valid = await isValidQAPair(candidateQ.text, cleanText);
            if (valid) {
              log("  -> Valid sequential Q&A match! Saving to Echo...");
              const echoId = await saveToEcho(candidateQ.text, cleanText, groupName);
              if (echoId) {
                // React 👻 on both the answer and the original question
                await sendGhostReaction(sock, jid, msg.key);
                await sendGhostReaction(sock, jid, candidateQ.key);
                removeRecentQuestion(jid, candidateQ.text);
                capturedImplicit = true;
                break;
              }
            }
          }

          if (capturedImplicit) continue;
        }

        // ── Flow 3: Question Handling & Rich Pointer Auto-Replies ──────────────
        if (isQuestion) {
          // Record as recent question for sequential matching
          recordRecentQuestion(jid, cleanText, senderId, msg.key);

          if (CONFIG.ENABLE_POINTER_REPLIES) {
            // Cooldown check per sender
            const lastReply = autoReplyCooldowns.get(senderId);
            if (lastReply && Date.now() - lastReply < CONFIG.AUTO_REPLY_COOLDOWN_MS) {
              continue;
            }

            // Search Echo for synthesized answer
            const searchResult = await searchEchoSynthesis(cleanText);
            if (searchResult && searchResult.answer) {
              try {
                autoReplyCooldowns.set(senderId, Date.now());
                const formattedReply =
                  `👻 *Echo might have this one:*\n\n` +
                  `"${searchResult.answer}"\n\n` +
                  `_💡 Seniors have previously answered this in Echo._\n` +
                  `🔗 *Read more & see sources:*\n${searchResult.url}`;

                await sock.sendMessage(jid, {
                  text: formattedReply,
                  quoted: msg,
                });
                log(`Auto-reply sent for question in "${groupName}": "${cleanText.slice(0, 60)}"`);
              } catch (replyErr) {
                warn("Auto-reply failed:", replyErr.message);
              }
            }
          }
        }
      } catch (msgErr) {
        warn("Error processing individual message:", msgErr.message);
      }
    }
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────

startBot().catch((err) => {
  console.error("[EchoBot] Fatal error:", err);
  process.exit(1);
});


