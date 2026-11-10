#!/usr/bin/env bash
# Fails if Git tracks sensitive files or if .gitignore is missing a rule for them.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
status=0

tracked=$(git ls-files | grep -E '(^|/)(\.env(\..*)?|credentials[^/]*\.json|token[^/]*\.json|id_rsa)$|(^|/)secrets/|\.(pem|key|p12|log|bak|dump|sqlite3?|db)$' | grep -v -E '(^|/)\.env\.example$')
if [ -n "$tracked" ]; then
  echo "FAIL: sensitive files tracked by Git:"
  echo "$tracked"
  status=1
fi

for path in .env .env.local secrets/x server.key _site/index.html node_modules/x debug.log; do
  if ! git check-ignore -q "$path"; then
    echo "FAIL: .gitignore does not cover $path"
    status=1
  fi
done

[ "$status" -eq 0 ] && echo "OK: no sensitive files exposed."
exit "$status"
