const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { loadSettings, saveSettings } = require("../utils/settingsStore");
const { isRateLimited } = require("../utils/rateLimiter");
const { detectBrowser, isBrowserAuthorised } = require("../utils/browserDetect");
const { recordAttempt } = require("../utils/attempts");

const TEMP_DIR = path.join(__dirname, "../../Temp");
const DB_DIR = path.join(__dirname, "../../Database");
const SANCTION_FILE = path.join(__dirname, "../../sanction.json");

const VALID_SANCTIONS = ["Kicked", "Banned"];

function safeReadJson(filePath, label) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { data: JSON.parse(raw), error: null };
  } catch (e) {
    return { data: null, error: `Failed to parse ${label}: ${e.message}` };
  }
}

function getSanctions() {
  const { data, error } = safeReadJson(SANCTION_FILE, "sanction.json");
  if (error || !data) throw new Error(error || "sanction.json unreadable");
  const keys = ["Alt_Detect", "Ip_Already_Linked", "Vpn_Proxy_Detected", "Bot_Detected"];
  for (const key of keys) {
    if (!VALID_SANCTIONS.includes(data[key])) {
      throw new Error(`sanction.json: invalid value for "${key}": "${data[key]}". Must be "Kicked" or "Banned".`);
    }
  }
  return data;
}

function getDatabase() {
  const dbFile = path.join(DB_DIR, "IP.json");
  if (!fs.existsSync(dbFile)) return {};
  const { data, error } = safeReadJson(dbFile, "IP.json");
  if (error) return {};
  return data;
}

function saveDatabase(data) {
  fs.writeFileSync(path.join(DB_DIR, "IP.json"), JSON.stringify(data, null, 2));
}

async function sendWebhook(url, embed) {
  if (!url) return;
  try { await axios.post(url, { embeds: [embed] }); } catch {}
}

async function logWebhook(settings, embed) {
  if (settings.logs_enabled && settings.Logs_Verify_Webbhook) await sendWebhook(settings.Logs_Verify_Webbhook, embed);
}

async function sendErrorWebhook(settings, userId, ip, reason) {
  const embed = {
    title: "Verification Failed",
    color: 0xed4245,
    fields: [
      { name: "User", value: `${userId} <@${userId}>`, inline: false },
      { name: "IP Address", value: ip, inline: false },
      { name: "Reason", value: reason, inline: false },
    ],
    timestamp: new Date().toISOString(),
  };
  await sendWebhook(settings.Error_Verify_Webhook, embed);
  await logWebhook(settings, { ...embed, title: "Verification Failed — Log" });
}

async function notifyUserDM(client, userId, message) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(message);
  } catch {}
}

async function applySanction(client, guild, userId, sanctionType, settings) {
  if (!guild) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (sanctionType === "Banned") {
      await member.ban({ reason: "Automatic sanction — verification failure" }).catch(() => {});
    } else if (sanctionType === "Kicked") {
      await member.kick("Automatic sanction — verification failure").catch(() => {});
    }
  } catch (e) {
    await logWebhook(settings, {
      title: "Sanction Error",
      color: 0xffa500,
      fields: [
        { name: "User", value: `${userId}`, inline: false },
        { name: "Sanction", value: sanctionType, inline: false },
        { name: "Error", value: e.message, inline: false },
      ],
      timestamp: new Date().toISOString(),
    });
  }
}

function getLinkLifetimeMs(settings) {
  const ms = parseInt(settings.verification_code_expiry, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 30 * 60 * 1000;
}

function isLinkExpired(userData, settings) {
  if (!userData.createdAt) return false;
  return Date.now() - userData.createdAt > getLinkLifetimeMs(settings);
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
}

const CAPTCHA_FIELD_NAMES = {
  recaptcha: "g-recaptcha-response",
  hcaptcha: "h-captcha-response",
  turnstile: "cf-turnstile-response",
};

const PROVIDER_SECRET_ENV = {
  recaptcha: "RECAPTCHA_PRIVATE",
  hcaptcha: "HCAPTCHA_SECRET",
  turnstile: "TURNSTILE_SECRET",
};

function isPlaceholderValue(value) {
  return !value || value.startsWith("REPLACE_WITH_") || value.startsWith("YOUR_");
}

async function verifyCaptchaProvider(type, token) {
  const secretEnvName = PROVIDER_SECRET_ENV[type];
  if (!secretEnvName) throw new Error(`Unsupported captcha type: ${type}`);

  const secret = process.env[secretEnvName];
  if (isPlaceholderValue(secret)) {
    throw new Error(`Missing or placeholder ${secretEnvName} in key.env`);
  }

  if (type === "recaptcha") {
    const res = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      new URLSearchParams({ secret, response: token })
    );
    return res.data.success === true;
  }
  if (type === "hcaptcha") {
    const res = await axios.post(
      "https://hcaptcha.com/siteverify",
      new URLSearchParams({ secret, response: token })
    );
    return res.data.success === true;
  }
  if (type === "turnstile") {
    const res = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({ secret, response: token })
    );
    return res.data.success === true;
  }
  throw new Error(`Unsupported captcha type: ${type}`);
}

