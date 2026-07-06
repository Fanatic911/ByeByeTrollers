# Manual Installation Guide — Debian/Ubuntu

This covers the same steps `install.sh` automates, in case you want to run
them by hand or understand what the script does.

## Requirements

```bash
cat /etc/os-release
```
Debian 10+ or Ubuntu 20.04+.

## 1. Update the system

```bash
sudo apt update
sudo apt upgrade -y
```

## 2. Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x.x
npm -v    # v10.x.x
```

If that fails, use the manual keyring method:
```bash
sudo apt install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
```

## 3. Get the project onto the server

```bash
mkdir -p ~/verify-bot
cd ~/verify-bot
# copy the project files here (scp, git clone, unzip, etc.)
```

## 4. Configure secrets

```bash
cp key.env.example key.env
nano key.env
chmod 600 key.env
```

Fill in `DISCORD_TOKEN`, `RECAPTCHA_SITE_KEY`/`RECAPTCHA_SECRET_KEY`, the
three webhook URLs, `JWT_SECRET`, and a 64-hex-character `ENCRYPTION_KEY`
(generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

## 5. Install dependencies

```bash
npm install
npm audit fix   # optional, if vulnerabilities are reported
```

## 6. Create data folders

```bash
mkdir -p src/commands src/events src/handlers src/web src/utils
mkdir -p Database Temp Logs
```

## 7. Nginx reverse proxy + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/verify-bot
```

```nginx
server {
    listen 80;
    server_name verify.yourdomain.com;

    location / {
        return 301 https://$server_name$request_uri;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

server {
    listen 443 ssl http2;
    server_name verify.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/verify.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/verify.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/verify-bot /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d verify.yourdomain.com
sudo systemctl restart nginx
```

## 8. systemd service (auto-start, auto-restart)

```bash
sudo nano /etc/systemd/system/verify-bot.service
```

```ini
[Unit]
Description=Discord Verification Bot
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=your_username
WorkingDirectory=/home/your_username/verify-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"
EnvironmentFile=/home/your_username/verify-bot/key.env

[Install]
WantedBy=multi-user.target
```

Replace `your_username` with your actual Linux username, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable verify-bot
sudo systemctl start verify-bot
sudo systemctl status verify-bot
```

## 9. Logs

```bash
sudo journalctl -u verify-bot -f      # live
sudo journalctl -u verify-bot -n 50   # last 50 lines
```

## 10. Firewall (optional but recommended)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Troubleshooting

- **"Cannot find module 'dotenv'"** → `npm install`
- **Port 3001 in use** → `sudo lsof -i :3001` then `sudo kill -9 PID`
- **Webhook errors** → confirm the URL starts with
  `https://discord.com/api/webhooks/`
- **Certificate expired** → `sudo certbot renew`

## Updating

```bash
cd ~/verify-bot
git pull origin main      # if using git
npm install
sudo systemctl restart verify-bot
```
