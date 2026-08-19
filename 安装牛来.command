#!/bin/zsh
set -euo pipefail
setopt null_glob
unset ELECTRON_RUN_AS_NODE

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/牛来.app"
ARCH="$(uname -m)"
[[ "$ARCH" == "arm64" ]] || ARCH="x64"
TMP_DIR="$(mktemp -d -t niulai-install)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

notice() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"牛来安装器\"" >/dev/null 2>&1 || true
}

install_app() {
  local source_app="$1"
  mkdir -p "$APP_DIR"
  rm -rf "$APP_PATH"
  /usr/bin/ditto "$source_app" "$APP_PATH"
  /usr/bin/open "$APP_PATH"
  notice "安装完成。以后可从应用程序启动，运行时按 ⌘⇧U 显示或隐藏。"
}

echo "🐮 正在安装牛来…"
notice "正在准备牛来…"

LOCAL_APPS=("$ROOT"/dist/mac*/牛来.app "$ROOT"/dist/mac/牛来.app)
if (( ${#LOCAL_APPS[@]} > 0 )); then
  install_app "${LOCAL_APPS[1]}"
  echo "✅ 已安装到 $APP_PATH"
  exit 0
fi

if command -v curl >/dev/null && command -v python3 >/dev/null; then
  RELEASE_JSON="$TMP_DIR/release.json"
  if curl -fsSL "https://api.github.com/repos/adeptify/niul.ai/releases/latest" -o "$RELEASE_JSON"; then
    DOWNLOAD_URL="$(python3 - "$RELEASE_JSON" "$ARCH" <<'PY'
import json
import sys

release = json.load(open(sys.argv[1]))
arch = sys.argv[2]
for asset in release.get("assets", []):
    name = asset.get("name", "")
    if name.endswith(f"-{arch}.zip"):
        print(asset["browser_download_url"])
        break
PY
)"
    if [[ -n "$DOWNLOAD_URL" ]]; then
      echo "↓ 正在下载适合本机的安装包…"
      curl -fL "$DOWNLOAD_URL" -o "$TMP_DIR/niulai.zip"
      /usr/bin/ditto -x -k "$TMP_DIR/niulai.zip" "$TMP_DIR/app"
      DOWNLOADED_APPS=("$TMP_DIR"/app/*.app)
      if (( ${#DOWNLOADED_APPS[@]} > 0 )); then
        install_app "${DOWNLOADED_APPS[1]}"
        echo "✅ 已安装到 $APP_PATH"
        exit 0
      fi
    fi
  fi
fi

if command -v node >/dev/null && command -v npm >/dev/null; then
  echo "⚙️ 没找到可下载的 Release，改为从当前源码构建…"
  cd "$ROOT"
  npm ci
  npm run pack
  BUILT_APPS=("$ROOT"/dist/mac*/牛来.app "$ROOT"/dist/mac/牛来.app)
  if (( ${#BUILT_APPS[@]} > 0 )); then
    install_app "${BUILT_APPS[1]}"
    echo "✅ 已安装到 $APP_PATH"
    exit 0
  fi
fi

/usr/bin/osascript <<'APPLESCRIPT'
display alert "暂时无法安装牛来" message "还没有可下载的安装包，并且这台 Mac 没有 Node.js。请先从项目 Release 下载，或安装 Node.js 后再次双击“安装牛来.command”。" buttons {"打开下载页", "好"} default button "打开下载页"
if button returned of result is "打开下载页" then
  open location "https://github.com/adeptify/niul.ai/releases/latest"
end if
APPLESCRIPT
exit 1