function generateLocalCaptcha() {
  const operators = ["+", "-"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let a = Math.floor(Math.random() * 20) + 1;
  let b = Math.floor(Math.random() * 20) + 1;
  if (operator === "-" && b > a) [a, b] = [b, a];
  const answer = operator === "+" ? a + b : a - b;
  return { a, b, operator, answer };
}

function renderDistortedExpression(a, operator, b) {
  const text = `${a} ${operator} ${b} = ?`;
  return text
    .split("")
    .map((char) => {
      if (char === " ") return " ";
      const rotate = Math.floor(Math.random() * 30) - 15;
      const translateY = Math.floor(Math.random() * 8) - 4;
      const scale = (0.9 + Math.random() * 0.3).toFixed(2);
      return `<span style="display:inline-block;transform:rotate(${rotate}deg) translateY(${translateY}px) scale(${scale});">${char}</span>`;
    })
    .join("");
}

async function checkIpReputation(settings, ip) {
  const timeout = settings.Vpn_Check_Timeout_Ms || 4000;
  try {
    const res = await axios.get(
      `http://ip-api.com/json/${ip}?fields=status,countryCode,proxy,hosting,mobile`,
      { timeout }
    );
    if (res.data.status !== "success") {
      return { country: null, isProxy: !!settings.Vpn_Check_Fail_Closed, checkFailed: true };
    }
    const isProxy = res.data.proxy === true || res.data.hosting === true;
    return { country: res.data.countryCode || null, isProxy, checkFailed: false };
  } catch {
    return { country: null, isProxy: !!settings.Vpn_Check_Fail_Closed, checkFailed: true };
  }
}

module.exports = function startWebServer(client) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (req, res) => {
    try {
      const settings = loadSettings();
      res.send(buildLandingPage(settings));
    } catch {
      res.send(buildInternalErrorPage());
    }
  });

  app.get("/api/verify/:code", (req, res) => {
    let settings;
    try { settings = loadSettings(); } catch { return res.send(buildInternalErrorPage()); }

    const ip = getClientIp(req);
    const limit = settings.rate_limit || {};
    if (isRateLimited(`get:${ip}`, limit.window_ms || 60000, limit.max_requests || 10)) {
      return res.status(429).send(buildResultPage("RATE_LIMITED", settings));
    }

    if (!settings.Enable) return res.send(buildResultPage("SYSTEM_DISABLED", settings));

    const { code } = req.params;
    const tempFiles = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith(".json"));
    let userData = null;
    let tempFilePath = null;

    for (const file of tempFiles) {
      const { data } = safeReadJson(path.join(TEMP_DIR, file), file);
      if (data && data.code === code) { userData = data; tempFilePath = path.join(TEMP_DIR, file); break; }
    }

    if (!userData) return res.send(buildResultPage("INVALID_CODE", settings));

    if (isLinkExpired(userData, settings)) {
      if (tempFilePath) { try { fs.unlinkSync(tempFilePath); } catch {} }
      return res.send(buildResultPage("LINK_EXPIRED", settings));
    }

    if (settings.captcha_enabled && settings.capchat_type === "local" && !userData.localCaptcha) {
      userData.localCaptcha = generateLocalCaptcha();
      if (tempFilePath) fs.writeFileSync(tempFilePath, JSON.stringify(userData, null, 2));
    }

    res.send(buildVerifyPage(code, settings, userData));
  });

  app.post("/api/verify/:code", async (req, res) => {
    let settings, sanctions;

    try { settings = loadSettings(); } catch { return res.send(buildInternalErrorPage()); }
    try { sanctions = getSanctions(); } catch { return res.send(buildInternalErrorPage()); }

    const ip = getClientIp(req);
    const limit = settings.rate_limit || {};
    if (isRateLimited(`post:${ip}`, limit.window_ms || 60000, limit.max_requests || 10)) {
      return res.status(429).send(buildResultPage("RATE_LIMITED", settings));
    }

    if (!settings.Enable) return res.send(buildResultPage("SYSTEM_DISABLED", settings));

    const { code } = req.params;
    const adblockFlag = req.body["adblock"] === "true";

    const tempFiles = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith(".json"));
    let userData = null;
    let tempFilePath = null;

    for (const file of tempFiles) {
      const { data } = safeReadJson(path.join(TEMP_DIR, file), file);
      if (data && data.code === code) { userData = data; tempFilePath = path.join(TEMP_DIR, file); break; }
    }

    if (!userData) return res.send(buildResultPage("INVALID_CODE", settings));

    if (isLinkExpired(userData, settings)) {
      if (tempFilePath) { try { fs.unlinkSync(tempFilePath); } catch {} }
      return res.send(buildResultPage("LINK_EXPIRED", settings));
    }

    const guild = client.guilds.cache.first() || null;
    let member = null;
    if (guild) member = await guild.members.fetch(userData.userId).catch(() => null);

    if (member && member.user.bot) {
      recordAttempt(ip, userData.userId, "Refused", "Bot account detected");
      await sendErrorWebhook(settings, userData.userId, ip, "Bot account detected");
      await notifyUserDM(client, userData.userId,
        "Automated accounts are not permitted to verify on this server.\n\nIf you believe this is an error, please contact our support team."
      );
      await applySanction(client, guild, userData.userId, sanctions.Bot_Detected, settings);
      return res.send(buildResultPage("BOT_DETECTED", settings));
    }

    if (settings.BlockingUnknownNavigator) {
      const userAgent = req.headers["user-agent"] || "";
      if (!isBrowserAuthorised(userAgent, settings.Authorised_Navigators)) {
        const detected = detectBrowser(userAgent);
        recordAttempt(ip, userData.userId, "Refused", `Unauthorized browser: ${detected}`);
        await sendErrorWebhook(settings, userData.userId, ip, `Unauthorized or unrecognized browser: ${detected}`);
        await notifyUserDM(client, userData.userId,
          "Your verification attempt was unsuccessful.\n\nReason: Your browser could not be verified as an allowed browser. Please try again with an up-to-date, standard browser.\n\nIf the issue persists, contact our support team."
        );
        return res.send(buildResultPage("UNKNOWN_BROWSER", settings));
      }
    }

    if (settings.captcha_enabled) {
      const captchaType = settings.capchat_type;

      if (captchaType === "local") {
        const submitted = parseInt(req.body.local_captcha_answer, 10);
        const expected = userData.localCaptcha?.answer;
        if (!Number.isFinite(expected) || !Number.isFinite(submitted) || submitted !== expected) {
          recordAttempt(ip, userData.userId, "Refused", "Local captcha challenge failed");
          await sendErrorWebhook(settings, userData.userId, ip, "Local captcha challenge failed");
          await notifyUserDM(client, userData.userId,
            "Your verification attempt was unsuccessful.\n\nReason: The security question was answered incorrectly. Please try again.\n\nIf the issue persists, contact our support team."
          );
          return res.send(buildResultPage("CAPTCHA_FAILED", settings));
        }
      } else {
        const fieldName = CAPTCHA_FIELD_NAMES[captchaType];
        const captchaToken = fieldName ? req.body[fieldName] : null;
        if (!captchaToken) return res.send(buildResultPage("CAPTCHA_MISSING", settings));
        try {
          const passed = await verifyCaptchaProvider(captchaType, captchaToken);
          if (!passed) {
            recordAttempt(ip, userData.userId, "Refused", "CAPTCHA verification failed");
            await sendErrorWebhook(settings, userData.userId, ip, "CAPTCHA verification failed");
            await notifyUserDM(client, userData.userId,
              "Your verification attempt was unsuccessful.\n\nReason: The CAPTCHA challenge was not completed successfully. Please try again.\n\nIf the issue persists, contact our support team."
            );
            return res.send(buildResultPage("CAPTCHA_FAILED", settings));
          }
        } catch (e) {
          await logWebhook(settings, {
            title: "Captcha Provider Error",
            color: 0xffa500,
            fields: [
              { name: "Type", value: captchaType, inline: false },
              { name: "Error", value: e.message, inline: false },
            ],
            timestamp: new Date().toISOString(),
          });
          return res.send(buildResultPage("CAPTCHA_ERROR", settings));
        }
      }
    }

    if (adblockFlag) {
      recordAttempt(ip, userData.userId, "Refused", "Ad blocker detected");
      await sendErrorWebhook(settings, userData.userId, ip, "Ad blocker detected");
      await notifyUserDM(client, userData.userId,
        "Your verification attempt was unsuccessful.\n\nReason: An ad blocker extension was detected in your browser. Please disable it and try again.\n\nIf you need assistance, contact our support team."
      );
      return res.send(buildResultPage("ADBLOCK_DETECTED", settings));
    }

    const { country, isProxy } = await checkIpReputation(settings, ip);

    if (isProxy && !settings.Allow_Vpn_Proxy) {
      recordAttempt(ip, userData.userId, "Refused", "VPN or proxy connection detected");
      await sendErrorWebhook(settings, userData.userId, ip, "VPN or proxy connection detected");
      await notifyUserDM(client, userData.userId,
        "Your verification attempt was unsuccessful.\n\nReason: A VPN or proxy connection was detected. Please disable it and reconnect using a standard internet connection, then try again.\n\nIf you need assistance, contact our support team."
      );
      await applySanction(client, guild, userData.userId, sanctions.Vpn_Proxy_Detected, settings);
      return res.send(buildResultPage("VPN_PROXY_DETECTED", settings));
    }

    if (country && (settings.blocked_countries || []).includes(country)) {
      recordAttempt(ip, userData.userId, "Refused", `Blocked country: ${country}`);
      await sendErrorWebhook(settings, userData.userId, ip, `Access from blocked country: ${country}`);
      await notifyUserDM(client, userData.userId,
        `Your verification attempt was unsuccessful.\n\nReason: Access from your country (${country}) is currently restricted on this server.\n\nPlease contact our support team for the list of blocked regions and further assistance.`
      );
      return res.send(buildResultPage("COUNTRY_BLOCKED", settings));
    }

    const db = getDatabase();
    const existingOwnerOfIp = Object.entries(db).find(([uid, storedIp]) => storedIp === ip && uid !== userData.userId);
    const existingIpForUser = db[userData.userId];

    if (existingOwnerOfIp && !settings.Allow_Ip_Already_Linked) {
      recordAttempt(ip, userData.userId, "Refused", `IP already linked to account: ${existingOwnerOfIp[0]}`);
      await sendErrorWebhook(settings, userData.userId, ip, `IP already linked to account: ${existingOwnerOfIp[0]}`);
      await notifyUserDM(client, userData.userId,
        "Your verification attempt was unsuccessful.\n\nReason: This IP address is already associated with another account on this server.\n\nIf you believe this is an error, please contact our support team."
      );
      await applySanction(client, guild, userData.userId, sanctions.Ip_Already_Linked, settings);
      return res.send(buildResultPage("IP_ALREADY_LINKED", settings));
    }

    if (existingIpForUser && existingIpForUser !== ip && !settings.Allow_Alt) {
      recordAttempt(ip, userData.userId, "Refused", `Alternate account detected — registered IP: ${existingIpForUser}`);
      await sendErrorWebhook(settings, userData.userId, ip, `Alternate account detected — registered IP: ${existingIpForUser} / current IP: ${ip}`);
      await notifyUserDM(client, userData.userId,
        "Your verification attempt was unsuccessful.\n\nReason: Your Discord account is registered under a different IP address, which may indicate the use of an alternate account.\n\nPlease contact our support team if you believe this is an error."
      );
      await applySanction(client, guild, userData.userId, sanctions.Alt_Detect, settings);
      return res.send(buildResultPage("ALT_ACCOUNT_DETECTED", settings));
    }

    if (existingIpForUser && existingIpForUser === ip) {
      recordAttempt(ip, userData.userId, "Accepted", "Already verified (repeat attempt)");
      return res.send(buildResultPage("ALREADY_VERIFIED", settings));
    }

    db[userData.userId] = ip;
    saveDatabase(db);
    recordAttempt(ip, userData.userId, "Accepted", "Verified successfully");
    if (tempFilePath) { try { fs.unlinkSync(tempFilePath); } catch {} }

    if (member) {
      if (settings.NotVerified_Role) await member.roles.remove(settings.NotVerified_Role).catch((e) => {
        logWebhook(settings, { title: "Role Error", color: 0xffa500, fields: [{ name: "Error", value: e.message }], timestamp: new Date().toISOString() });
      });
      if (settings.Verified_Role) await member.roles.add(settings.Verified_Role).catch((e) => {
        logWebhook(settings, { title: "Role Error", color: 0xffa500, fields: [{ name: "Error", value: e.message }], timestamp: new Date().toISOString() });
      });
    }

    const successEmbed = {
      title: "Verification Successful",
      color: 0x57f287,
      fields: [
        { name: "User", value: `${userData.userId} <@${userData.userId}>`, inline: false },
        { name: "IP Address", value: ip, inline: false },
        { name: "Country", value: country || "Unknown", inline: false },
      ],
      timestamp: new Date().toISOString(),
    };
    await sendWebhook(settings.Success_Verify_Webhook, successEmbed);
    await logWebhook(settings, { ...successEmbed, title: "Verification Successful — Log" });
    await notifyUserDM(client, userData.userId,
      "Your verification was successful.\n\nYou now have full access to the server. Welcome!"
    );

    res.send(buildResultPage("SUCCESS", settings));
  });

  app.get("/settings", (req, res) => {
    try { loadSettings(); } catch { return res.send(buildInternalErrorPage()); }
    res.send(buildSettingsPage());
  });

  app.get("/api/settings/validate", (req, res) => {
    const { token } = req.query;
    const settingsCommand = require("../commands/settings");
    const activeTokens = settingsCommand.activeTokens;
    if (!activeTokens.has(token)) return res.status(401).json({ valid: false });
    const tokenData = activeTokens.get(token);
    activeTokens.delete(token);
    let settings;
    try { settings = loadSettings(); } catch { return res.status(500).json({ valid: false }); }
    res.json({ valid: true, settings, guildId: tokenData.guildId });
  });

  app.post("/api/settings/save", (req, res) => {
    const { token, settings } = req.body;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const result = saveSettings(settings || {});
    if (!result.ok) return res.status(400).json({ error: "Invalid settings", details: result.errors });
    res.json({ success: true });
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));
};

