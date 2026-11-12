#!/usr/bin/env bash
# Sets Bluebird up on macOS or Linux: tools, dependencies, keys, database, build,
# and a `bluebird` command. Safe to run again.
#   bash scripts/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""; if [ "$(id -u)" -ne 0 ] && have sudo; then SUDO="sudo"; fi

OS="$(uname -s)"
say "Checking this computer ($OS)"

node_ok() { have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; }

if ! node_ok; then
  say "Installing Node.js 22 or newer"
  if [ "$OS" = "Darwin" ] && have brew; then brew install node
  elif have apt-get; then
    $SUDO apt-get update -y && $SUDO apt-get install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs
  elif have dnf; then $SUDO dnf install -y nodejs
  else echo "Please install Node.js 22 or newer from https://nodejs.org, then run this again." >&2; exit 1; fi
fi
node_ok || { echo "Node.js 22 or newer is still missing." >&2; exit 1; }

if ! have pnpm; then
  say "Installing pnpm"
  corepack enable >/dev/null 2>&1 && corepack prepare pnpm@latest --activate >/dev/null 2>&1 || npm install -g pnpm
fi

if ! have pg_ctl && ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1 && ! { have brew && brew --prefix postgresql@17 >/dev/null 2>&1; }; then
  say "Installing PostgreSQL (Bluebird's private local database)"
  if [ "$OS" = "Darwin" ] && have brew; then brew install postgresql@17
  elif have apt-get; then $SUDO apt-get install -y postgresql postgresql-contrib
  elif have dnf; then $SUDO dnf install -y postgresql-server postgresql-contrib
  else echo "Please install PostgreSQL 17, then run this again." >&2; exit 1; fi
fi

say "Installing Bluebird's packages"
pnpm install --frozen-lockfile || pnpm install

say "Creating local keys and settings"
pnpm setup:keys

say "Starting the private database"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
bash scripts/dev-db.sh up
pnpm db:migrate

say "Building Bluebird"
pnpm build

say "Adding the bluebird command"
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
ln -sf "$ROOT/scripts/bluebird.sh" "$BIN/bluebird"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH to run 'bluebird' from anywhere: export PATH=\"$BIN:\$PATH\"" ;; esac

if ! have ollama; then
  say "One more thing"
  echo "Bluebird needs a model. Install Ollama from https://ollama.com and run: ollama pull llama3.2"
  echo "Or add a hosted model's key inside Bluebird, under Settings, Engine."
fi

say "Done"
echo "Start Bluebird with: bluebird start"
