const axios = require("axios");
const { loadSettings } = require("../utils/settingsStore");

async function sendWebhook(url, embed) {
  if (!url) return;
  try {
    await axios.post(url, { embeds: [embed] });
  } catch {}
}

module.exports = {
  name: "verify",
  async execute(message, args, client) {
    const target = message.mentions.users.first();
    const reason = args.slice(1).join(" ").trim();

    if (!target || !reason) {
      return message.reply("Usage: +verify @user <reason>");
    }

    const settings = loadSettings();
    const guild = message.guild;
    let member;
    try {
      member = await guild.members.fetch(target.id);
    } catch {
      return message.reply("Could not find that user in this server.");
    }

    try {
      if (settings.NotVerified_Role) await member.roles.remove(settings.NotVerified_Role).catch(() => {});
      if (settings.Verified_Role) await member.roles.add(settings.Verified_Role).catch(() => {});
    } catch {}

    try {
      await target.send(`You got verified manually by moderator: <@${message.author.id}>`);
    } catch {}

    if (settings.logs_enabled && settings.Logs_Verify_Webbhook) {
      const logEmbed = {
        title: "Verified user by the command +verify",
        color: 0x57f287,
        fields: [
          { name: "By", value: `${message.author.id} <@${message.author.id}>`, inline: false },
          { name: "Affected user", value: `${target.id} <@${target.id}>`, inline: false },
          { name: "Reason", value: reason, inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      await sendWebhook(settings.Logs_Verify_Webbhook, logEmbed);
    }

    await message.reply(`<@${target.id}> has been manually verified.`);
  },
};
