#!/usr/bin/env bash
set -e
mkdir -p /home/disnak/.local/postgres
cd /tmp/pg_test
for f in *.deb; do
  echo "Extracting $f..."
  dpkg-deb -x "$f" /home/disnak/.local/postgres
done
echo "Extracted successfully!"
/home/disnak/.local/postgres/usr/lib/postgresql/16/bin/postgres --version
