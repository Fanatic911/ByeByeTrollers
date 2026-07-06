# Security Policy

## Supported Versions

> Always use the latest version. Older versions are no longer maintained, do not receive security patches, and are not recommended under any circumstances.

| Version | Supported | Status |
|---|---|---|
| Latest (main branch) | Yes | Actively maintained - use this |
| Any older version | No | Unsupported - do not use |

### Important Notice

**Only the latest version of Verify Bot is supported.**

If you are running an older version, you are exposed to known and unknown security vulnerabilities that will **not** be patched. We strongly urge all users to update immediately. Older versions of this project:

- Do **not** receive any security updates
- Do **not** receive any bug fixes
- Are **not** recommended for any use, including development or testing environments
- May contain vulnerabilities that could compromise your Discord server, your users' data, or the machine hosting the bot

There are no exceptions. **No older version is considered safe to run.**

---

## Configuration Best Practices

- Never commit `key.env` (already excluded via `.gitignore`)
- Generate a unique, random `ENCRYPTION_KEY` (64 hexadecimal characters) for each installation
- Generate a random `JWT_SECRET` of at least 32 characters, unique to each installation
- Restrict `ALLOWED_DOMAINS` to the strict minimum required
- Keep `verification_enabled`, `captcha_enabled`, and `enable_bot_detection` enabled in production
- Limit `admin_role` / `moderator_role` to trusted individuals only
- Keep webhooks (`Success_Verify_Webhook`, `Error_Verify_Webhook`, `Logs`) in `settings.json`, never in a public repository

---

## Reporting a Vulnerability

If you discover a security vulnerability in Verify Bot, please report it **privately** and **responsibly**. Do not open a public GitHub issue, as this could expose the vulnerability to malicious actors before it is fixed.

### How to report

Contact us directly through one of the following channels:

- Website: [misterfanatic.xyz](https://misterfanatic.xyz)
- Discord: join our server and open a private ticket

Please include as much detail as possible in your report:

- A clear description of the vulnerability
- The version of the bot you are running
- Steps to reproduce the issue
- Any relevant logs, screenshots, or proof-of-concept code
- The potential impact you believe this vulnerability could have

### What to expect

| Timeframe | What happens |
|---|---|
| Within 48 hours | Acknowledgement of your report |
| Within 7 days | Initial assessment and severity classification |
| Within 30 days | Fix released (for confirmed critical/high vulnerabilities) |

- If the vulnerability is **confirmed**, a fix will be developed and released as a priority. You will be notified when the patch is live.
- If the vulnerability is **declined** (not reproducible, out of scope, or not considered a security risk), you will receive a clear explanation of why.
- We ask that you **do not disclose** the vulnerability publicly until a fix has been released.

---

## Our Commitment

We take the security of Verify Bot and the safety of your Discord community seriously. We are committed to responding to all legitimate security reports promptly and transparently.

Thank you for helping keep this project safe.
