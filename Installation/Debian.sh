#!/bin/bash

###############################################
# Verify Bot - Automated Installation (Debian/Ubuntu)
# Usage: bash install.sh
###############################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() { echo -e "${BLUE}===== $1 =====${NC}\n"; }
print_success() { echo -e "${GREEN}[OK] $1${NC}"; }
print_error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
print_warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

if [[ $EUID -eq 0 ]]; then
  print_error "Do not run as root! Use a regular user with sudo."
fi

print_header "Verify Bot - Installation on Debian/Ubuntu"

# 1. System update
print_header "1. System update"
sudo apt update
sudo apt upgrade -y
print_success "System up to date"

# 2. Check Debian/Ubuntu
print_header "2. Checking the OS"
if [ ! -f /etc/os-release ]; then
  print_error "This script only works on Debian/Ubuntu"
fi
. /etc/os-release
print_success "System: $PRETTY_NAME"

# 3. Install Node.js 20
print_header "3. Installing Node.js 20 LTS"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  print_success "Node.js installed"
else
  NODE_VERSION=$(node -v)
  print_success "Node.js already installed: $NODE_VERSION"
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  print_error "Node.js 18+ is required, found: $(node -v)"
fi

# 4. System dependencies
print_header "4. Installing system dependencies"
sudo apt install -y git curl wget nano

# 5. Nginx
print_header "5. Installing Nginx"
if ! command -v nginx &> /dev/null; then
  sudo apt install -y nginx
  print_success "Nginx installed"
else
  print_success "Nginx already installed"
fi

# 6. Certbot
print_header "6. Installing Certbot (Let's Encrypt)"
if ! command -v certbot &> /dev/null; then
  sudo apt install -y certbot python3-certbot-nginx
  print_success "Certbot installed"
else
  print_success "Certbot already installed"
fi

# 7. Bot directory
print_header "7. Creating the bot directory"
BOT_DIR="${HOME}/verify-bot"

if [ -d "$BOT_DIR" ]; then
  print_warning "$BOT_DIR already exists"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Installation cancelled"
  fi
else
  mkdir -p "$BOT_DIR"
  print_success "Directory created: $BOT_DIR"
fi

# 8. Copy project files
print_header "8. Copying project files"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$SCRIPT_DIR" != "$BOT_DIR" ]; then
  cp -r "$SCRIPT_DIR"/. "$BOT_DIR"/ 2>/dev/null || true
  print_success "Files copied to $BOT_DIR"
fi
cd "$BOT_DIR"

# 9. Create key.env
print_header "9. Creating key.env"
if [ ! -f "$BOT_DIR/key.env" ]; then
  cp "$BOT_DIR/key.env.example" "$BOT_DIR/key.env"
  chmod 600 "$BOT_DIR/key.env"
  print_success "key.env created from key.env.example (EDIT IT NOW)"
  print_warning "Edit $BOT_DIR/key.env with your real tokens and secrets!"
else
  print_success "key.env already exists"
fi

# 10. npm install
print_header "10. Installing npm dependencies"
npm install
print_success "npm dependencies installed"

# 11. Create folders
print_header "11. Creating data folders"
mkdir -p src/commands src/events src/handlers src/web src/utils
mkdir -p Database Temp Logs
chmod 700 key.env
print_success "Folders created"

# 12. systemd service
print_header "12. Configuring the systemd service"
read -p "Enter your Linux username: " USERNAME

if [ -z "$USERNAME" ]; then
  print_error "Username is required"
fi

sudo tee /etc/systemd/system/verify-bot.service > /dev/null << EOF
[Unit]
Description=Discord Verification Bot
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=$USERNAME
WorkingDirectory=$BOT_DIR
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"
EnvironmentFile=$BOT_DIR/key.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
print_success "systemd service created"

# 13. Nginx config
print_header "13. Configuring Nginx"
read -p "Enter your domain (e.g. verify.example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
  DOMAIN="verify.yourdomain.com"
  print_warning "Using default domain: $DOMAIN"
fi

sudo tee /etc/nginx/sites-available/verify-bot > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$server_name\$request_uri;
    }

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/verify-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
print_success "Nginx configured"

# 14. SSL certificate
print_header "14. Let's Encrypt SSL certificate"
read -p "Get a certificate now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  sudo certbot certonly --nginx -d "$DOMAIN"
  sudo systemctl restart nginx
  print_success "SSL certificate obtained"
fi

# 15. Firewall
print_header "15. Firewall configuration (UFW)"
read -p "Configure UFW now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  print_success "Firewall configured"
fi

# 16. Summary
print_header "Installation Complete!"

echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "1. ${BLUE}Edit your secrets:${NC}"
echo "   nano $BOT_DIR/key.env"
echo ""
echo "2. ${BLUE}Check your files:${NC}"
echo "   ls -la $BOT_DIR/"
echo ""
echo "3. ${BLUE}Enable and start the service:${NC}"
echo "   sudo systemctl enable verify-bot"
echo "   sudo systemctl start verify-bot"
echo ""
echo "4. ${BLUE}Check status:${NC}"
echo "   sudo systemctl status verify-bot"
echo ""
echo "5. ${BLUE}View logs:${NC}"
echo "   sudo journalctl -u verify-bot -f"
echo ""
echo -e "${RED}IMPORTANT:${NC}"
echo "  - Edit $BOT_DIR/key.env with your real tokens!"
echo "  - Configure your domain in settings.json"
echo "  - NEVER commit key.env to Git"
echo ""
echo -e "${GREEN}Documentation: $BOT_DIR/SECURITY.md${NC}"
