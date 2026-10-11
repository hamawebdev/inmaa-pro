#!/usr/bin/env bash
# Builds the PDFs in ../ from the Markdown sources in this folder.
# Needs pandoc, Google Chrome, and the Noto fonts (Noto Naskh/Sans/Kufi Arabic, Noto Sans).
# Usage: ./build.sh            (both PDFs)
#        ./build.sh plan       (Arabic client plan only)
#        ./build.sh notes      (English notes only)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build

render() { # $1 source .md, $2 stylesheet, $3 output PDF
  local html="build/$(basename "${1%.md}").html"
  pandoc "$1" --from markdown --to html5 --standalone \
    --toc --toc-depth=2 --css "$2" --embed-resources --resource-path=. \
    --output "$html"
  google-chrome --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$3" "file://$PWD/$html" 2>/dev/null
  echo "wrote $3"
}

what="${1:-all}"
if [[ "$what" == all || "$what" == plan ]]; then
  render plan-ar.md style-ar.css ../inmaa-system-plan-ar.pdf
fi
if [[ "$what" == all || "$what" == notes ]]; then
  render notes-en.md style-en.css ../software-scan-notes-en.pdf
fi