const RESULT_CONFIGS = {
  SUCCESS:              { ok: true,  title: "Verification Successful",      body: "Your identity has been confirmed. You now have full access to the server.<br><br>You will be redirected automatically.", redirect: true },
  ALREADY_VERIFIED:     { ok: true,  title: "Already Verified",             body: "Your account is already verified with this IP address. You may return to the server.", redirect: true },
  SYSTEM_DISABLED:      { ok: false, title: "Verification Unavailable",     body: "The verification system is currently disabled. Please contact a server administrator for assistance." },
  INVALID_CODE:         { ok: false, title: "Invalid Verification Link",    body: "This verification link is invalid or has already been used. Please return to the server and request a new one." },
  LINK_EXPIRED:          { ok: false, title: "Link Expired",                body: "This verification link has expired. Please try again by requesting a new one from the server." },
  CAPTCHA_MISSING:      { ok: false, title: "CAPTCHA Required",             body: "You must complete the CAPTCHA challenge before submitting. Please go back and try again." },
  CAPTCHA_FAILED:       { ok: false, title: "CAPTCHA Failed",               body: "The CAPTCHA response was not accepted. Please try again. If the problem persists, contact our support team." },
  CAPTCHA_ERROR:        { ok: false, title: "Internal Error",               body: "An error occurred while validating the CAPTCHA. Please try again later or contact our support team." },
  ADBLOCK_DETECTED:     { ok: false, title: "Ad Blocker Detected",          body: "An ad blocker was detected in your browser. Please disable it and try again.<br><br>You have received a notification in your Discord direct messages." },
  BOT_DETECTED:         { ok: false, title: "Automated Account Detected",   body: "Automated accounts are not permitted to verify on this server.<br><br>If you believe this is an error, please contact our support team." },
  VPN_PROXY_DETECTED:   { ok: false, title: "VPN or Proxy Detected",        body: "A VPN or proxy connection was detected. Please disable it and use a standard internet connection, then try again.<br><br>You have received a notification in your Discord direct messages." },
  COUNTRY_BLOCKED:      { ok: false, title: "Access Restricted",            body: "Access from your region is currently restricted on this server.<br><br>You have received a notification in your Discord direct messages with further instructions." },
  IP_ALREADY_LINKED:    { ok: false, title: "IP Address Already in Use",    body: "This IP address is already associated with another account on this server.<br><br>You have received a notification in your Discord direct messages. If you believe this is an error, please contact our support team." },
  ALT_ACCOUNT_DETECTED: { ok: false, title: "Secondary Account Detected",   body: "Your account appears to be registered under a different IP address, which may indicate the use of an alternate account.<br><br>You have received a notification in your Discord direct messages. Please contact our support team if you believe this is an error." },
  UNKNOWN_BROWSER:      { ok: false, title: "Unrecognized Browser",         body: "Your browser could not be identified as an allowed browser. Please try again using an up-to-date, standard browser.<br><br>You have received a notification in your Discord direct messages." },
  RATE_LIMITED:         { ok: false, title: "Too Many Attempts",            body: "You have made too many requests in a short period of time. Please wait a moment and try again." },
};

