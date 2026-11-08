#!/usr/bin/env bash
set -e
PGBIN="/home/disnak/.local/postgres/usr/lib/postgresql/16/bin"
export PATH="$PGBIN:$PATH"
export LD_LIBRARY_PATH="/home/disnak/.local/postgres/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

PGDATA="/home/disnak/.local/postgres/data"

if [ ! -d "$PGDATA" ]; then
  echo "Initializing DB in $PGDATA..."
  "$PGBIN/initdb" -D "$PGDATA" --no-locale --encoding=UTF8
fi

echo "Starting Postgres on port 54322..."
"$PGBIN/pg_ctl" -D "$PGDATA" -l /home/disnak/.local/postgres/logfile -o "-p 54322 -k /tmp" start || true
sleep 1
"$PGBIN/pg_isready" -h localhost -p 54322
echo "Postgres is ready!"
