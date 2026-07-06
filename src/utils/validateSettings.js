const CAPTCHA_TYPES = ["local", "hcaptcha", "turnstile", "recaptcha"];
const COMMAND_KEYS = ["sendpanel", "verify", "docs", "settings", "getinfo"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validateSettings(settings) {
  const errors = [];

  if (!settings || typeof settings !== "object") {
    return ["settings.json must contain a JSON object."];
  }

  if (!isNonEmptyString(settings.prefix)) {
    errors.push('"prefix" must be a non-empty string.');
  }

  if (settings.commands !== undefined) {
    if (!isPlainObject(settings.commands)) {
      errors.push('"commands" must be an object mapping each command key to its invocation word.');
    } else {
      for (const key of COMMAND_KEYS) {
        const value = settings.commands[key];
        if (value !== undefined && !isNonEmptyString(value)) {
          errors.push(`"commands.${key}" must be a non-empty string.`);
        }
      }
    }
  }

  if (settings.local !== undefined && !isBoolean(settings.local)) {
    errors.push('"local" must be a boolean (true or false).');
  }

  if (!isBoolean(settings.Enable)) {
    errors.push('"Enable" must be a boolean (true or false).');
  }

  if (!isBoolean(settings.verification_enabled)) {
    errors.push('"verification_enabled" must be a boolean (true or false).');
  }

  if (!isBoolean(settings.captcha_enabled)) {
    errors.push('"captcha_enabled" must be a boolean (true or false).');
  }

  if (!CAPTCHA_TYPES.includes(settings.capchat_type)) {
    errors.push(`"capchat_type" must be exactly one of: ${CAPTCHA_TYPES.join(", ")}. Received: ${JSON.stringify(settings.capchat_type)}.`);
  }

  if (!Array.isArray(settings.admin_role)) {
    errors.push('"admin_role" must be an array of role ID strings.');
  }

  if (!Array.isArray(settings.moderator_role)) {
    errors.push('"moderator_role" must be an array of role ID strings.');
  }

  const linkLifetime = parseInt(settings.verification_code_expiry, 10);
  if (!Number.isFinite(linkLifetime) || linkLifetime <= 0) {
    errors.push('"verification_code_expiry" must be a positive number of milliseconds.');
  }

  if (settings.verification_enabled) {
    if (!isNonEmptyString(settings.NotVerified_Role)) {
      errors.push('"NotVerified_Role" must be a role ID string when "verification_enabled" is true.');
    }
    if (!isNonEmptyString(settings.Verified_Role)) {
      errors.push('"Verified_Role" must be a role ID string when "verification_enabled" is true.');
    }
  }

  if (!settings.local && !isNonEmptyString(settings.public_domain)) {
    errors.push('"public_domain" must be a non-empty string when "local" is false.');
  }

  if (settings.Allow_Vpn_Proxy !== undefined && !isBoolean(settings.Allow_Vpn_Proxy)) {
    errors.push('"Allow_Vpn_Proxy" must be a boolean.');
  }

  if (settings.Vpn_Check_Fail_Closed !== undefined && !isBoolean(settings.Vpn_Check_Fail_Closed)) {
    errors.push('"Vpn_Check_Fail_Closed" must be a boolean.');
  }

  if (settings.Vpn_Check_Timeout_Ms !== undefined) {
    const t = parseInt(settings.Vpn_Check_Timeout_Ms, 10);
    if (!Number.isFinite(t) || t <= 0) {
      errors.push('"Vpn_Check_Timeout_Ms" must be a positive number of milliseconds.');
    }
  }

  if (settings.Allow_Alt !== undefined && !isBoolean(settings.Allow_Alt)) {
    errors.push('"Allow_Alt" must be a boolean.');
  }

  if (settings.Allow_Ip_Already_Linked !== undefined && !isBoolean(settings.Allow_Ip_Already_Linked)) {
    errors.push('"Allow_Ip_Already_Linked" must be a boolean.');
  }

  if (settings.BlockingUnknownNavigator !== undefined && !isBoolean(settings.BlockingUnknownNavigator)) {
    errors.push('"BlockingUnknownNavigator" must be a boolean.');
  }

  if (settings.Authorised_Navigators !== undefined && !isStringArray(settings.Authorised_Navigators)) {
    errors.push('"Authorised_Navigators" must be an array of browser name strings.');
  }

  if (settings.blocked_countries !== undefined && !isStringArray(settings.blocked_countries)) {
    errors.push('"blocked_countries" must be an array of ISO 3166-1 alpha-2 country code strings.');
  }

  if (settings.rate_limit !== undefined) {
    if (!isPlainObject(settings.rate_limit)) {
      errors.push('"rate_limit" must be an object.');
    } else {
      const { window_ms, max_requests, button_cooldown_ms } = settings.rate_limit;
      if (window_ms !== undefined && (!Number.isFinite(window_ms) || window_ms <= 0)) {
        errors.push('"rate_limit.window_ms" must be a positive number.');
      }
      if (max_requests !== undefined && (!Number.isFinite(max_requests) || max_requests <= 0)) {
        errors.push('"rate_limit.max_requests" must be a positive number.');
      }
      if (button_cooldown_ms !== undefined && (!Number.isFinite(button_cooldown_ms) || button_cooldown_ms < 0)) {
        errors.push('"rate_limit.button_cooldown_ms" must be a non-negative number.');
      }
    }
  }

  if (settings.Privacy_Policy_Link !== undefined && typeof settings.Privacy_Policy_Link !== "string") {
    errors.push('"Privacy_Policy_Link" must be a string.');
  }

  if (settings.Terms_Of_Service_Link !== undefined && typeof settings.Terms_Of_Service_Link !== "string") {
    errors.push('"Terms_Of_Service_Link" must be a string.');
  }

  if (settings.site !== undefined && !isPlainObject(settings.site)) {
    errors.push('"site" must be an object.');
  }

  return errors;
}

function formatValidationErrors(errors) {
  return `Invalid settings.json:\n- ${errors.join("\n- ")}`;
}

module.exports = { validateSettings, formatValidationErrors, CAPTCHA_TYPES, COMMAND_KEYS };
