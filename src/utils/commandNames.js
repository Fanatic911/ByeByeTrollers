const DEFAULT_COMMAND_NAMES = {
  sendpanel: "sendpanel",
  verify: "verify",
  docs: "docs",
  settings: "settings",
  getinfo: "getinfo",
};

function getCommandName(settings, key) {
  const configured = settings?.commands?.[key];
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim().toLowerCase();
  }
  return DEFAULT_COMMAND_NAMES[key];
}

function resolveCanonicalName(settings, typedName) {
  for (const key of Object.keys(DEFAULT_COMMAND_NAMES)) {
    if (getCommandName(settings, key) === typedName) return key;
  }
  return typedName;
}

module.exports = { DEFAULT_COMMAND_NAMES, getCommandName, resolveCanonicalName };
