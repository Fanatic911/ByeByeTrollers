const fs = require("fs");
const path = require("path");
const { validateSettings, formatValidationErrors } = require("./validateSettings");

const SETTINGS_FILE = path.join(__dirname, "../../settings.json");

const DEFAULTS = {
  local: false,
  commands: {
    sendpanel: "sendpanel",
    verify: "verify",
    docs: "docs",
    settings: "settings",
    getinfo: "getinfo",
  },
  verification_enabled: true,
  Enable: true,
  captcha_enabled: false,
  capchat_type: "local",
  logs_enabled: true,
  admin_role: [],
  moderator_role: [],
  verification_code_expiry: 1800000,
  Allow_Vpn_Proxy: false,
  Vpn_Check_Fail_Closed: false,
  Vpn_Check_Timeout_Ms: 4000,
  Allow_Alt: false,
  Allow_Ip_Already_Linked: false,
  BlockingUnknownNavigator: false,
  Authorised_Navigators: [
    "Chrome",
    "Firefox",
    "Safari",
    "Edge",
    "Opera",
    "Brave",
    "Vivaldi",
    "Samsung Internet",
    "UC Browser",
    "Discord",
  ],
  blocked_countries: [],
  rate_limit: {
    window_ms: 60000,
    max_requests: 10,
    button_cooldown_ms: 15000,
  },
  Discord_Server_Link: "",
  Discord_Channel_Link: "",
  Privacy_Policy_Link: "",
  Terms_Of_Service_Link: "",
  Success_Verify_Webhook: "",
  Error_Verify_Webhook: "",
  Logs_Verify_Webbhook: "",
  site: {
    title: "Security Verification",
    brand_name: "Verification System",
    footer_text: "Secured by the verification system",
    background_color: "#c0c0c0",
    window_color: "#d4d0c8",
    titlebar_gradient_start: "#000080",
    titlebar_gradient_end: "#1084d0",
    text_color: "#000000",
    success_color: "#1a6e1a",
    error_color: "#8b0000",
  },
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  if (!isPlainObject(override)) return override === undefined ? result : override;
  for (const key of Object.keys(override)) {
    if (isPlainObject(base?.[key]) && isPlainObject(override[key])) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function readRawSettings() {
  const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
  return JSON.parse(raw);
}

function loadSettings() {
  const raw = readRawSettings();
  const merged = deepMerge(DEFAULTS, raw);
  const errors = validateSettings(merged);
  if (errors.length > 0) throw new Error(formatValidationErrors(errors));
  return merged;
}

function saveSettings(partialUpdate) {
  const current = readRawSettings();
  const merged = deepMerge(deepMerge(DEFAULTS, current), partialUpdate);
  const errors = validateSettings(merged);
  if (errors.length > 0) return { ok: false, errors };
  const toPersist = deepMerge(current, partialUpdate);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toPersist, null, 2));
  return { ok: true, settings: merged };
}

module.exports = { loadSettings, saveSettings, deepMerge, DEFAULTS, SETTINGS_FILE };
