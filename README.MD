## Syntra v1.2.0 — Security & Quality-of-Life Update

**Released:** July 4, 2026

This update focuses primarily on security. Several vulnerabilities present in v1.0.0 have been identified and resolved. Details are intentionally kept private to protect existing installations that have not yet updated. **We strongly recommend updating immediately.**

---

### Security

- Fixed several security vulnerabilities identified since v1.0.0 (details withheld for safety)
- Passwords are now hashed using scrypt before being stored — plain text passwords no longer exist in the database. Existing accounts are migrated automatically on first login
- Replaced the old account-ID cookie with a proper session token system — the token is random, stored in an `httpOnly` cookie, and expires automatically
- Removed the internal storage path from public profiles and the user API — it was leaking server-side folder structure to anyone who called the endpoint

### Session Management

- Sessions now expire automatically after a configurable duration (default: 1 hour, adjustable by admins in the admin panel under **Controls > Session Duration**)
- Users can now disconnect all of their own active sessions from their profile settings page (`/dashboard`)
- Users can now permanently delete their own account from the same page
- Admins can force-reset any user's sessions from the **Users** tab, from a profile page's Admin Actions section, or from the `...` menu on any of their posts or comments

### CAPTCHA

- Added support for **Cloudflare Turnstile**, **hCaptcha**, and **Google reCAPTCHA v2** as alternative CAPTCHA providers
- If keys are missing or invalid, Syntra automatically falls back to the built-in local CAPTCHA — no downtime or manual intervention required
- The active provider can be switched at any time from the admin panel under **Controls > Captcha Provider**

### Admin Panel

- The admin panel now remembers which tab you were on after performing an action, instead of always resetting to the first tab

### Other

- General performance improvements and internal code cleanup

---

### Upgrading from v1.0.0

1. Pull or download the latest files
2. Run `npm install` to update dependencies
3. Restart the server with `npm start`

No manual database migration is required. Password hashing is applied automatically when users log in for the first time after the update.

---

**Full changelog:** [updates.json](./updates.json)