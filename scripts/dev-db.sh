#!/usr/bin/env bash
# Local development Postgres without Docker.
#
# Runs a self-contained cluster in .data/pg (git-ignored) using Homebrew's
# Postgres binaries. Loopback only, trust auth, superuser "postgres", so the
# app and test defaults (postgres://postgres:postgres@127.0.0.1:5432/bluebird)
# connect unchanged. The cluster holds disposable test data only.
#
# One-time install (no Docker): brew install postgresql@17
#
# Usage: scripts/dev-db.sh [up|down|status]
set -euo pipefail

cd "$(dirname "$0")/.."
DATA_DIR=".data/pg"
LOG_FILE="$DATA_DIR/postgres.log"
PORT=5432

find_bindir() {
  local brew_bin=""
  if command -v brew >/dev/null 2>&1; then
    brew_bin="$(command -v brew)"
  elif [ -x "$HOME/.homebrew/bin/brew" ]; then
    brew_bin="$HOME/.homebrew/bin/brew"
  fi
  if [ -n "$brew_bin" ]; then
    for formula in postgresql@17 postgresql@18; do
      prefix="$("$brew_bin" --prefix "$formula" 2>/dev/null || true)"
      if [ -n "$prefix" ] && [ -x "$prefix/bin/pg_ctl" ]; then
        echo "$prefix/bin"
        return 0
      fi
    done
  fi
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return 0
  fi
  # Linux packages keep the server tools out of PATH.
  for candidate in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin; do
    if [ -x "$candidate/pg_ctl" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! BIN_DIR="$(find_bindir)"; then
  echo "Postgres was not found. Install it once (no Docker needed):" >&2
  echo "  brew install postgresql@17" >&2
  exit 1
fi

psql_cluster() {
  "$BIN_DIR/psql" -h 127.0.0.1 -p "$PORT" -U postgres "$@"
}

case "${1:-up}" in
  up | start)
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      mkdir -p "$DATA_DIR"
      "$BIN_DIR/initdb" -D "$DATA_DIR" -U postgres -A trust >/dev/null 2>&1
      {
        printf "\n# Added by scripts/dev-db.sh (local development cluster)\n"
        printf "listen_addresses = '127.0.0.1'\n"
        printf "port = %s\n" "$PORT"
        printf "unix_socket_directories = '%s'\n" "$(cd "$DATA_DIR" && pwd)"
      } >> "$DATA_DIR/postgresql.conf"
      echo "Initialized the local Postgres cluster in $DATA_DIR."
    fi

    # The socket folder is written as an absolute path; keep it right if this folder was moved or renamed.
    if grep -q "^unix_socket_directories" "$DATA_DIR/postgresql.conf"; then
      sed -i '' "s|^unix_socket_directories = .*|unix_socket_directories = '$(cd "$DATA_DIR" && pwd)'|" "$DATA_DIR/postgresql.conf"
    fi

    if "$BIN_DIR/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      echo "Postgres is already running (port $PORT)."
    else
      if "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -w start >/dev/null 2>&1; then
        echo "Postgres started (port $PORT, data in $DATA_DIR)."
      else
        echo "Postgres failed to start. Last lines of $LOG_FILE:" >&2
        tail -n 20 "$LOG_FILE" >&2 || true
        exit 1
      fi
    fi

    for db in bluebird bluebird_test; do
      exists="$(psql_cluster -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")"
      if [ "$exists" != "1" ]; then
        "$BIN_DIR/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$db"
        echo "Created database $db."
      fi
    done
    ;;
  down | stop)
    if "$BIN_DIR/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -w -m fast stop >/dev/null
      echo "Postgres stopped."
    else
      echo "Postgres is not running."
    fi
    ;;
  status)
    "$BIN_DIR/pg_ctl" -D "$DATA_DIR" status || true
    ;;
  *)
    echo "Usage: scripts/dev-db.sh [up|down|status]" >&2
    exit 2
    ;;
esac
