#!/bin/bash
set -e

echo "========================================="
echo "  RandomChat - VPS Deployment Script"
echo "========================================="

# --- Configuration ---
APP_DIR="/var/www/video-chat"
REPO_URL="https://github.com/synchromes/video-chat.git"
PORT=3000

# --- Step 1: System dependencies ---
echo ""
echo "[1/6] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  -> Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "  -> Node.js $(node -v) already installed."
fi

# --- Step 2: Install PM2 globally ---
echo ""
echo "[2/6] Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "  -> Installing PM2..."
    sudo npm install -g pm2
else
    echo "  -> PM2 already installed."
fi

# --- Step 3: Clone or pull repo ---
echo ""
echo "[3/6] Setting up application..."
if [ -d "$APP_DIR" ]; then
    echo "  -> Pulling latest changes..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "  -> Cloning repository..."
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# --- Step 4: Install dependencies ---
echo ""
echo "[4/6] Installing dependencies..."
echo "  -> Server dependencies..."
cd "$APP_DIR/server"
npm install --production

echo "  -> Client dependencies..."
cd "$APP_DIR/client"
npm install

# --- Step 5: Build React client ---
echo ""
echo "[5/6] Building React client..."
cd "$APP_DIR/client"
npm run build

# --- Step 6: Start/Restart with PM2 ---
echo ""
echo "[6/6] Starting server with PM2..."
cd "$APP_DIR/server"

# Stop existing instance if running
pm2 delete randomchat 2>/dev/null || true

# Start with PM2
PORT=$PORT pm2 start index.js --name "randomchat" --env production

# Save PM2 process list (auto-restart on reboot)
pm2 save
pm2 startup 2>/dev/null || true

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "  App running on port $PORT"
echo ""
echo "  Useful commands:"
echo "    pm2 logs randomchat    - View logs"
echo "    pm2 restart randomchat - Restart app"
echo "    pm2 status             - Check status"
echo ""
echo "  To expose publicly, set up Nginx:"
echo "    proxy_pass http://127.0.0.1:$PORT"
echo "========================================="