function buildLegalLinksHtml(settings) {
  const privacyLink = settings?.Privacy_Policy_Link;
  const termsLink = settings?.Terms_Of_Service_Link;

  const parts = [];
  if (privacyLink) parts.push(`<a href="${privacyLink}" target="_blank">Privacy Policy</a>`);
  if (termsLink) parts.push(`<a href="${termsLink}" target="_blank">Terms of Service</a>`);

  if (parts.length === 0) return "";
  return `<div class="links">${parts.join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</div>`;
}

function buildVerifyPage(code, settings, userData) {
  const captchaEnabled = settings?.captcha_enabled !== false;
  const captchaType = settings?.capchat_type || "local";
  const serverLink = settings?.Discord_Server_Link || "https://discord.gg/DkFe9PK83";

  let captchaScript = "";
  let captchaHtml = `<button type="submit" class="btn btn-primary" id="submit-btn">Complete Verification</button>`;
  let js = "";

  if (captchaEnabled) {
    if (captchaType === "recaptcha") {
      const siteKey = process.env.RECAPTCHA_PUBLIC || "YOUR_RECAPTCHA_SITE_KEY";
      captchaScript = `<script src="https://www.google.com/recaptcha/api.js" async defer></script>`;
      captchaHtml = `<div class="g-recaptcha" data-sitekey="${siteKey}" data-callback="onCaptchaSolved" data-size="normal"></div>`;
      js = `function onCaptchaSolved() { document.getElementById("verify-form").submit(); }`;
    } else if (captchaType === "hcaptcha") {
      const siteKey = process.env.HCAPTCHA_SITE || "YOUR_HCAPTCHA_SITE_KEY";
      captchaScript = `<script src="https://js.hcaptcha.com/1/api.js" async defer></script>`;
      captchaHtml = `<div class="h-captcha" data-sitekey="${siteKey}" data-callback="onCaptchaSolved"></div>`;
      js = `function onCaptchaSolved() { document.getElementById("verify-form").submit(); }`;
    } else if (captchaType === "turnstile") {
      const siteKey = process.env.TURNSTILE_SITE || "YOUR_TURNSTILE_SITE_KEY";
      captchaScript = `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
      captchaHtml = `<div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onCaptchaSolved"></div>`;
      js = `function onCaptchaSolved() { document.getElementById("verify-form").submit(); }`;
    } else if (captchaType === "local") {
      const a = userData?.localCaptcha?.a ?? 0;
      const b = userData?.localCaptcha?.b ?? 0;
      const operator = userData?.localCaptcha?.operator ?? "+";
      captchaHtml = `
        <label class="local-captcha-label">Security question: solve the following</label>
        <div class="local-captcha-expression">${renderDistortedExpression(a, operator, b)}</div>
        <input type="text" name="local_captcha_answer" class="local-captcha-input" autocomplete="off" required>
        <button type="submit" class="btn btn-primary" id="submit-btn">Complete Verification</button>`;
    }
  }

  return buildShellPage(settings, "Security Verification", serverLink, `
    <div class="content">
      <h2>Account Verification Required</h2>
      <div class="info-box">
        To gain access to this server, you must complete the verification process below.
        By proceeding, you acknowledge that your IP address will be recorded and associated
        with your Discord account for security and anti-abuse purposes.
      </div>
      ${buildLegalLinksHtml(settings)}
      <hr class="separator">
      <div id="accept-area">
        <button class="btn btn-primary" onclick="showCaptcha()">Accept and Continue</button>
        <button class="btn" onclick="window.location.href='${serverLink}'">Cancel</button>
      </div>
      <div id="captcha-area" style="display:none;">
        <form method="POST" action="/api/verify/${code}" id="verify-form">
          <input type="hidden" name="adblock" id="adblock-field" value="false">
          ${captchaHtml}
        </form>
      </div>
    </div>`,
    `${captchaScript}
    <script>
      function detectAdBlock() {
        const t = document.createElement("div");
        t.innerHTML = "&nbsp;";
        t.className = "adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd";
        t.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;";
        document.body.appendChild(t);
        const blocked = t.offsetHeight === 0 || t.offsetWidth === 0;
        document.body.removeChild(t);
        return blocked;
      }
      function showCaptcha() {
        document.getElementById("adblock-field").value = detectAdBlock() ? "true" : "false";
        document.getElementById("accept-area").style.display = "none";
        document.getElementById("captcha-area").style.display = "block";
      }
      ${js}
    </script>`
  );
}

