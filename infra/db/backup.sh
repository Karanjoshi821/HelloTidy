#!/usr/bin/env bash
#
# Nightly backup of both databases. Runs from hellotidy-db-backup.timer.
#
# - Dumps hellotidy_live and hellotidy_test into ./backups (custom format, so
#   pg_restore can restore one table or everything).
# - Keeps 14 days on the VM.
# - If secrets/backup_upload_url exists (an Oracle Object Storage
#   pre-authenticated request URL ending in /o/), uploads the live dump there,
#   so a dead VM does not take the backups with it.
# - Warns when the disk is over 70% full.
#
set -euo pipefail
cd "$(dirname "$0")"

KEEP_DAYS=14
stamp=$(date -u +%Y-%m-%dT%H%MZ)
mkdir -p backups
chmod 700 backups

for db in hellotidy_live hellotidy_test; do
  out="backups/$db-$stamp.dump"
  docker exec -u postgres hellotidy-pg pg_dump -Fc "$db" > "$out.part"
  mv "$out.part" "$out"
  chmod 600 "$out"
  echo "dumped $db: $(du -h "$out" | cut -f1)"
done

if [ -s secrets/backup_upload_url ]; then
  url=$(tr -d '[:space:]' < secrets/backup_upload_url)
  file="backups/hellotidy_live-$stamp.dump"
  curl -fsS --retry 3 -X PUT --upload-file "$file" "$url$(basename "$file")" >/dev/null
  echo "uploaded $(basename "$file")"
else
  echo "no secrets/backup_upload_url yet: backup kept on this VM only"
fi

find backups -name '*.dump' -mtime +"$KEEP_DAYS" -delete

used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$used" -gt 70 ]; then
  echo "WARNING: disk ${used}% full" >&2
fi
