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

const lanIp = getLocalLanIp();

const CONFIG = {
  FLASK_URL: process.env.FLASK_URL || "http://127.0.0.1:5000",
  PUBLIC_URL: process.env.PUBLIC_URL || `http://${lanIp}:5000`,
  PHONE_NUMBER: process.env.PHONE_NUMBER || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  MIN_QUESTION_LEN: 10,
  MIN_ANSWER_LEN:   12,
  AUTO_REPLY_COOLDOWN_MS: 90_000,
  AUTH_FOLDER: process.env.AUTH_FOLDER || path.join(__dirname, "auth_session"),
  ENABLE_POINTER_REPLIES: true,
};

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

const logger = pino({ level: "silent" });
const log = (...args) => console.log("[EchoBot]", ...args);
const warn = (...args) => console.warn("[EchoBot] WARN:", ...args);

const autoReplyCooldowns = new Map();

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

function detectQuestionIntent(text) {
  if (!text) return false;
  const clean = text.trim();
  const lower = clean.toLowerCase();

  if (clean.includes("?") || clean.includes("؟")) return true;

  if (clean.length < 6) return false;
  if (/^(ok|okay|k|thanks|thank you|ty|thx|lol|lmao|haha|nice|cool|yep|yes|no|done|fine|sahi hai|theek hai|got it|gm|gn|good morning|good night|congrats|congratulations)\b/i.test(lower) && clean.length < 25) {
    return false;
  }

  const questionWords = /\b(what|how|when|where|who|whom|whose|why|which|can|could|would|should|is|are|does|do|did|will|shall|anyone|anybody|someone|somebody|kaun|kon|kya|kab|kaise|kaisa|kaisi|kesa|kesi|kese|kyun|kyu|kaha|kahan|kahape|kidhar|kidhr|kitna|kitne|kitni|konsa|konsi|konse|kaunsa|kaunsi|kisme|kisko|kisne|batao|bata|bataiye|btao|pata|scene)\b/i;
  if (questionWords.test(lower)) return true;

  const inquiringPhrases = /\b(tell me|tell us|guide me|guide on|help with|help regarding|any update|any idea|any info|need info|need notes|need help|pls share|please share|share link|how to|where to|details on|info on|doubt in|doubt on|confused about|queries regarding|kisi ko|koi bata|bata do|bata dena|btao na|h kya|hai kya|hein kya|pata hai kya|pata h kya|kaisa h|kaisa hai|mil sakta hai|milega kya|ho sakta hai)\b/i;
  if (inquiringPhrases.test(lower)) return true;

  const campusKeywords = /\b(pushkar|anshuman|sharma|mehta|prof|professor|sir|maam|mam|faculty|mentor|bsm|icp|dsa|math|cs|ai|pdc|cgr|gpa|attendance|assignment|deadline|submission|exam|midterm|endsem|hall ticket|portal|dashboard|hostel|mess|wifi|lan|internship|placement|gsoc|sil|bits|iitm|iit madras|shark tank|syllabus|grading|criteria|policy|exemption|leave)\b/i;
  const queryModifiers = /\b(timing|schedule|syllabus|grading|cabin|contact|room|venue|date|time|link|process|rules|requirement|criteria|review|rating|format|pattern|difficulty|tough|easy|strict|chill|extension|portal|office)\b/i;

  if (campusKeywords.test(lower) && queryModifiers.test(lower)) {
    return true;
  }

  return false;
}

function isHeuristicValidQAPair(question, answer) {
  const qLower = question.toLowerCase().trim();
  const aLower = answer.toLowerCase().trim();

  if (qLower.length < CONFIG.MIN_QUESTION_LEN || aLower.length < CONFIG.MIN_ANSWER_LEN) {
    return false;
  }

  if (qLower === aLower) return false;
  if (detectQuestionIntent(answer) && aLower.length < 35) return false;

  const isQuestion = detectQuestionIntent(question);
  const noisePattern = /^(ok|okay|k|thanks|thank you|ty|thx|lol|lmao|haha|nice|cool|yep|yes|no|done|fine|sahi hai|theek hai|got it)\b/i;
  const isNoise = noisePattern.test(aLower) && aLower.length < 25;

  return isQuestion && !isNoise;
}

async function isValidQAPair(question, answer) {
  const qTrim = question.trim();
  const aTrim = answer.trim();

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
      } catch (err) {}
    }
  }

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

  const heuristicResult = isHeuristicValidQAPair(qTrim, aTrim);
  log(`QA verdict (Heuristic): ${heuristicResult ? "YES" : "NO"} | Q: "${qTrim.slice(0, 40)}" | A: "${aTrim.slice(0, 40)}"`);
  return heuristicResult;
}

const recentGroupQuestions = new Map();
const QUESTION_EXPIRY_MS = 5 * 60 * 1000;

