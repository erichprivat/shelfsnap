#!/bin/sh
# SQLite lives on one volume, so the app must run on exactly one machine.
set -eu
app=shelfsnap

# A stopped machine can lose its volume claim mid-deploy, and Fly then creates a second machine.
fly machines list --app "$app" --json | grep -o '"id": *"[0-9a-f]\{14\}"' | grep -o '[0-9a-f]\{14\}' |
  while read -r id; do fly machine start "$id" --app "$app" >/dev/null 2>&1 || true; done

fly deploy --app "$app" --ha=false --remote-only

count=$(fly machines list --app "$app" --json | grep -c '"private_ip"')
if [ "$count" -ne 1 ]; then
  echo "Expected 1 machine, found $count. Each extra machine has its own empty database; destroy it." >&2
  exit 1
fi
