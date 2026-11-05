#!/bin/bash
# One-time setup: runs the admin panel under pm2 and registers pm2 with systemd
# so the panel starts automatically on every EC2 boot.
# Usage (on EC2, as ec2-user): chmod +x setup-admin-panel.sh && ./setup-admin-panel.sh
set -euo pipefail

APP_USER="ec2-user"
APP_HOME="/home/$APP_USER"
APP_DIR="$APP_HOME/admin-panel"
APP_NAME="admin-panel"
APP_PORT=4001

cd "$APP_DIR"

npm install --omit=dev

pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 flush "$APP_NAME" || true

# --cwd matters: dotenv loads .env from the working directory.
# PORT set here wins over .env (dotenv does not override existing env vars).
PORT="$APP_PORT" pm2 start src/server.js --name "$APP_NAME" --cwd "$APP_DIR" --time --restart-delay 5000

pm2 install pm2-logrotate >/dev/null 2>&1 || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5

pm2 save
sudo env PATH="$PATH:$(dirname "$(which node)")" "$(which pm2)" startup systemd -u "$APP_USER" --hp "$APP_HOME"

echo "Done. Admin panel on port $APP_PORT. Logs: pm2 logs $APP_NAME"
