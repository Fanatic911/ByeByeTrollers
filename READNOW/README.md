# Multiversal Verification Bot

## Setup

1. Fill in `key.env`:
   - `DISCORD_TOKEN` — your Discord bot token
   - `RECAPTCHA_PUBLIC` / `RECAPTCHA_PRIVATE` — required if `capchat_type` is `recaptcha`
   - `HCAPTCHA_SITE` / `HCAPTCHA_SECRET` — required if `capchat_type` is `hcaptcha`
   - `TURNSTILE_SITE` / `TURNSTILE_SECRET` — required if `capchat_type` is `turnstile`

2. Fill in `settings.json`:
   - `NotVerified_Role` — role ID for unverified users
   - `Verified_Role` — role ID for verified users
   - `admin_role` — role IDs granted full administrative access, including `+settings`
   - `moderator_role` — role IDs granted access to `+verify`, `+docs`, and `+SendPanel`
   - `verification_code_expiry` — verification link lifetime, in milliseconds (default 1800000, i.e. 30 minutes)
   - `capchat_type` — captcha provider, must be exactly one of `local`, `hcaptcha`, `turnstile`, `recaptcha`
   - `public_domain` — the domain of your Cloudflare tunnel; falls back to `http://localhost:<port>` if unreachable
   - `Success_Verify_Webhook` — Discord webhook URL for success logs
   - `Error_Verify_Webhook` — Discord webhook URL for error logs
   - `Logs_Verify_Webbhook` — Discord webhook URL for command logs

`settings.json` is validated at startup and on every save from the web panel; invalid or missing values are rejected with a clear error instead of failing silently.

3. Install dependencies:
   ```
   npm install
   ```

4. Start the bot:
   ```
   npm start
   ```

## Commands

All commands use the `+` prefix (configurable via `prefix` in `settings.json`).

| Command | Permission | Description |
|---|---|---|
| `+SendPanel` | Admin or Moderator role | Sends the verification panel |
| `+verify @user <reason>` | Admin or Moderator role | Manually verifies a user |
| `+docs` | Admin or Moderator role | Shows all commands |
| `+settings` | Admin role | Sends the web settings panel link via DM |

## Web Routes

| Route | Description |
|---|---|
| `GET /` | Landing page explaining the service (no verification action here) |
| `GET /health` | Health check, returns `{ "status": "ok" }`, used for Cloudflare tunnel detection |
| `GET /api/verify/:code` | Displays the verification page (rejects expired links) |
| `POST /api/verify/:code` | Processes the verification (rejects expired links) |
| `GET /settings` | Web settings panel (token required in hash) |

## Folder Structure

```
verify-bot/
├── api/          — reserved for future API extensions
├── Temp/         — temporary verification code files
├── Database/     — stores IP.json with verified user IPs
├── src/
│   ├── commands/ — all bot commands
│   ├── events/   — Discord event listeners
│   ├── handlers/ — command/event loaders
│   └── web/      — Express web server
├── .env
├── settings.json
└── package.json
```
