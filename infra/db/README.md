# Production database

Hello Tidy runs on its own Postgres 17, in Docker, on an Oracle Cloud Always
Free ARM VM in Mumbai (2 OCPU, 12 GB), shared with another small app. Vercel
functions run in `bom1` (Mumbai) to sit next to it.

| Database | Used by | Login |
| --- | --- | --- |
| `hellotidy_live` | Vercel **Production** | `hellotidy_live` |
| `hellotidy_test` | Vercel **Preview**, local `.env.local` | `hellotidy_test` |

Each login can reach only its own database. Connection strings use
`db.hellotidy.in:5432` with `sslmode=verify-full`.

## Files

| File | What |
| --- | --- |
| `docker-compose.yml` | Postgres container, settings, health check |
| `pg_hba.conf` | Who may connect: TLS + SCRAM password only, superuser never over the network |
| `setup.sh` | One-time, re-runnable setup: secrets, certificate, databases, timers |
| `sync-cert.sh` | Copies the `db.hellotidy.in` certificate (renewed by the VM's Caddy) into Postgres; daily timer |
| `backup.sh` | Nightly `pg_dump` of both databases at 03:00 IST, 14 days on the VM, live copy uploaded to Object Storage |

On the server this folder lives at `~/hellotidy-db`. `secrets/`, `tls/` and
`backups/` exist only there, readable by root, and are never committed.

## Common tasks (on the VM, in `~/hellotidy-db`)

| Task | Command |
| --- | --- |
| Status | `sudo docker compose ps` |
| Logs | `sudo docker compose logs --tail 50 postgres` |
| SQL shell (live) | `sudo docker exec -it -u postgres hellotidy-pg psql -d hellotidy_live` |
| Connection string | `sudo cat secrets/hellotidy_live.url` |
| Back up now | `sudo systemctl start hellotidy-db-backup.service` |
| Last backup result | `sudo journalctl -u hellotidy-db-backup.service -n 10` |
| Apply a change to these files | copy them up, then `sudo docker compose up -d` |

## Restore

```bash
# into a scratch database first, to check the dump
sudo docker exec -u postgres hellotidy-pg psql -c "create database restore_check"
sudo cat backups/hellotidy_live-<stamp>.dump | \
  sudo docker exec -i -u postgres hellotidy-pg pg_restore --no-owner --no-acl -d restore_check
```

Restoring over `hellotidy_live` itself: stop traffic first (pause the Vercel
project), then restore with `--clean --if-exists --no-owner --role=hellotidy_live
-d hellotidy_live`, so the restored tables belong to the app's login.

## Migrations by hand

`scripts/migrate.ts` prefers `DATABASE_URL_UNPOOLED` over `DATABASE_URL`, so
set both when pointing it at a database from your machine.
