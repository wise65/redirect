import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Log file
const logFile = path.join(process.cwd(), "catched.txt");

// Config from .env
const allowedCountries = process.env.ALLOWED_COUNTRIES
  ? process.env.ALLOWED_COUNTRIES.split(",").map((c) => c.trim().toLowerCase())
  : ["all"];

const blockProxyVPN = process.env.BLOCK_PROXY_VPN === "true";
const blockBots = process.env.BLOCK_BOTS === "true";

// --- Utils ---
function logBlockedIP(ip, reason) {
  const date = new Date().toISOString();
  fs.appendFileSync(logFile, `${date} | ${ip} | ${reason}\n`);
}

function ipToLong(ip) {
  if (!ip.includes(".")) return 0; // skip IPv6 (::1 etc.)
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function cidrMatch(ip, range) {
  if (!ip.includes(".")) return false; // skip IPv6 checks
  const [subnet, maskBitsStr] = range.split("/");
  const maskBits = Number(maskBitsStr);
  const mask = ~(2 ** (32 - maskBits) - 1);

  const ipLong = ipToLong(ip);
  const subnetLong = ipToLong(subnet);

  return (ipLong & mask) === (subnetLong & mask);
}

// Detect private/localhost IPs
function isPrivateIP(ip) {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.") // 172.16.0.0 – 172.31.255.255
  );
}

// --- Middleware ---
export default async function blockIP(req, res, next) {
  let isBlocked = false;
  let blockReason = "";

  // Resolve real IP
  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  if (!ip) ip = "0.0.0.0";

  // 🛑 Skip checks for local/private IPs
  if (isPrivateIP(ip)) {
    return next();
  }

  // 1. Country restriction
  if (!(allowedCountries.length === 1 && allowedCountries[0] === "all")) {
    try {
      const r = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
      const data = await r.json();
      if (
        data?.countryCode &&
        !allowedCountries.includes(data.countryCode.toLowerCase())
      ) {
        isBlocked = true;
        blockReason = `Country not allowed: ${data.countryCode}`;
      }
    } catch (e) {
      console.error(`Country check failed for ${ip}`, e.message);
    }
  }

  // 2. VPN/Proxy check
  if (blockProxyVPN && !isBlocked) {
    try {
      const r = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1`);
      const data = await r.json();
      if (data[ip]?.proxy === "yes") {
        isBlocked = true;
        blockReason = `VPN/Proxy detected: ${data[ip].type || "Unknown"}`;
      }
    } catch (e) {
      console.error(`Proxy check failed for ${ip}`, e.message);
    }
  }

  // 3. Bot user-agent
  if (blockBots && !isBlocked) {
    const ua = req.headers["user-agent"] || "";
    const botSignatures = [
      "bot",
      "spider",
      "crawl",
      "wget",
      "curl",
      "ahrefs",
      "semrush",
      "masscan",
      "nessus",
      "nmap",
    ];
    if (botSignatures.some((s) => ua.toLowerCase().includes(s))) {
      isBlocked = true;
      blockReason = `Bot UA detected: ${ua}`;
    }
  }

  // 4. CIDR ranges
  const blockedNetworks = [
    "185.220.101.0/24", // Tor exit nodes
    "66.249.64.0/19",   // Googlebot
  ];
  if (!isBlocked) {
    for (const net of blockedNetworks) {
      if (cidrMatch(ip, net)) {
        isBlocked = true;
        blockReason = `Blocked CIDR: ${net}`;
        break;
      }
    }
  }

  // If blocked
  if (isBlocked) {
    logBlockedIP(ip, blockReason);
    return res.status(404).send(
      "<h1>404 Not Found</h1><p>The requested URL was not found on this server.</p>"
    );
  }

  // Otherwise continue
  next();
}
