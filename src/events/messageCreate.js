const { isModerator, isAdmin } = require("../utils/permissions");
const { resolveCanonicalName } = require("../utils/commandNames");
const { loadSettings } = require("../utils/settingsStore");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    let settings;
    try {
      settings = loadSettings();
    } catch {
      return;
    }

    const prefix = settings.prefix || "+";

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const typedName = args.shift().toLowerCase();
    const commandName = resolveCanonicalName(settings, typedName);

    const command = client.commands.get(commandName);
    if (!command) return;

    const requiredCheck = commandName === "settings" ? isAdmin : isModerator;
    if (!requiredCheck(message.member, settings)) return;

    try {
      await command.execute(message, args, client);
    } catch (err) {
      console.error(err);
    }
  },
};
