const axios = require("axios");

let cachedBaseUrl = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

async function resolveBaseUrl(settings) {
  const port = process.env.PORT || 3001;
  const localUrl = `http://localhost:${port}`;

  if (settings.local) {
    return localUrl;
  }

  const domain = settings.public_domain;
  const publicUrl = `https://${domain}`;

  const now = Date.now();
  if (cachedBaseUrl && now - cachedAt < CACHE_TTL_MS) {
    return cachedBaseUrl;
  }

  try {
    await axios.get(`${publicUrl}/health`, { timeout: 3000 });
    cachedBaseUrl = publicUrl;
  } catch {
    cachedBaseUrl = localUrl;
  }

  cachedAt = now;
  return cachedBaseUrl;
}

module.exports = { resolveBaseUrl };
