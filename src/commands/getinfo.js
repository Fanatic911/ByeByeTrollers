const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getAttemptsForIp, getAttemptsForUser } = require("../utils/attempts");

const DB_FILE = path.join(__dirname, "../../Database/IP.json");

function getDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {};
  }
}

function isSnowflake(value) {
  return /^\d{15,20}$/.test(value);
}

function isIpAddress(value) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/;
  return ipv4.test(value) || ipv6.test(value);
}

function formatAttempt(entry) {
  const status = entry.result === "Accepted" ? "✅ Accepted" : "❌ Refused";
  return `${status} — ${entry.reason} (<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>)`;
}

module.exports = {
  name: "getinfo",
  async execute(message, args) {
    const target = message.mentions.users.first();
    const rawArg = args[0];

    if (!target && !rawArg) {
      return message.reply("Usage: +getinfo @user, +getinfo <user_id>, or +getinfo <ip_address>");
    }

    const db = getDatabase();

    if (target || isSnowflake(rawArg)) {
      const userId = target ? target.id : rawArg;
      const currentIp = db[userId] || null;
      const history = getAttemptsForUser(userId).slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle("Account Lookup")
        .setColor(0x5865f2)
        .addFields(
          { name: "Discord Account", value: `${userId} <@${userId}>`, inline: false },
          { name: "Currently Linked IP", value: currentIp || "No verified IP on record", inline: false },
          {
            name: "Recent Attempts",
            value: history.length > 0
              ? history.map((e) => `${e.ip} — ${formatAttempt(e)}`).join("\n")
              : "No recorded attempts.",
            inline: false,
          }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (isIpAddress(rawArg)) {
      const ip = rawArg;
      const currentOwner = Object.entries(db).find(([, storedIp]) => storedIp === ip);
      const history = getAttemptsForIp(ip).slice(0, 15);

      const embed = new EmbedBuilder()
        .setTitle("IP Address Lookup")
        .setColor(0x5865f2)
        .addFields(
          { name: "IP Address", value: ip, inline: false },
          {
            name: "Currently Linked Account",
            value: currentOwner ? `${currentOwner[0]} <@${currentOwner[0]}>` : "No account currently linked",
            inline: false,
          },
          {
            name: "Attempt History",
            value: history.length > 0
              ? history.map((e) => `<@${e.userId}> (${e.userId}) — ${formatAttempt(e)}`).join("\n")
              : "No recorded attempts.",
            inline: false,
          }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    return message.reply("Could not recognize that value as a mention, a Discord user ID, or an IP address.");
  },
};
