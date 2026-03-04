#!/bin/bash
# ==========================================
# LiveKit Server Setup for VPS
# Run as root or with sudo
# ==========================================
set -e

echo "========================================"
echo "   LiveKit Server Setup"
echo "========================================"

# 1. Download LiveKit Server
echo "[1/4] Downloading LiveKit Server..."
LIVEKIT_VERSION="v1.7.2"
ARCH=$(dpkg --print-architecture)
if [ "$ARCH" = "amd64" ]; then
    LIVEKIT_ARCH="amd64"
elif [ "$ARCH" = "arm64" ]; then
    LIVEKIT_ARCH="arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

curl -sSL "https://github.com/livekit/livekit/releases/download/${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION#v}_linux_${LIVEKIT_ARCH}.tar.gz" | tar xz -C /usr/local/bin/ livekit-server
chmod +x /usr/local/bin/livekit-server

echo "LiveKit Server installed: $(livekit-server --version)"

# 2. Generate keys
echo "[2/4] Generating API keys..."
API_KEY="APIkey$(openssl rand -hex 8)"
API_SECRET="$(openssl rand -hex 32)"

echo ""
echo "========================================="
echo "  YOUR LIVEKIT CREDENTIALS (SAVE THESE!)"
echo "========================================="
echo "  LIVEKIT_API_KEY:    $API_KEY"
echo "  LIVEKIT_API_SECRET: $API_SECRET"
echo "========================================="
echo ""

# 3. Create config file
echo "[3/4] Creating LiveKit config..."
DOMAIN="${LIVEKIT_DOMAIN:-vc.tvrikalbar.id}"

cat > /etc/livekit.yaml << EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  ${API_KEY}: ${API_SECRET}
logging:
  level: info
EOF

echo "Config written to /etc/livekit.yaml"

# 4. Create systemd service
echo "[4/4] Creating systemd service..."
cat > /etc/systemd/system/livekit.service << EOF
[Unit]
Description=LiveKit Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/livekit-server --config /etc/livekit.yaml
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable livekit
systemctl start livekit

echo ""
echo "========================================"
echo "  LiveKit Server is running!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Update your Nginx config to proxy WebSocket to LiveKit:"
echo ""
echo "   # Add this server block for LiveKit WebSocket"
echo "   server {"
echo "       listen 443 ssl;"
echo "       server_name ${DOMAIN};"
echo "       location /rtc {"
echo "           proxy_pass http://127.0.0.1:7880;"
echo "           proxy_http_version 1.1;"
echo "           proxy_set_header Upgrade \$http_upgrade;"
echo "           proxy_set_header Connection \"upgrade\";"
echo "           proxy_set_header Host \$host;"
echo "       }"
echo "   }"
echo ""
echo "2. Set environment variables in your app:"
echo "   export LIVEKIT_API_KEY=\"${API_KEY}\""
echo "   export LIVEKIT_API_SECRET=\"${API_SECRET}\""
echo "   export LIVEKIT_URL=\"wss://${DOMAIN}/rtc\""
echo ""
echo "3. Restart your app:"
echo "   pm2 restart randomchat"
echo ""
echo "4. Verify LiveKit is running:"
echo "   curl http://localhost:7880"
echo "========================================"
