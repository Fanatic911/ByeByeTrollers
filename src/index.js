const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../key.env") });
const fs = require("fs");
const startWebServer = require("./web/server");
const { loadSettings } = require("./utils/settingsStore");

process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing. Check your key.env file.");
  process.exit(1);
}

try {
  loadSettings();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.on("error", (err) => {
  console.error("Discord client error:", err);
});

client.commands = new Collection();

const handlersPath = path.join(__dirname, "handlers");
fs.readdirSync(handlersPath).forEach((file) => {
  require(path.join(handlersPath, file))(client);
});

startWebServer(client);

client.login(token);
