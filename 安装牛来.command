#!/bin/zsh
set -euo pipefail
setopt null_glob
typeset -U path
unset ELECTRON_RUN_AS_NODE

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/牛来.app"
ARCH="$(uname -m)"
[[ "$ARCH" == "arm64" ]] || ARCH="x64"
TMP_DIR="$(mktemp -d -t niulai-install)"
NODE_MIN_MAJOR=18

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

prepend_path() {
  local dir="${1:-}"
  [[ -n "$dir" && -d "$dir" ]] || return 0
  path=("$dir" $path)
}

# Double-click launches a non-interactive zsh that does not read ~/.zshrc,
# so nvm / fnm / volta would otherwise be invisible.
bootstrap_node_path() {
  prepend_path /opt/homebrew/bin
  prepend_path /usr/local/bin
  prepend_path "$HOME/.local/bin"
  prepend_path "$HOME/.volta/bin"
  prepend_path "$HOME/.asdf/shims"
  prepend_path "$HOME/.fnm"
  prepend_path "$HOME/.local/share/fnm"

  local nvm_bin=""
  if [[ -d "$HOME/.nvm/versions/node" ]]; then
    nvm_bin="$(/bin/ls -1d "$HOME/.nvm/versions/node"/v*/bin 2>/dev/null | /usr/bin/sort -V | /usr/bin/tail -1 || true)"
  fi
  prepend_path "$nvm_bin"

  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell zsh 2>/dev/null)" || true
  fi
  export PATH
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo "0"
}

has_usable_node() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && (( $(node_major) >= NODE_MIN_MAJOR ))
}

notice() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"牛来安装器\"" >/dev/null 2>&1 || true
}

fail_install() {
  local message="$1"
  local primary="${2:-}"
  local primary_url="${3:-}"
  notice "安装没有完成"
  echo "❌ $message" >&2
  if [[ -n "$primary" && -n "$primary_url" ]]; then
    /usr/bin/osascript - "$message" "$primary" "$primary_url" <<'APPLESCRIPT'
on run argv
  set theMessage to item 1 of argv
  set primaryLabel to item 2 of argv
  set primaryUrl to item 3 of argv
  display alert "暂时无法安装牛来" message theMessage buttons {primaryLabel, "好"} default button primaryLabel
  if button returned of result is primaryLabel then
    open location primaryUrl
  end if
end run
APPLESCRIPT
  else
    /usr/bin/osascript - "$message" <<'APPLESCRIPT'
on run argv
  display alert "暂时无法安装牛来" message (item 1 of argv) buttons {"好"} default button "好"
end run
APPLESCRIPT
  fi
  exit 1
}

install_app() {
  local source_app="$1"
  mkdir -p "$APP_DIR"
  rm -rf "$APP_PATH"
  /usr/bin/ditto "$source_app" "$APP_PATH"
  /usr/bin/codesign --force --deep --sign - "$APP_PATH" >/dev/null 2>&1 || true
  /usr/bin/xattr -cr "$APP_PATH" >/dev/null 2>&1 || true

  echo "✅ 已安装到 $APP_PATH"
  echo "   这是用户主目录下的应用程序，不是 /Applications。"
  echo "   下次用 Spotlight 搜「牛来」，或打开上面的路径。"
  echo "   运行时按 ⌘⇧U 显示或隐藏；彻底退出后不会自动回来。"

  if /usr/bin/open "$APP_PATH" 2>/dev/null; then
    notice "已装到用户主目录/Applications/牛来.app。下次 Spotlight 搜「牛来」。运行时按 ⌘⇧U 隐藏。"
  else
    notice "已装好，但系统拦截了首次打开。请右键「牛来」选择打开。"
    /usr/bin/open -R "$APP_PATH"
    /usr/bin/osascript <<'APPLESCRIPT'
display alert "牛来已装好" message "系统拦住了未签名应用。请在打开的 Finder 窗口里对「牛来」右键，选择「打开」。它在用户主目录的应用程序文件夹，不是 /Applications。" buttons {"好"} default button "好"
APPLESCRIPT
  fi
}

bootstrap_node_path

if [[ "${1:-}" == "--probe-node" ]]; then
  echo "node=$(command -v node || echo MISSING)"
  echo "npm=$(command -v npm || echo MISSING)"
  echo "version=$(node -v 2>/dev/null || echo MISSING)"
  exit 0
fi

echo "🐮 正在安装牛来…"
notice "正在准备牛来…"

LOCAL_APPS=("$ROOT"/dist/mac*/牛来.app)
if (( ${#LOCAL_APPS[@]} > 0 )); then
  install_app "${LOCAL_APPS[1]}"
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
        exit 0
      fi
    fi
  fi
fi

if has_usable_node; then
  echo "⚙️ 没有可下载的安装包，改为从当前源码构建…"
  echo "   使用 $(command -v node) ($(node -v))。"
  cd "$ROOT"
  if ! npm ci; then
    fail_install "依赖安装失败。请看终端里的报错，确认网络可用后，在能运行 node 的终端里再执行：zsh 安装牛来.command"
  fi
  if ! npm run pack; then
    fail_install "打包失败。请看终端里的报错后再试。"
  fi
  BUILT_APPS=("$ROOT"/dist/mac*/牛来.app)
  if (( ${#BUILT_APPS[@]} > 0 )); then
    install_app "${BUILT_APPS[1]}"
    exit 0
  fi
  fail_install "源码构建没有产出 牛来.app。请把终端完整输出发到项目 Issues。"
fi

NODE_HINT="当前还没有可下载的安装包，需要本机 Node.js ${NODE_MIN_MAJOR}+ 从源码构建。"
if command -v node >/dev/null 2>&1; then
  NODE_HINT+=" 已找到 $(command -v node) ($(node -v 2>/dev/null || echo 未知版本))，但版本不够或找不到 npm。"
else
  NODE_HINT+=" 双击启动时可能看不到 nvm 里的 Node；请先安装 Node，再在已经能运行 node -v 的终端里执行：zsh 安装牛来.command"
fi

fail_install "$NODE_HINT" "打开 Node 下载页" "https://nodejs.org/zh-cn/download"
