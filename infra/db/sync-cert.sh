#!/usr/bin/env bash
#
# Copies the db.hellotidy.in certificate that Caddy (whatGM's proxy) keeps
# renewed into ./tls for Postgres, and reloads Postgres when it changed.
# Runs daily from hellotidy-db-cert.timer; safe to run by hand any time.
#
set -euo pipefail
cd "$(dirname "$0")"

NAME=db.hellotidy.in
STORE=/var/lib/docker/volumes/whatgm_caddy_data/_data/caddy/certificates
PG_UID=999 # the postgres user inside the official image

crt=$(find "$STORE" -name "$NAME.crt" -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
key="${crt%.crt}.key"
[ -n "$crt" ] && [ -f "$key" ] || { echo "no certificate for $NAME under $STORE" >&2; exit 1; }

mkdir -p tls
if cmp -s "$crt" tls/server.crt && cmp -s "$key" tls/server.key; then
  echo "certificate unchanged"
  exit 0
fi

install -m 0644 -o "$PG_UID" -g "$PG_UID" "$crt" tls/server.crt
install -m 0600 -o "$PG_UID" -g "$PG_UID" "$key" tls/server.key
echo "certificate updated: $(openssl x509 -in tls/server.crt -noout -enddate)"

# Postgres re-reads its TLS files on reload; no restart, no dropped connections.
if docker ps --format '{{.Names}}' | grep -qx hellotidy-pg; then
  docker exec -u postgres hellotidy-pg psql -qAtc 'select pg_reload_conf()' >/dev/null
  echo "postgres reloaded"
fi
