# Security Notes

## Hardening Included

- **Secrets isolation** — all tokens/keys live in `key.env` (gitignored),
  never in `settings.json` or other versioned files.
- **Role-based command access** — `+verify`, `+docs`, and `+SendPanel`
  require an Admin or Moderator role (`admin_role` / `moderator_role` in
  `settings.json`); `+settings` requires an Admin role.
- **Verification link expiry** — each verification link is valid for
  `verification_code_expiry` milliseconds (default 1800000, i.e. 30 minutes)
  before it must be regenerated.
- **IP linkage checks** — each verified IP is tied to a single Discord
  account, with configurable handling of VPNs, proxies, alternate accounts,
  and blocked countries.
- **HTTPS in production** — `Installation/Debian.sh` configures Nginx +
  Let's Encrypt as a reverse proxy in front of the Node process, with UFW
  firewall rules limited to ports 22/80/443.
- **Timeouts on outbound calls** — captcha verification and IP-reputation
  lookups both use bounded timeouts so a slow third party cannot hang a
  request.
- **Validated configuration** — `settings.json` is checked against a strict
  schema on every startup and on every save from the web panel; invalid
  values (wrong type, unknown `capchat_type`, etc.) are rejected with a
  clear error instead of silently corrupting behavior.
- **Resilient interaction handling** — Discord interactions are deferred
  immediately and wrapped in error handling, and the process installs
  `unhandledRejection` / `uncaughtException` handlers so a single failed
  API call cannot crash the bot.
- **Automatic link fallback** — verification and settings-panel links use
  the configured Cloudflare tunnel domain when reachable, and fall back to
  `http://localhost:<port>` automatically otherwise.
- **Minimal Discord permissions** — only request the intents/permissions the
  bot actually needs (see `src/index.js`'s `GatewayIntentBits` list).

## Things You Must Do Yourself

- [ ] Rotate any secret that has ever been pasted into a chat, ticket, or
      shared document (Discord bot token, captcha secret keys, webhook URLs).
      A leaked Discord token can be rotated in the Discord Developer Portal;
      webhooks can be deleted and recreated from the channel's Integrations
      settings.
- [ ] Confirm `key.env` is never committed: `git status` should never show it.
- [ ] Use HTTPS in production (the Debian install script sets this up via
      Nginx + Certbot).
- [ ] Configure a firewall (UFW on Debian/Ubuntu) to only expose ports
      22/80/443.
- [ ] Run `npm audit` periodically and apply `npm audit fix`.
- [ ] Back up the `Database/` folder regularly — it stores verified IPs.
- [ ] Set Discord bot permissions to the minimum required in the
      Developer Portal (don't grant Administrator).

## Known Limitations

- The IP reputation check (`ipqualityscore.com` free tier) is rate-limited
  and not guaranteed to be accurate — consider a paid plan for production.
- If the IP/VPN check fails (timeout, API down), the bot **fails open**
  (allows the user through) rather than blocking everyone. This is a
  deliberate availability/security trade-off — change it in
  `src/web/server.js` (`checkIpReputation`) if you'd rather fail closed.
