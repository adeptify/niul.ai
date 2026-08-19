const { execFile } = require("child_process");
const fs = require("fs");

const RUNTIME_APP_ALIASES = {
  cursor: ["Cursor"],
  "claude-code": ["Claude"],
  "claude-desktop": ["Claude"],
  codex: ["Codex", "ChatGPT"],
  grok: ["Grok Bot"],
  opencode: ["OpenCode"],
  windsurf: ["Windsurf"],
  zed: ["Zed"],
  warp: ["Warp"],
  chatgpt: ["ChatGPT"],
};

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (error) => resolve(!error));
  });
}

function osascript(script, args = []) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script, ...args], (error) => resolve(!error));
  });
}

async function focusApplication(appName) {
  if (!appName) return false;
  return osascript(
    `on run argv
      set targetName to item 1 of argv
      tell application "System Events"
        if exists application process targetName then
          set frontmost of application process targetName to true
          return "focused"
        end if
      end tell
      error "not running"
    end run`,
    [appName]
  );
}

function runtimeAppNames(session, runtimeCfg = {}) {
  return [
    ...(Array.isArray(runtimeCfg.focusApps) ? runtimeCfg.focusApps : []),
    runtimeCfg.focusApp,
    ...(RUNTIME_APP_ALIASES[session.runtime] || []),
  ].filter((name, index, values) => name && values.indexOf(name) === index);
}

async function focusSession(session, runtimeCfg = {}, operations = {}) {
  const appNames = runtimeAppNames(session, runtimeCfg);
  const cwd = session.cwd;
  const launchApplication =
    operations.launchApplication || ((appName) => run("open", ["-a", appName]));
  const focusRunningApplication = operations.focusApplication || focusApplication;

  for (const appName of appNames) {
    // `open -a` reliably activates the app's bundle. Merely setting a process
    // `frontmost` can return success without actually raising its windows.
    if (await launchApplication(appName)) return true;
  }
  for (const appName of appNames) {
    if (await focusRunningApplication(appName)) return true;
  }

  // A Runtime with an app target must never fall through to Finder: the row
  // title is the project name, not the application the user asked to open.
  if (appNames.length) return false;
  if (cwd && fs.existsSync(cwd)) {
    await run("open", [cwd]);
    return true;
  }
  return false;
}

module.exports = { focusSession, runtimeAppNames };
