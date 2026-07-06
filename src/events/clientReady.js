const { loadSettings } = require("../utils/settingsStore");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    let settings;
    try {
      settings = loadSettings();
    } catch (err) {
      console.error(err.message);
      return;
    }

    if (!settings.Enable) {
      for (const guild of client.guilds.cache.values()) {
        const members = await guild.members.fetch().catch(() => new Map());
        for (const member of members.values()) {
          if (settings.NotVerified_Role) await member.roles.remove(settings.NotVerified_Role).catch(() => {});
          if (settings.Verified_Role) await member.roles.remove(settings.Verified_Role).catch(() => {});
        }
      }
      console.log("System disabled — roles stripped from all members.");
    }

    console.log(`Prefix commands ready (prefix: ${settings.prefix || "+"}).`);
  },
};
