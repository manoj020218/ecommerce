const fs = require("node:fs");
const path = require("node:path");

// @whiskeysockets/baileys is ESM-only; this backend is CommonJS, so it must
// be loaded via dynamic import() instead of require().
let baileysModPromise = null;
function loadBaileys() {
  if (!baileysModPromise) baileysModPromise = import("@whiskeysockets/baileys");
  return baileysModPromise;
}

const SESSION_DIR = path.resolve(process.cwd(), "backend/src/database/whatsapp-session");

const state = {
  status: "idle", // idle | connecting | qr | connected | error
  qrDataUrl: null,
  connectedNumber: null,
  lastError: null,
  sock: null,
  starting: false
};

let reconnectTimer = null;

// Recently sent messages, so WhatsApp can re-deliver one when the buyer's phone
// asks for a retry (2026-10-03). Without this Baileys can't answer the retry
// and the buyer sees "Waiting for this message. This may take a while."
// Only the small message record is kept (media is already uploaded — no file
// bytes), for 1 hour, max 500 messages.
const SENT_TTL_MS = 60 * 60 * 1000;
const SENT_MAX = 500;
const sentMessages = new Map();

function rememberSent(sent) {
  if (!sent?.key?.id || !sent.message) return;
  sentMessages.set(sent.key.id, { message: sent.message, at: Date.now() });
  if (sentMessages.size > SENT_MAX) {
    const oldest = sentMessages.keys().next().value;
    sentMessages.delete(oldest);
  }
}

function getSentMessage(key) {
  const row = key?.id ? sentMessages.get(key.id) : null;
  if (!row) return undefined;
  if (Date.now() - row.at > SENT_TTL_MS) {
    sentMessages.delete(key.id);
    return undefined;
  }
  return row.message;
}

// Minimal cache Baileys uses to count delivery retries per message.
function createRetryCounterCache() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); if (map.size > 2000) map.delete(map.keys().next().value); return true; },
    del: (k) => map.delete(k),
    flushAll: () => map.clear()
  };
}
const msgRetryCounterCache = createRetryCounterCache();

// Customer mobile numbers are stored as plain 10-digit Indian numbers with
// no country code (checkout never asks for one) — the previous version only
// stripped a leading trunk "0" and left a bare 10-digit number as-is, which
// WhatsApp rejects (missing country code), silently failing every send to a
// number entered in the normal 10-digit form. This handles both that common
// case and the leading-0 edge case; a number that already carries a country
// code (12+ digits) passes through unchanged.
function toJid(phone) {
  let clean = String(phone || "").replace(/[^0-9]/g, "");
  if (clean.length === 11 && clean.startsWith("0")) {
    clean = clean.slice(1);
  }
  if (clean.length === 10) {
    clean = `91${clean}`;
  }
  return `${clean}@s.whatsapp.net`;
}

function publicStatus() {
  return {
    status: state.status,
    qr: state.qrDataUrl,
    connectedNumber: state.connectedNumber,
    lastError: state.lastError
  };
}

async function startConnection() {
  if (state.starting || state.status === "connected") return publicStatus();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  state.starting = true;
  state.lastError = null;

  try {
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
      await loadBaileys();
    const QRCode = require("qrcode");
    const { Boom } = require("@hapi/boom");
    const pino = require("pino");

    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      logger: pino({ level: "silent" }),
      // This account only ever sends order/cart notifications — it never
      // needs the counterparty's chat history. Baileys defaults to
      // decrypting and processing every history-sync blob WhatsApp offers
      // on each reconnect (shouldSyncHistoryMessage defaults to () => true),
      // which on a number with real chat history repeatedly spiked memory
      // past pm2's max_memory_restart ceiling and killed the whole shared
      // backend process every 30-90s (2026-09-16 incident) — the "Bad MAC"
      // decrypt errors in the logs were a symptom of that resync being
      // interrupted mid-way each time, not the actual crash cause.
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      // Answer the buyer phone's "please resend" requests (2026-10-03)
      getMessage: async (key) => getSentMessage(key),
      msgRetryCounterCache
    });
    state.sock = sock;
    state.status = "connecting";

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.status = "qr";
        try {
          state.qrDataUrl = await QRCode.toDataURL(qr);
        } catch {
          state.qrDataUrl = null;
        }
      }

      if (connection === "open") {
        state.status = "connected";
        state.qrDataUrl = null;
        state.connectedNumber = sock.user?.id ? sock.user.id.split(":")[0].split("@")[0] : null;
        state.starting = false;
      } else if (connection === "close") {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        state.sock = null;
        state.starting = false;
        if (loggedOut) {
          state.status = "idle";
          state.qrDataUrl = null;
          state.connectedNumber = null;
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        } else {
          // Any other close (network blip, WhatsApp-side restart, phone
          // briefly offline, etc.) is normal for a long-lived WebSocket and
          // does not mean the paired session is invalid — reconnecting with
          // the same persisted credentials picks it back up with no new QR
          // scan needed. Previously this always dropped to "error" and sat
          // there until an admin clicked Connect again.
          state.status = "connecting";
          state.qrDataUrl = null;
          state.lastError = null;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startConnection().catch(() => {});
          }, 3000);
        }
      }
    });

    return publicStatus();
  } catch (err) {
    state.starting = false;
    state.status = "error";
    state.lastError = err.message || "Failed to start WhatsApp connection.";
    return publicStatus();
  }
}

async function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    if (state.sock) {
      await state.sock.logout().catch(() => {});
    }
  } finally {
    state.sock = null;
    state.status = "idle";
    state.qrDataUrl = null;
    state.connectedNumber = null;
    state.lastError = null;
    state.starting = false;
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  return publicStatus();
}

async function sendMessage(phone, message) {
  if (state.status !== "connected" || !state.sock) {
    throw new Error("WhatsApp is not connected.");
  }
  // await state.sock.sendMessage(toJid(phone), { text: message });
  const sent = await state.sock.sendMessage(toJid(phone), { text: message });
  rememberSent(sent);
}

// Sends a file (e.g. invoice PDF) as a WhatsApp document (2026-10-03).
async function sendDocument(phone, { buffer, fileName, mimetype = "application/pdf", caption = "" }) {
  if (state.status !== "connected" || !state.sock) {
    throw new Error("WhatsApp is not connected.");
  }
  // await state.sock.sendMessage(toJid(phone), { document: buffer, mimetype, fileName, caption });
  const sent = await state.sock.sendMessage(toJid(phone), { document: buffer, mimetype, fileName, caption });
  rememberSent(sent);
}

// A pm2 restart / deploy wipes the in-memory connection state, but the
// paired session on disk is still valid — without this the admin had to
// manually click Connect after every single restart even though nothing
// about the WhatsApp pairing actually changed. Only fires when a previously
// paired session exists; never auto-triggers a fresh QR flow.
function resumeIfSessionExists() {
  const credsPath = path.join(SESSION_DIR, "creds.json");
  if (fs.existsSync(credsPath)) {
    startConnection().catch(() => {});
  }
}

module.exports = {
  startConnection,
  disconnect,
  sendMessage,
  sendDocument,
  getStatus: publicStatus,
  resumeIfSessionExists
};
