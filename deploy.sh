#!/usr/bin/env bash
# Deploy YuhTahnTax – Tính lương & thuế TNCN lên Firebase Hosting.
#   ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_ID="${FIREBASE_PROJECT:-yuhtahntax}"
FIREBASE_ACCOUNT="${FIREBASE_ACCOUNT:-huypvn.urani@gmail.com}"

info() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# firebase-tools mới cần Node >= 20; nếu đang dùng Node cũ thì thử chuyển qua nvm
if [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null 2>&1 || true
fi

command -v firebase >/dev/null || die "Chưa có firebase CLI: npm i -g firebase-tools"
firebase login:list 2>/dev/null | grep -q "$FIREBASE_ACCOUNT" \
  || die "Account $FIREBASE_ACCOUNT chưa login: firebase login:add $FIREBASE_ACCOUNT"

FB="firebase --account $FIREBASE_ACCOUNT --project $PROJECT_ID --non-interactive"

# 0. File .yuhtax cũ của người dùng phải còn mở được (xem FORMAT.md)
node tools/check-yuhtax.mjs || die "File mẫu .yuhtax không mở được — sửa datafile.js trước khi deploy"

# 1. Build vào dist/: đóng dấu version cho service worker + ?v= của icon/manifest/js để client nhận bản mới
BUILD="$(date +%Y%m%d%H%M%S)"
rm -rf dist && cp -R public dist
find dist -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' -o -name '*.css' \) \
  -exec sed -i.bak "s/__BUILD__/$BUILD/g" {} +
find dist -name '*.bak' -delete
info "Build $BUILD"

# 2. Deploy
info "firebase deploy --only hosting ($PROJECT_ID)"
$FB deploy --only hosting

printf '\n\033[1;32m✓ Xong:\033[0m https://%s.web.app\n' "$PROJECT_ID"
