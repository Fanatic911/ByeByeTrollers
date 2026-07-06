# Installation & Setup Guide

## Requirements

- Node.js v18 or higher
- npm v9 or higher
- A Discord bot token
- A Google reCAPTCHA v2 account (site key + secret key)
- A domain pointed to your server (e.g. verify.misterfanatic.xyz)
- A reverse proxy such as Nginx or Caddy (recommended for HTTPS)

---

## Step 1 — Install Node.js

### Ubuntu / Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Windows
Download the installer from https://nodejs.org and run it.

### Verify installation
```bash
node -v
npm -v
```

---

## Step 2 — Install dependencies

Navigate to the project folder and run:

```bash
npm install
```

---

## Step 3 — Configure the environment

Edit the `key.env` file:

```
DISCORD_TOKEN=your_discord_bot_token_here

# Captcha providers - only fill in the one selected via "capchat_type" in settings.json
RECAPTCHA_PUBLIC=your_recaptcha_site_key_here
RECAPTCHA_PRIVATE=your_recaptcha_secret_key_here
HCAPTCHA_SITE=your_hcaptcha_site_key_here
HCAPTCHA_SECRET=your_hcaptcha_secret_key_here
TURNSTILE_SITE=your_turnstile_site_key_here
TURNSTILE_SECRET=your_turnstile_secret_key_here
```

- Get your bot token at https://discord.com/developers/applications
- Get reCAPTCHA keys at https://www.google.com/recaptcha/admin
- Get hCaptcha keys at https://dashboard.hcaptcha.com
- Get Turnstile keys at https://dash.cloudflare.com (Turnstile section)
- If `capchat_type` is set to `local`, no third-party keys are required

---

## Step 4 — Configure settings

Edit `settings.json`:

- Set `NotVerified_Role` to the ID of the role given to new unverified members
- Set `Verified_Role` to the ID of the role given after successful verification
- Set `admin_role` to the role IDs that should have full administrative access, including `+settings`
- Set `moderator_role` to the role IDs that should have access to `+verify`, `+docs`, and `+SendPanel`
- Set `verification_code_expiry` to the number of milliseconds a verification link stays valid (default 1800000, i.e. 30 minutes)
- Set `capchat_type` to exactly one of: `local`, `hcaptcha`, `turnstile`, `recaptcha`
- Set `public_domain` to the domain of your Cloudflare tunnel (e.g. `verify.example.com`). If that domain cannot be reached, links automatically fall back to `http://localhost:<port>`
- Set `Success_Verify_Webhook`, `Error_Verify_Webhook`, and `Logs_Verify_Webbhook` to your Discord webhook URLs
- Set `Discord_Server_Link` to your server invite link
- Set `Discord_Channel_Link` to the channel link for post-verification redirect

`settings.json` is validated on every startup and on every save from the web panel. If a value is missing or of the wrong type, the bot prints a clear list of errors and refuses to start (or the panel rejects the save) rather than running with a broken configuration.

---

## Step 5 — Configure sanctions

Edit `sanction.json` to choose the action applied when a check fails.

Valid values are `"Kicked"` or `"Banned"`.

---

## Step 6 — Configure blocked countries

Edit `CountryBlocked.json` and add or remove ISO 3166-1 alpha-2 country codes
in the `"blocked"` array.

---

## Step 7 — Enable required bot permissions

In the Discord Developer Portal, under your bot's settings, enable:

- Server Members Intent
- Message Content Intent

In your Discord server, the bot must have:

- Manage Roles
- Kick Members
- Ban Members
- Send Messages
- Read Messages

---

## Step 8 — Run the bot

```bash
npm start
```

The web server starts on port **3001**. The bot connects to Discord automatically.

---

## Step 9 — Reverse proxy (recommended)

To serve the verification page over HTTPS on your domain, configure a reverse proxy.

### Nginx example

```nginx
server {
    listen 80;
    server_name verify.misterfanatic.xyz;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Use Certbot to add HTTPS:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d verify.misterfanatic.xyz
```

---

## Step 10 — Send the verification panel

In your Discord server, run the following command in the desired channel:

```
+SendPanel
```

This posts the verification embed with the Verify button.

---

## File reference

| File | Purpose |
|---|---|
| `.env` | Bot token and reCAPTCHA keys |
| `settings.json` | All bot and server configuration |
| `sanction.json` | Actions applied on failed checks |
| `CountryBlocked.json` | Blocked country codes |
| `Temp/` | Temporary verification code files (auto-managed) |
| `Database/IP.json` | Verified user IP records |