function recordRecentQuestion(jid, text, sender, key) {
  if (!recentGroupQuestions.has(jid)) {
    recentGroupQuestions.set(jid, []);
  }
  const list = recentGroupQuestions.get(jid);
  const now = Date.now();
  const fresh = list.filter((q) => now - q.timestamp < QUESTION_EXPIRY_MS);
  fresh.push({ text, sender, key, timestamp: now });
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

function extractCourseTag(text) {
  const match = text.match(/\b([A-Z]{2,6}\s*\d{2,4})\b/i);
  if (match) return match[1].toUpperCase().replace(/\s+/, "");
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

function extractMessageContent(rawMsg) {
  if (!rawMsg) return { text: "", quotedMsg: null, quotedId: null, quotedParticipant: null };

  let m = rawMsg;
  while (m?.ephemeralMessage || m?.viewOnceMessage || m?.viewOnceMessageV2 || m?.documentWithCaptionMessage) {
    m = m.ephemeralMessage?.message ||
        m.viewOnceMessage?.message ||
        m.viewOnceMessageV2?.message ||
        m.documentWithCaptionMessage?.message ||
        m;
  }

  const text = (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    ""
  ).trim();

  const contextInfo =
    m?.extendedTextMessage?.contextInfo ||
    m?.imageMessage?.contextInfo ||
    m?.videoMessage?.contextInfo ||
    m?.documentMessage?.contextInfo;

  let quotedMsg = contextInfo?.quotedMessage || null;
  if (quotedMsg?.ephemeralMessage) quotedMsg = quotedMsg.ephemeralMessage.message;
  if (quotedMsg?.viewOnceMessage) quotedMsg = quotedMsg.viewOnceMessage.message;
  if (quotedMsg?.viewOnceMessageV2) quotedMsg = quotedMsg.viewOnceMessageV2.message;

  const quotedId = contextInfo?.stanzaId || null;
  const quotedParticipant = contextInfo?.participant || null;

  return { text, quotedMsg, quotedId, quotedParticipant };
}

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

  sock.ev.on("creds.update", saveCreds);

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

      fetchWithTimeout(`${CONFIG.FLASK_URL}/api/bot/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr: null, status: "connected" }),
      }, 2500).catch(() => {});
    }
  });

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

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        if (!isJidGroup(msg.key.remoteJid)) continue;

        const jid   = msg.key.remoteJid;
        const senderId = msg.key.participant || jid;
        const groupName = await getGroupName(sock, jid);

        const { text: cleanText, quotedMsg, quotedId, quotedParticipant } = extractMessageContent(msg.message);

        if (!cleanText || cleanText.length < 2) continue;

        const isConfirmation =
          /^((\+1|same|true|agreed|vouch|this|fr|yes this|valid|confirmed|seconded|upvote|\+100|yep|definitely))\b/i.test(cleanText) &&
          cleanText.length < 25;

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

        const isQuestion = detectQuestionIntent(cleanText);

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
                await sendGhostReaction(sock, jid, msg.key);
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

        if (!quotedMsg && !isQuestion && !isConfirmation && cleanText.length >= CONFIG.MIN_ANSWER_LEN) {
          const pendingQuestions = getRecentQuestions(jid, senderId);
          let capturedImplicit = false;

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

        if (isQuestion) {
          recordRecentQuestion(jid, cleanText, senderId, msg.key);

          if (CONFIG.ENABLE_POINTER_REPLIES) {
            const questionFingerprint = `${senderId}::${cleanText.slice(0, 40).toLowerCase().replace(/\s+/g, ' ')}`;
            const lastReply = autoReplyCooldowns.get(questionFingerprint);
            if (lastReply && Date.now() - lastReply < CONFIG.AUTO_REPLY_COOLDOWN_MS) {
              log(`[Cooldown] Skipping duplicate question from same sender: "${cleanText.slice(0, 50)}"`);
              continue;
            }

            const searchResult = await searchEchoSynthesis(cleanText);
            if (searchResult && searchResult.answer) {
              try {
                autoReplyCooldowns.set(questionFingerprint, Date.now());
                const formattedReply =
                  `👻 *Echo might have this one:*\n\n` +
                  `"${searchResult.answer}"\n\n` +
                  `_💡 Seniors have previously answered this in Echo._\n` +
                  `🔗 *Read more & see sources:*\n${searchResult.url}`;

                try {
                  await sock.sendMessage(jid, {
                    text: formattedReply,
                    quoted: msg,
                  });
                  log(`Auto-reply sent for question in "${groupName}": "${cleanText.slice(0, 60)}"`);
                } catch (groupSendErr) {
                  if (senderId && senderId !== jid) {
                    const dmReply =
                      `👻 *Echo — Answer to your question in ${groupName}:*\n\n` +
                      `"${searchResult.answer}"\n\n` +
                      `_💡 Seniors have previously answered this in Echo._\n` +
                      `🔗 *Read more & see sources:*\n${searchResult.url}`;
                    await sock.sendMessage(senderId, { text: dmReply });
                    log(`Auto-reply sent via DM for question in announcement group "${groupName}"`);
                  } else {
                    warn("Auto-reply failed:", groupSendErr.message);
                  }
                }
              } catch (replyErr) {
                warn("Auto-reply error:", replyErr.message);
              }
            } else {
              log(`[Knowledge Gap] No Echo answer for: "${cleanText.slice(0, 80)}" in "${groupName}"`);
            }
          }
        }

        if (!isQuestion && !quotedMsg && !isConfirmation && cleanText.length >= 35) {
          const isAnnouncement =
            /\b(announcement|notice|important|deadline|extended|rescheduled|postponed|schedule|exam|quiz|submission|hall ticket|attendance|exemption|portal|registration|session|class|timing|room|venue|instructions)\b/i.test(cleanText);
          if (isAnnouncement) {
            log(`\n[Official Campus Announcement Detected in "${groupName}"]`);
            log(`  Text: "${cleanText.slice(0, 80)}..."`);
            const firstLine = cleanText.split("\n")[0].slice(0, 70);
            const echoId = await saveToEcho(
              `Announcement in ${groupName}: ${firstLine}`,
              cleanText,
              groupName
            );
            if (echoId) {
              await sendGhostReaction(sock, jid, msg.key);
            }
          }
        }
      } catch (msgErr) {
        warn("Error processing individual message:", msgErr.message);
      }
    }
  });
}

startBot().catch((err) => {
  console.error("[EchoBot] Fatal error:", err);
  process.exit(1);
});
