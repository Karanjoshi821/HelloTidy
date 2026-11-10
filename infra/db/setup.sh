#!/usr/bin/env bash
#
# One-time (and safe to re-run) setup of Hello Tidy Postgres on the Oracle VM.
#
#   sudo bash setup.sh
#
# Creates secrets, copies the TLS certificate, starts Postgres, creates the
# hellotidy_live and hellotidy_test databases each with its own login, and
# installs the daily certificate sync and nightly backup timers.
# Never prints a password: connection strings are written to secrets/*.url.
#
set -euo pipefail
cd "$(dirname "$0")"
DIR=$(pwd)
PG_UID=999
HOST=db.hellotidy.in

[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }

# ---------------------------------------------------------------- secrets ----
mkdir -p secrets backups tls
chmod 700 secrets backups
newpw() { openssl rand -hex 24; }
for f in postgres_password hellotidy_live.password hellotidy_test.password; do
  [ -s "secrets/$f" ] || { newpw > "secrets/$f"; echo "generated secrets/$f"; }
done
chown "$PG_UID:$PG_UID" secrets/postgres_password
chmod 600 secrets/*
chmod +x sync-cert.sh backup.sh

# -------------------------------------------------------------------- tls ----
bash sync-cert.sh

# --------------------------------------------------------------- postgres ----
docker compose up -d
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' hellotidy-pg 2>/dev/null)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' hellotidy-pg)" = healthy ] || {
  docker compose logs --tail 40 postgres; echo "postgres did not become healthy" >&2; exit 1; }
echo "postgres healthy"

psql_su() { docker exec -i -u postgres hellotidy-pg psql -v ON_ERROR_STOP=1 -qAt "$@"; }

for db in hellotidy_live hellotidy_test; do
  pw=$(cat "secrets/$db.password")
  # Passwords travel on stdin, never in a process argument list.
  psql_su <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$db') THEN
    CREATE ROLE $db LOGIN PASSWORD '$pw';
  END IF;
END \$\$;
ALTER ROLE $db SET statement_timeout = '60s';
SELECT 'CREATE DATABASE $db OWNER $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')
\gexec
REVOKE ALL ON DATABASE $db FROM PUBLIC;
SQL
  printf 'postgresql://%s:%s@%s:5432/%s?sslmode=verify-full\n' "$db" "$pw" "$HOST" "$db" > "secrets/$db.url"
  chmod 600 "secrets/$db.url"
  echo "ready: $db"
done

# ---------------------------------------------------------------- timers ----
cat > /etc/systemd/system/hellotidy-db-cert.service <<EOF
[Unit]
Description=Copy db.hellotidy.in certificate from Caddy into Postgres
[Service]
Type=oneshot
ExecStart=$DIR/sync-cert.sh
EOF
cat > /etc/systemd/system/hellotidy-db-cert.timer <<EOF
[Unit]
Description=Daily certificate sync for Hello Tidy Postgres
[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/hellotidy-db-backup.service <<EOF
[Unit]
Description=Nightly backup of Hello Tidy databases
[Service]
Type=oneshot
ExecStart=$DIR/backup.sh
EOF
cat > /etc/systemd/system/hellotidy-db-backup.timer <<EOF
[Unit]
Description=Nightly backup of Hello Tidy databases (03:00 IST)
[Timer]
OnCalendar=*-*-* 21:30:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now hellotidy-db-cert.timer hellotidy-db-backup.timer >/dev/null
echo "timers installed"
