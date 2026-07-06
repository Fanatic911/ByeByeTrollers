const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { loadSettings } = require("../utils/settingsStore");

module.exports = {
  name: "sendpanel",
  async execute(message, args, client) {
    const settings = loadSettings();

    const linkParts = [];
    if (settings.Privacy_Policy_Link) linkParts.push(`[Privacy Policy](${settings.Privacy_Policy_Link})`);
    if (settings.Terms_Of_Service_Link) linkParts.push(`[Terms of Service](${settings.Terms_Of_Service_Link})`);
    const legalLine = linkParts.length > 0 ? `\n\n${linkParts.join(" • ")}` : "";

    const embed = new EmbedBuilder()
      .setTitle("Security Verification")
      .setDescription(
        `We need to verify your account to give you access to the server.\n\nThis verification will record your IP address on your Discord account.${legalLine}`
      )
      .setColor(0x2b2d31);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("verify_button").setLabel("Verify").setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  },
};
