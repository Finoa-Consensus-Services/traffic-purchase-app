#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

if [ ! -d "$root/.git" ]; then
  exit 0
fi

mkdir -p "$root/.git/hooks"
cp "$root/.githooks/pre-commit" "$root/.git/hooks/pre-commit"
chmod +x "$root/.git/hooks/pre-commit"
