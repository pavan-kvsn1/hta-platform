#!/bin/bash
set -ex
exec > /var/log/wireguard-startup.log 2>&1

echo "[wg-setup] Starting WireGuard gateway setup..."

apt-get update -y
apt-get install -y wireguard wireguard-tools iptables nginx jq

# Enable IP forwarding (idempotent)
grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -w net.ipv4.ip_forward=1

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

# Server key management
if gsutil -q stat "gs://${bucket_name}/server-private.key" 2>/dev/null; then
  echo "[wg-setup] Restoring existing server private key from GCS..."
  gsutil cp "gs://${bucket_name}/server-private.key" /etc/wireguard/private.key
else
  echo "[wg-setup] Generating new server key pair..."
  wg genkey > /etc/wireguard/private.key
  gsutil cp /etc/wireguard/private.key "gs://${bucket_name}/server-private.key"
fi

chmod 600 /etc/wireguard/private.key
wg pubkey < /etc/wireguard/private.key > /etc/wireguard/public.key
chmod 644 /etc/wireguard/public.key
gsutil cp /etc/wireguard/public.key "gs://${bucket_name}/server-public.key"
echo "[wg-setup] Server public key: $(cat /etc/wireguard/public.key)"

# WireGuard interface config
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/private.key)
Address = ${server_ip}/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ens4 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ens4 -j MASQUERADE
EOF

chmod 600 /etc/wireguard/wg0.conf

# Start WireGuard
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Private HTTP proxy for desktop clients. The desktop app talks to
# http://${server_ip}/api/* through WireGuard; nginx forwards that to the
# current GKE node private IPs on the hta-api-vpn NodePort.
cat > /usr/local/bin/update-api-proxy.sh << 'PROXYSCRIPT'
#!/bin/bash
set -euo pipefail

PROJECT_ID="${project_id}"
GKE_NODES_SA="${gke_nodes_sa_email}"
SERVER_IP="${server_ip}"
API_NODE_PORT="${api_node_port}"
WEB_NODE_PORT="${web_node_port}"
CONF_PATH="/etc/nginx/sites-available/hta-vpn-proxy"
TMP_CONF="/tmp/hta-vpn-proxy.conf"

TOKEN="$(curl -fsS -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
  | jq -r '.access_token')"

NODE_IPS="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://compute.googleapis.com/compute/v1/projects/$PROJECT_ID/aggregated/instances" \
  | jq -r --arg sa "$GKE_NODES_SA" '.items[].instances[]? | select(.status == "RUNNING") | select(any(.serviceAccounts[]?; .email == $sa)) | .networkInterfaces[0].networkIP' \
  | sort -u)"

if [ -z "$NODE_IPS" ]; then
  echo "[vpn-proxy] No running GKE node IPs found for $GKE_NODES_SA"
  exit 0
fi

{
  echo "upstream hta_api_vpn {"
  for ip in $NODE_IPS; do
    echo "  server $ip:$API_NODE_PORT max_fails=3 fail_timeout=10s;"
  done
  echo "}"
  echo
  echo "upstream hta_web_vpn {"
  for ip in $NODE_IPS; do
    echo "  server $ip:$WEB_NODE_PORT max_fails=3 fail_timeout=10s;"
  done
  echo "}"
  echo
  echo "server {"
  echo "  listen 80;"
  echo "  server_name _;"
  echo
  echo "  location = / { return 204; }"
  echo "  location = /health { return 204; }"
  echo
  echo "  location /api/ {"
  echo "    proxy_pass http://hta_api_vpn;"
  echo "    proxy_http_version 1.1;"
  echo "    proxy_set_header Host \$host;"
  echo "    proxy_set_header X-Real-IP \$remote_addr;"
  echo "    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "    proxy_set_header X-Forwarded-Proto http;"
  echo "    proxy_connect_timeout 5s;"
  echo "    proxy_read_timeout 60s;"
  echo "  }"
  echo
  echo "  location / {"
  echo "    proxy_pass http://hta_web_vpn;"
  echo "    proxy_http_version 1.1;"
  echo "    proxy_set_header Host \$host;"
  echo "    proxy_set_header X-Real-IP \$remote_addr;"
  echo "    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "    proxy_set_header X-Forwarded-Proto http;"
  echo "    proxy_connect_timeout 5s;"
  echo "    proxy_read_timeout 60s;"
  echo "  }"
  echo "}"
} > "$TMP_CONF"

if [ ! -f "$CONF_PATH" ] || ! cmp -s "$TMP_CONF" "$CONF_PATH"; then
  mv "$TMP_CONF" "$CONF_PATH"
  ln -sf "$CONF_PATH" /etc/nginx/sites-enabled/hta-vpn-proxy
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx || systemctl restart nginx
  echo "[vpn-proxy] Updated nginx upstreams: $(echo "$NODE_IPS" | tr '\n' ' ')"
else
  rm -f "$TMP_CONF"
fi
PROXYSCRIPT

chmod +x /usr/local/bin/update-api-proxy.sh
systemctl enable nginx
/usr/local/bin/update-api-proxy.sh || echo "[vpn-proxy] Initial proxy update failed; cron will retry"

# Peer sync script
cat > /usr/local/bin/sync-wg-peers.sh << 'SYNCSCRIPT'
#!/bin/bash
PEERS_TMP="/tmp/wg-peers-$$.conf"
gsutil cp "gs://${bucket_name}/peers.conf" "$PEERS_TMP" 2>/dev/null || exit 0
if [ -f "$PEERS_TMP" ]; then
  # Build full config: interface + peers
  cat /etc/wireguard/wg0.conf "$PEERS_TMP" > /tmp/wg-full.conf
  wg syncconf wg0 <(wg-quick strip /tmp/wg-full.conf 2>/dev/null || cat /tmp/wg-full.conf)
  rm -f "$PEERS_TMP" /tmp/wg-full.conf
fi
SYNCSCRIPT

chmod +x /usr/local/bin/sync-wg-peers.sh

# Cron: sync every 30 seconds
cat > /etc/cron.d/wireguard-sync << 'CRONFILE'
* * * * * root /usr/local/bin/sync-wg-peers.sh >> /var/log/wg-sync.log 2>&1
* * * * * root sleep 30 && /usr/local/bin/sync-wg-peers.sh >> /var/log/wg-sync.log 2>&1
* * * * * root /usr/local/bin/update-api-proxy.sh >> /var/log/vpn-proxy-sync.log 2>&1
CRONFILE

systemctl restart cron

echo "[wg-setup] Setup complete."
echo "[wg-setup] Public key: $(cat /etc/wireguard/public.key)"
wg show
