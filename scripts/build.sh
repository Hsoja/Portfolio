#!/usr/bin/env bash
# Copies ONLY the public files into _site/ (what GitHub Pages serves).
# Docs, tests, scripts and CI config are never published.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site/fonts
cp index.html styles.css main.js robots.txt _headers .nojekyll _site/
cp fonts/*.woff2 _site/fonts/
echo "OK: _site/ built with $(find _site -type f | wc -l) files."
