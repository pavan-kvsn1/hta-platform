#!/bin/sh
set -eu

: "${CLOUD_SQL_INSTANCE:?CLOUD_SQL_INSTANCE is required}"

proxy_port="${CLOUD_SQL_PROXY_PORT:-5432}"

cloud-sql-proxy \
  --private-ip \
  --address 127.0.0.1 \
  --port "${proxy_port}" \
  "${CLOUD_SQL_INSTANCE}" &
proxy_pid=$!

cleanup() {
  kill "${proxy_pid}" 2>/dev/null || true
  wait "${proxy_pid}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until nc -z 127.0.0.1 "${proxy_port}"; do
  if ! kill -0 "${proxy_pid}" 2>/dev/null; then
    echo "Cloud SQL Auth Proxy exited before accepting connections" >&2
    wait "${proxy_pid}"
    exit 1
  fi

  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 30 ]; then
    echo "Timed out waiting for Cloud SQL Auth Proxy" >&2
    exit 1
  fi
  sleep 1
done

exec ./packages/database/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
