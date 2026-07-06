const { loadSettings } = require("../utils/settingsStore");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    let settings;
    try {
      settings = loadSettings();
    } catch {
      return;
    }

    if (!settings.Enable || !settings.verification_enabled) return;
    if (!settings.NotVerified_Role) return;

    const role = member.guild.roles.cache.get(settings.NotVerified_Role);
    if (!role) return;

    await member.roles.add(role).catch(() => {});
  },
};
