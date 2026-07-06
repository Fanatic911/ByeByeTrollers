const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { resolveBaseUrl } = require("../utils/publicUrl");
const { loadSettings } = require("../utils/settingsStore");
const { isOnCooldown } = require("../utils/rateLimiter");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (!interaction.isButton() || interaction.customId !== "verify_button") return;

    try {
      const settings = loadSettings();

      if (!settings.verification_enabled) {
        return await interaction.reply({ content: "Verification is currently disabled.", ephemeral: true });
      }

      if (settings.Verified_Role && interaction.member?.roles?.cache?.has(settings.Verified_Role)) {
        return await interaction.reply({ content: "You are already verified.", ephemeral: true });
      }

      const cooldownMs = settings.rate_limit?.button_cooldown_ms ?? 15000;
      if (isOnCooldown(`button:${interaction.user.id}`, cooldownMs)) {
        return await interaction.reply({
          content: "You are clicking too fast. Please wait a few seconds and try again.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const code = uuidv4();
      const tempFile = path.join(__dirname, "../../Temp", `${interaction.user.id}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({ userId: interaction.user.id, code, createdAt: Date.now() }, null, 2));

      const linkLifetimeMs = parseInt(settings.verification_code_expiry, 10) || 30 * 60 * 1000;
      const linkLifetimeMinutes = Math.round(linkLifetimeMs / 60000);
      const baseUrl = await resolveBaseUrl(settings);
      const link = `${baseUrl}/api/verify/${code}`;

      try {
        await interaction.user.send(
          `Here is your verification link:\n\n${link}\n\nThis link expires in ${linkLifetimeMinutes} minutes.`
        );
        await interaction.editReply({ content: "Your verification link has been sent via direct message." });
      } catch {
        await interaction.editReply({
          content: "Your direct messages are disabled. Check the FAQ channel to learn how to re-enable them.",
        });
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "An unexpected error occurred. Please try again later." });
        } else {
          await interaction.reply({ content: "An unexpected error occurred. Please try again later.", ephemeral: true });
        }
      } catch {}
    }
  },
};