function buildResultPage(key, settings) {
  const cfg = RESULT_CONFIGS[key] || { ok: false, title: "Unexpected Error", body: "An unexpected error occurred. Please contact our support team." };
  const serverLink = settings?.Discord_Server_Link || "https://discord.gg/DkFe9PK83";
  const channelLink = settings?.Discord_Channel_Link || "https://discord.com/channels/1505409231803908317/1505596693972914327";
  const redirectMeta = cfg.redirect ? `<meta http-equiv="refresh" content="4;url=${channelLink}">` : "";

  return buildShellPage(settings, cfg.title, serverLink, `
    <div class="content">
      <div class="result-header ${cfg.ok ? "result-ok" : "result-err"}">
        <span class="result-label">${cfg.ok ? "VERIFIED" : "BLOCKED"}</span>
      </div>
      <h2 class="${cfg.ok ? "color-ok" : "color-err"}">${cfg.title}</h2>
      <div class="info-box ${cfg.ok ? "" : "warn"}">${cfg.body}</div>
      <p class="sub-note">${cfg.redirect ? "Redirecting to the server in a few seconds..." : "If you require assistance, please contact our support team."}</p>
    </div>`,
    redirectMeta ? `<script></script><noscript><meta http-equiv="refresh" content="4;url=${channelLink}"></noscript>` : "",
    redirectMeta
  );
}

function buildLandingPage(settings) {
  const serverLink = settings?.Discord_Server_Link || "https://discord.gg/DkFe9PK83";

  return buildShellPage(settings, "About This Service", serverLink, `
    <div class="content">
      <h2>About This Verification Service</h2>
      <div class="info-box">
        This service handles Discord account verification for this
        community. It confirms that new members are real, unique people
        before granting them access to a server, and it protects against
        automated accounts, VPN abuse, and alternate accounts.
      </div>
      <div class="info-box">
        There is nothing to do on this page directly. To verify your
        account, use the Verify button posted in the Discord server you are
        trying to join. You will receive a private verification link by
        direct message that is valid for a limited time.
      </div>
      ${buildLegalLinksHtml(settings)}
      <hr class="separator">
      <div id="accept-area">
        <button class="btn btn-primary" onclick="window.location.href='${serverLink}'">Go to Discord Server</button>
      </div>
    </div>`, "", "");
}

function buildInternalErrorPage() {
  return buildShellPage(null, "Internal Error", "#", `
    <div class="content">
      <div class="result-header result-err"><span class="result-label">ERROR</span></div>
      <h2 class="color-err">Internal Error</h2>
      <div class="info-box warn">
        An internal configuration error has occurred. Please contact the server administrator.
      </div>
      <p class="sub-note">This error has been logged. No action is required on your part.</p>
    </div>`, "", "");
}

