#!/bin/bash
set -ex
exec > /var/log/wireguard-startup.log 2>&1

echo "[wg-setup] Starting WireGuard gateway setup..."

apt-get update -y
apt-get install -y wireguard wireguard-tools iptables

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
CRONFILE

systemctl restart cron

echo "[wg-setup] Setup complete."
echo "[wg-setup] Public key: $(cat /etc/wireguard/public.key)"
wg show
