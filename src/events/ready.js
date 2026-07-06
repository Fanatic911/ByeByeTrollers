const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "../../settings.json");

function getSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    const settings = getSettings();

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

    const slashCommands = [];
    const commandsPath = path.join(__dirname, "../commands");
    const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if (command.data) slashCommands.push(command.data.toJSON());
    }

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
      console.log("Slash commands registered.");
    } catch (err) {
      console.error("Failed to register slash commands:", err);
    }
  },
};
