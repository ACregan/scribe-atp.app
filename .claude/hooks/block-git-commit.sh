#!/usr/bin/env bash
# Blocks any git commit command. Claude must ask the user to run commits manually.
command=$(jq -r '.tool_input.command // ""' 2>/dev/null)

if echo "$command" | grep -qE '(^|[;&|]| )git commit'; then
  echo "BLOCKED: git commit is not permitted. Ask the user to run the commit themselves." >&2
  exit 2
fi
