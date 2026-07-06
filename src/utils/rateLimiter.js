const buckets = new Map();

function isRateLimited(key, windowMs, maxRequests) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) return true;
  return false;
}

const cooldowns = new Map();

function isOnCooldown(key, cooldownMs) {
  const now = Date.now();
  const last = cooldowns.get(key);
  if (last && now - last < cooldownMs) return true;
  cooldowns.set(key, now);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > 10 * 60 * 1000) buckets.delete(key);
  }
  for (const [key, last] of cooldowns.entries()) {
    if (now - last > 10 * 60 * 1000) cooldowns.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { isRateLimited, isOnCooldown };
