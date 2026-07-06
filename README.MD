# Verify Bot

Advanced Discord verification bot with a web admin panel, anti-bot protection, anti-VPN/proxy detection, geo-blocking, and automatic sanction system.

---

## Features

- **Verification system** via a unique, time-limited web link (`temp_de_vie_du_lien`)
- **Multi-provider CAPTCHA**: Google reCAPTCHA v2, Cloudflare Turnstile, hCaptcha — with automatic fallback to a local CAPTCHA if keys are missing or invalid
- **Advanced detection**:
  - Alternate accounts (multi-accounting)
  - IP addresses already linked to another account
  - VPN / Proxy
  - Automated bots
- **Configurable automatic sanctions** (`Kicked` or `Banned`) for each detection type
- **Geo-blocking** by ISO 3166-1 alpha-2 country code (`CountryBlocked.json`)
- **Web admin panel** (`/settings`, `/dashboard`):
  - User session management (disconnect, configurable expiration)
  - Self-service account deletion
  - Forced session reset by an admin
- **Discord webhooks** for logs, verification successes, and verification failures
- **Configurable roles**: unverified role, verified role, admin/moderator roles

## Requirements

- [Node.js](https://nodejs.org/) 18 or higher
- A Discord bot (token, required intents enabled)
- (Optional) CAPTCHA keys: reCAPTCHA, Turnstile, or hCaptcha

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/verify-bot.git
cd verify-bot

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp key_env.example key.env
# Then edit key.env with your real values

# 4. Start the bot
npm start
```

## Configuration

### `key.env`
Contains **only** secrets (never committed, see `.gitignore`):

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Discord bot token |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA keys |
| `WEBHOOK_SUCCESS_VERIFY` / `WEBHOOK_ERROR_VERIFY` / `WEBHOOK_LOGS` | Discord webhooks |
| `JWT_SECRET` | Random string, 32+ characters |
| `ENCRYPTION_KEY` | Exactly 64 hexadecimal characters (32 bytes) |
| `NODE_ENV`, `PORT`, `HOST`, `ALLOWED_DOMAINS` | Server settings |

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### `settings.json`
General non-sensitive configuration: command prefix, enabling verification/CAPTCHA/logs, roles, Discord links, session duration, max verification attempts, log retention, etc. See the `_readme` comments in the file for details on each field.

### `sanction.json`
Defines the sanction (`Kicked` or `Banned`) applied for each type of verification failure (alt detected, IP already linked, VPN/proxy, bot detected).

### `CountryBlocked.json`
List of country codes (ISO 3166-1 alpha-2) blocked from verification.

> Secrets go **only** in `key.env`. Webhooks and role IDs go in `settings.json`.

## Usage

- `+SendPanel` - send the verification panel in a channel (moderator)
- `/verify` - manually verify a member (moderator)
- `/docs` - show help (moderator)
- Web panel `/settings` - full configuration (admin only)
- Web panel `/dashboard` - manage your own account (user)

## Security

See [`SECURITY.md`](./SECURITY.md) for the security policy and vulnerability reporting procedure.

## Changelog / Releases

See [`RELEASE.md`](./RELEASE.md) for version history.

## License

Distributed under the **Creative Commons Attribution-NonCommercial 4.0 International** license - see [`LICENCE`](./LICENCE).

## Support

- Website: [misterfanatic.xyz](https://misterfanatic.xyz)
- Discord server: open a private ticket
