const fs = require("fs");
const path = require("path");

const ATTEMPTS_FILE = path.join(__dirname, "../../Database/Attempts.json");
const MAX_ENTRIES_PER_IP = 200;

function readAttempts() {
  try {
    const raw = fs.readFileSync(ATTEMPTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAttempts(data) {
  fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(data, null, 2));
}

function recordAttempt(ip, userId, result, reason) {
  const data = readAttempts();
  if (!Array.isArray(data[ip])) data[ip] = [];

  data[ip].push({
    userId,
    result,
    reason,
    timestamp: new Date().toISOString(),
  });

  if (data[ip].length > MAX_ENTRIES_PER_IP) {
    data[ip] = data[ip].slice(data[ip].length - MAX_ENTRIES_PER_IP);
  }

  writeAttempts(data);
}

function getAttemptsForIp(ip) {
  const data = readAttempts();
  return Array.isArray(data[ip]) ? [...data[ip]].reverse() : [];
}

function getAttemptsForUser(userId) {
  const data = readAttempts();
  const results = [];
  for (const [ip, entries] of Object.entries(data)) {
    for (const entry of entries) {
      if (entry.userId === userId) results.push({ ip, ...entry });
    }
  }
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = { recordAttempt, getAttemptsForIp, getAttemptsForUser };