function buildShellPage(settings, title, serverLink, bodyContent, extraScript = "", headExtra = "") {
  const site = settings?.site || {};
  const backgroundColor = site.background_color || "#c0c0c0";
  const windowColor = site.window_color || "#d4d0c8";
  const titlebarStart = site.titlebar_gradient_start || "#000080";
  const titlebarEnd = site.titlebar_gradient_end || "#1084d0";
  const successColor = site.success_color || "#1a6e1a";
  const errorColor = site.error_color || "#8b0000";
  const brandName = site.brand_name || "Security Verification";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${headExtra}
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: ${backgroundColor};
  font-family: "Tahoma", "MS Sans Serif", Arial, sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
}
.window {
  background: ${windowColor};
  border: 2px solid;
  border-color: #ffffff #808080 #808080 #ffffff;
  width: 500px;
  max-width: 100%;
  box-shadow: 3px 3px 8px rgba(0,0,0,0.35);
}
.titlebar {
  background: linear-gradient(to right, ${titlebarStart}, ${titlebarEnd});
  color: #ffffff;
  padding: 5px 8px;
  font-weight: bold;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  letter-spacing: 0.2px;
}
.titlebar-left { display: flex; align-items: center; gap: 6px; }
.discord-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(255,255,255,0.85);
  text-decoration: none;
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid rgba(255,255,255,0.3);
  transition: background 0.15s;
}
.discord-link:hover { background: rgba(255,255,255,0.15); }
.discord-logo { width: 14px; height: 14px; fill: #ffffff; }
.content { padding: 20px; }
h2 { font-size: 14px; margin-bottom: 12px; font-weight: bold; }
.color-ok { color: ${successColor}; }
.color-err { color: ${errorColor}; }
.result-header {
  display: inline-block;
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  padding: 2px 8px;
  margin-bottom: 10px;
  border: 1px solid;
}
.result-ok { color: ${successColor}; border-color: ${successColor}; background: #f0fff0; }
.result-err { color: ${errorColor}; border-color: ${errorColor}; background: #fff0f0; }
.info-box {
  background: #ffffff;
  border: 1px solid;
  border-color: #808080 #ffffff #ffffff #808080;
  padding: 10px 12px;
  margin-bottom: 12px;
  line-height: 1.65;
  font-size: 12px;
}
.info-box.warn { border-left: 3px solid #cc0000; }
.links { font-size: 11px; margin-bottom: 14px; }
.links a { color: #000080; }
.separator { border: none; border-top: 1px solid #808080; border-bottom: 1px solid #ffffff; margin: 14px 0; }
.btn {
  background: #d4d0c8;
  border: 2px solid;
  border-color: #ffffff #808080 #808080 #ffffff;
  padding: 4px 20px;
  font-family: "Tahoma", Arial, sans-serif;
  font-size: 13px;
  cursor: pointer;
  margin-right: 6px;
}
.btn:active { border-color: #808080 #ffffff #ffffff #808080; }
.btn-primary { font-weight: bold; }
.sub-note { font-size: 11px; color: #555555; margin-top: 10px; }
.g-recaptcha { margin-bottom: 12px; }
.local-captcha-label { display: block; font-size: 12px; font-weight: bold; margin-bottom: 6px; }
.local-captcha-expression {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 10px;
  user-select: none;
  letter-spacing: 2px;
}
.local-captcha-input {
  border: 1px solid;
  border-color: #808080 #ffffff #ffffff #808080;
  padding: 3px 6px;
  font-family: "Tahoma", Arial, sans-serif;
  font-size: 12px;
  width: 80px;
  margin-bottom: 10px;
  display: block;
}
.footer {
  margin-top: 14px;
  font-size: 10px;
  color: #666666;
  text-align: center;
  letter-spacing: 0.2px;
}
</style>
</head>
<body>
<div class="window">
  <div class="titlebar">
    <div class="titlebar-left">
      <span>${brandName}</span>
    </div>
    <a href="${serverLink}" target="_blank" class="discord-link" title="Back to Discord server">
      <svg class="discord-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
      </svg>
      Discord
    </a>
  </div>
  ${bodyContent}
  <div class="footer">${site.footer_text || "Secured by the verification system"}</div>
</div>
${extraScript}
</body>
</html>`;
}

function buildSettingsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Settings</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #c0c0c0;
  font-family: "Tahoma", "MS Sans Serif", Arial, sans-serif;
  font-size: 13px;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
}
.window {
  background: #d4d0c8;
  border: 2px solid;
  border-color: #ffffff #808080 #808080 #ffffff;
  width: 720px;
  max-width: 100%;
  box-shadow: 3px 3px 8px rgba(0,0,0,0.35);
}
.titlebar {
  background: linear-gradient(to right, #000080, #1084d0);
  color: #ffffff;
  padding: 5px 8px;
  font-weight: bold;
  font-size: 12px;
  user-select: none;
  letter-spacing: 0.2px;
}
.content { padding: 16px; }
.section {
  background: #ffffff;
  border: 1px solid;
  border-color: #808080 #ffffff #ffffff #808080;
  padding: 12px;
  margin-bottom: 12px;
}
.section-title {
  font-weight: bold;
  color: #000080;
  font-size: 11px;
  border-bottom: 1px solid #d0d0d0;
  padding-bottom: 6px;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
label { display: block; font-weight: bold; margin-bottom: 3px; font-size: 12px; }
input[type=text], input[type=password], input[type=number], input[type=color], select, textarea {
  width: 100%;
  border: 1px solid;
  border-color: #808080 #ffffff #ffffff #808080;
  padding: 3px 6px;
  font-family: "Tahoma", Arial, sans-serif;
  font-size: 12px;
  background: #ffffff;
  margin-bottom: 10px;
}
textarea { resize: vertical; min-height: 50px; }
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  padding: 2px 0;
}
input[type=checkbox] { width: 14px; height: 14px; cursor: pointer; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.btn-row { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.btn {
  background: #d4d0c8;
  border: 2px solid;
  border-color: #ffffff #808080 #808080 #ffffff;
  padding: 4px 20px;
  font-family: "Tahoma", Arial, sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.btn:active { border-color: #808080 #ffffff #ffffff #808080; }
.btn-primary { font-weight: bold; }
#status {
  display: none;
  padding: 6px 10px;
  margin-top: 10px;
  font-size: 12px;
  font-weight: bold;
  border: 1px solid;
}
.status-ok { color: #1a6e1a; border-color: #1a6e1a; background: #f0fff0; }
.status-err { color: #8b0000; border-color: #8b0000; background: #fff0f0; }
.hint { font-size: 11px; color: #555555; margin: -6px 0 10px; }
#auth-overlay {
  position: fixed; inset: 0;
  background: #c0c0c0;
  display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
#auth-window {
  background: #d4d0c8;
  border: 2px solid;
  border-color: #ffffff #808080 #808080 #ffffff;
  width: 380px;
  box-shadow: 3px 3px 8px rgba(0,0,0,0.35);
}
#auth-window .titlebar { padding: 5px 8px; }
#auth-window .content { padding: 16px; font-size: 12px; line-height: 1.65; }
#auth-msg { margin-top: 8px; color: #8b0000; font-weight: bold; }
</style>
</head>
<body>

<div id="auth-overlay">
  <div id="auth-window">
    <div class="titlebar">Authentication Required</div>
    <div class="content">
      <p>Validating session token, please wait...</p>
      <p id="auth-msg"></p>
    </div>
  </div>
</div>

<div class="window" id="main-panel" style="display:none;">
  <div class="titlebar">Bot Settings</div>
  <div class="content">

    <div class="section">
      <div class="section-title">General</div>
      <label>Command Prefix</label>
      <input type="text" id="prefix" maxlength="5" placeholder="+">
      <label>Run in local mode (skip domain check, always use localhost)</label>
      <div class="toggle-row"><span>Local Mode</span><input type="checkbox" id="local"></div>
      <label>Public Domain (ignored if Local Mode is on)</label>
      <input type="text" id="public_domain" placeholder="verify.example.com">
      <label>Discord Server Link</label>
      <input type="text" id="Discord_Server_Link" placeholder="https://discord.gg/...">
      <label>Discord Channel Link (post-verification redirect)</label>
      <input type="text" id="Discord_Channel_Link" placeholder="https://discord.com/channels/...">
      <label>Privacy Policy Link (leave blank to hide)</label>
      <input type="text" id="Privacy_Policy_Link" placeholder="https://example.com/privacy">
      <label>Terms of Service Link (leave blank to hide)</label>
      <input type="text" id="Terms_Of_Service_Link" placeholder="https://example.com/terms">
      <div class="toggle-row"><span>Enable System</span><input type="checkbox" id="Enable"></div>
      <div class="toggle-row"><span>Enable Verification</span><input type="checkbox" id="verification_enabled"></div>
      <div class="toggle-row"><span>Enable Logs</span><input type="checkbox" id="logs_enabled"></div>
    </div>

    <div class="section">
      <div class="section-title">Commands</div>
      <p class="hint">Change the word typed after the prefix for each command.</p>
      <div class="two-col">
        <div><label>Send Panel</label><input type="text" id="cmd_sendpanel"></div>
        <div><label>Verify</label><input type="text" id="cmd_verify"></div>
        <div><label>Docs</label><input type="text" id="cmd_docs"></div>
        <div><label>Settings</label><input type="text" id="cmd_settings"></div>
        <div><label>Get Info</label><input type="text" id="cmd_getinfo"></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Captcha</div>
      <div class="toggle-row"><span>Enable CAPTCHA</span><input type="checkbox" id="captcha_enabled"></div>
      <label>Captcha Provider</label>
      <select id="capchat_type">
        <option value="recaptcha">Google reCAPTCHA</option>
        <option value="hcaptcha">hCaptcha</option>
        <option value="turnstile">Cloudflare Turnstile</option>
        <option value="local">Local challenge (no third party)</option>
      </select>
      <label>Google reCAPTCHA Secret Key (leave blank to keep current)</label>
      <input type="password" id="google_token" placeholder="Leave blank to keep current value">
    </div>

    <div class="section">
      <div class="section-title">Security Policies</div>
      <div class="toggle-row"><span>Allow VPN / Proxy</span><input type="checkbox" id="Allow_Vpn_Proxy"></div>
      <div class="toggle-row"><span>Fail Closed on VPN Check Error</span><input type="checkbox" id="Vpn_Check_Fail_Closed"></div>
      <label>VPN Check Timeout (ms)</label>
      <input type="number" id="Vpn_Check_Timeout_Ms" min="500">
      <div class="toggle-row"><span>Allow Alternate Accounts</span><input type="checkbox" id="Allow_Alt"></div>
      <div class="toggle-row"><span>Allow IP Already Linked</span><input type="checkbox" id="Allow_Ip_Already_Linked"></div>
      <div class="toggle-row"><span>Block Unknown Browsers</span><input type="checkbox" id="BlockingUnknownNavigator"></div>
      <label>Authorized Browsers (comma-separated)</label>
      <input type="text" id="Authorised_Navigators" placeholder="Chrome, Firefox, Safari, Edge">
      <label>Blocked Country Codes (comma-separated, ISO 3166-1 alpha-2)</label>
      <input type="text" id="blocked_countries" placeholder="KP, IR">
    </div>

    <div class="section">
      <div class="section-title">Rate Limiting</div>
      <label>Time Window (ms)</label>
      <input type="number" id="rl_window_ms" min="1000">
      <label>Max Requests per Window (per IP)</label>
      <input type="number" id="rl_max_requests" min="1">
      <label>Button Click Cooldown (ms, per Discord user)</label>
      <input type="number" id="rl_button_cooldown_ms" min="0">
    </div>

    <div class="section">
      <div class="section-title">Roles</div>
      <label>Not Verified Role ID</label>
      <input type="text" id="NotVerified_Role" placeholder="Role ID">
      <label>Verified Role ID</label>
      <input type="text" id="Verified_Role" placeholder="Role ID">
    </div>

    <div class="section">
      <div class="section-title">Webhooks</div>
      <label>Success Webhook URL</label>
      <input type="text" id="Success_Verify_Webhook" placeholder="https://discord.com/api/webhooks/...">
      <label>Error Webhook URL</label>
      <input type="text" id="Error_Verify_Webhook" placeholder="https://discord.com/api/webhooks/...">
      <label>Logs Webhook URL</label>
      <input type="text" id="Logs_Verify_Webbhook" placeholder="https://discord.com/api/webhooks/...">
    </div>

    <div class="section">
      <div class="section-title">Site Appearance</div>
      <label>Brand Name (shown in the window title bar)</label>
      <input type="text" id="site_brand_name">
      <label>Footer Text</label>
      <input type="text" id="site_footer_text">
      <div class="two-col">
        <div><label>Background Color</label><input type="color" id="site_background_color"></div>
        <div><label>Window Color</label><input type="color" id="site_window_color"></div>
        <div><label>Titlebar Gradient Start</label><input type="color" id="site_titlebar_gradient_start"></div>
        <div><label>Titlebar Gradient End</label><input type="color" id="site_titlebar_gradient_end"></div>
        <div><label>Success Color</label><input type="color" id="site_success_color"></div>
        <div><label>Error Color</label><input type="color" id="site_error_color"></div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
    </div>
    <div id="status"></div>

  </div>
</div>

<script>
let sessionToken = null;

async function init() {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace("#", "?"));
  sessionToken = params.get("token");

  if (!sessionToken) {
    document.getElementById("auth-msg").textContent = "No session token was found in the URL. Access denied.";
    return;
  }

  window.history.replaceState(null, "", window.location.pathname);

  try {
    const res = await fetch("/api/settings/validate?token=" + encodeURIComponent(sessionToken));
    const data = await res.json();
    if (!data.valid) {
      document.getElementById("auth-msg").textContent = "The session token is invalid or has expired. Access denied.";
      return;
    }
    loadSettings(data.settings);
    document.getElementById("auth-overlay").style.display = "none";
    document.getElementById("main-panel").style.display = "block";
  } catch {
    document.getElementById("auth-msg").textContent = "A network error occurred while validating the session token.";
  }
}

function loadSettings(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ""; };
  const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val === true; };

  set("prefix", s.prefix || "+");
  check("local", s.local === true);
  set("public_domain", s.public_domain || "");
  set("Discord_Server_Link", s.Discord_Server_Link || "");
  set("Discord_Channel_Link", s.Discord_Channel_Link || "");
  set("Privacy_Policy_Link", s.Privacy_Policy_Link || "");
  set("Terms_Of_Service_Link", s.Terms_Of_Service_Link || "");
  check("Enable", s.Enable !== false);
  check("verification_enabled", s.verification_enabled !== false);
  check("logs_enabled", s.logs_enabled !== false);

  const cmds = s.commands || {};
  set("cmd_sendpanel", cmds.sendpanel || "sendpanel");
  set("cmd_verify", cmds.verify || "verify");
  set("cmd_docs", cmds.docs || "docs");
  set("cmd_settings", cmds.settings || "settings");
  set("cmd_getinfo", cmds.getinfo || "getinfo");

  check("captcha_enabled", s.captcha_enabled === true);
  set("capchat_type", s.capchat_type || "local");

  check("Allow_Vpn_Proxy", s.Allow_Vpn_Proxy === true);
  check("Vpn_Check_Fail_Closed", s.Vpn_Check_Fail_Closed === true);
  set("Vpn_Check_Timeout_Ms", s.Vpn_Check_Timeout_Ms || 4000);
  check("Allow_Alt", s.Allow_Alt === true);
  check("Allow_Ip_Already_Linked", s.Allow_Ip_Already_Linked === true);
  check("BlockingUnknownNavigator", s.BlockingUnknownNavigator === true);
  set("Authorised_Navigators", (s.Authorised_Navigators || []).join(", "));
  set("blocked_countries", (s.blocked_countries || []).join(", "));

  const rl = s.rate_limit || {};
  set("rl_window_ms", rl.window_ms || 60000);
  set("rl_max_requests", rl.max_requests || 10);
  set("rl_button_cooldown_ms", rl.button_cooldown_ms || 15000);

  set("NotVerified_Role", s.NotVerified_Role || "");
  set("Verified_Role", s.Verified_Role || "");
  set("Success_Verify_Webhook", s.Success_Verify_Webhook || "");
  set("Error_Verify_Webhook", s.Error_Verify_Webhook || "");
  set("Logs_Verify_Webbhook", s.Logs_Verify_Webbhook || "");

  const site = s.site || {};
  set("site_brand_name", site.brand_name || "Security Verification");
  set("site_footer_text", site.footer_text || "Secured by the verification system");
  set("site_background_color", site.background_color || "#c0c0c0");
  set("site_window_color", site.window_color || "#d4d0c8");
  set("site_titlebar_gradient_start", site.titlebar_gradient_start || "#000080");
  set("site_titlebar_gradient_end", site.titlebar_gradient_end || "#1084d0");
  set("site_success_color", site.success_color || "#1a6e1a");
  set("site_error_color", site.error_color || "#8b0000");
}

function splitList(value) {
  return value.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
}

async function saveSettings() {
  const get = (id) => document.getElementById(id)?.value || "";
  const checked = (id) => document.getElementById(id)?.checked || false;

  const settings = {
    prefix: get("prefix"),
    local: checked("local"),
    public_domain: get("public_domain"),
    Discord_Server_Link: get("Discord_Server_Link"),
    Discord_Channel_Link: get("Discord_Channel_Link"),
    Privacy_Policy_Link: get("Privacy_Policy_Link"),
    Terms_Of_Service_Link: get("Terms_Of_Service_Link"),
    Enable: checked("Enable"),
    verification_enabled: checked("verification_enabled"),
    logs_enabled: checked("logs_enabled"),
    commands: {
      sendpanel: get("cmd_sendpanel"),
      verify: get("cmd_verify"),
      docs: get("cmd_docs"),
      settings: get("cmd_settings"),
      getinfo: get("cmd_getinfo"),
    },
    captcha_enabled: checked("captcha_enabled"),
    capchat_type: get("capchat_type"),
    Allow_Vpn_Proxy: checked("Allow_Vpn_Proxy"),
    Vpn_Check_Fail_Closed: checked("Vpn_Check_Fail_Closed"),
    Vpn_Check_Timeout_Ms: parseInt(get("Vpn_Check_Timeout_Ms"), 10) || 4000,
    Allow_Alt: checked("Allow_Alt"),
    Allow_Ip_Already_Linked: checked("Allow_Ip_Already_Linked"),
    BlockingUnknownNavigator: checked("BlockingUnknownNavigator"),
    Authorised_Navigators: splitList(get("Authorised_Navigators")),
    blocked_countries: splitList(get("blocked_countries")).map((c) => c.toUpperCase()),
    rate_limit: {
      window_ms: parseInt(get("rl_window_ms"), 10) || 60000,
      max_requests: parseInt(get("rl_max_requests"), 10) || 10,
      button_cooldown_ms: parseInt(get("rl_button_cooldown_ms"), 10) || 15000,
    },
    NotVerified_Role: get("NotVerified_Role"),
    Verified_Role: get("Verified_Role"),
    Success_Verify_Webhook: get("Success_Verify_Webhook"),
    Error_Verify_Webhook: get("Error_Verify_Webhook"),
    Logs_Verify_Webbhook: get("Logs_Verify_Webbhook"),
    site: {
      brand_name: get("site_brand_name"),
      footer_text: get("site_footer_text"),
      background_color: get("site_background_color"),
      window_color: get("site_window_color"),
      titlebar_gradient_start: get("site_titlebar_gradient_start"),
      titlebar_gradient_end: get("site_titlebar_gradient_end"),
      success_color: get("site_success_color"),
      error_color: get("site_error_color"),
    },
  };

  const googleToken = get("google_token");
  if (googleToken) settings.google_token = googleToken;

  try {
    const res = await fetch("/api/settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: sessionToken, settings }),
    });
    const data = await res.json();
    showStatus(data.success ? "Settings saved successfully." : "Failed to save settings. Please try again.", data.success);
  } catch {
    showStatus("A network error occurred. Please check your connection and try again.", false);
  }
}

function showStatus(msg, ok) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = ok ? "status-ok" : "status-err";
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

window.addEventListener("beforeunload", () => { sessionToken = null; });
init();
</script>
</body>
</html>`;
}
