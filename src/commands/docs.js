const { EmbedBuilder } = require("discord.js");
const { loadSettings } = require("../utils/settingsStore");
const { getCommandName } = require("../utils/commandNames");

module.exports = {
  name: "docs",
  async execute(message) {
    const settings = loadSettings();
    const prefix = settings.prefix || "+";

    const embed = new EmbedBuilder()
      .setTitle("Bot Commands Documentation")
      .setColor(0x5865f2)
      .addFields(
        {
          name: `${prefix}${getCommandName(settings, "sendpanel")}`,
          value: "Sends the verification panel in the current channel. Requires an **Admin** or **Moderator** role.",
          inline: false,
        },
        {
          name: `${prefix}${getCommandName(settings, "verify")} @user <reason>`,
          value: "Manually verifies a user, assigns them the verified role, and logs the action. Requires an **Admin** or **Moderator** role.",
          inline: false,
        },
        {
          name: `${prefix}${getCommandName(settings, "getinfo")} @user | id | ip`,
          value: "Looks up the IP linked to a Discord account, or the accounts that attempted verification from an IP address, with accepted/refused history. Requires an **Admin** or **Moderator** role.",
          inline: false,
        },
        {
          name: `${prefix}${getCommandName(settings, "docs")}`,
          value: "Displays this help message. Requires an **Admin** or **Moderator** role.",
          inline: false,
        },
        {
          name: `${prefix}${getCommandName(settings, "settings")}`,
          value: "Sends a private link to the web settings panel. Requires an **Admin** role.",
          inline: false,
        }
      )
      .setFooter({ text: "Verification System" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};
