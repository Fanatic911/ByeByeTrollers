const { v4: uuidv4 } = require("uuid");
const { resolveBaseUrl } = require("../utils/publicUrl");
const { loadSettings } = require("../utils/settingsStore");

const activeTokens = new Map();

module.exports = {
  name: "settings",
  activeTokens,

  async execute(message, args, client) {
    const settings = loadSettings();
    const token = uuidv4();
    activeTokens.set(token, { guildId: message.guild.id, userId: message.author.id, createdAt: Date.now() });

    setTimeout(() => activeTokens.delete(token), 5 * 60 * 1000);

    const baseUrl = await resolveBaseUrl(settings);
    const link = `${baseUrl}/settings/#token=${token}`;
    const dmContent = `Access your settings panel here:\n${link}\n\nNote: This link expires in 5 minutes and is invalidated when you close or reload the page.`;

    try {
      await message.author.send(dmContent);
      await message.reply("Your settings panel link has been sent via direct message.");
    } catch {
      await message.reply("Your direct messages are disabled. Enable them to receive the settings panel link.");
    }
  },
};
