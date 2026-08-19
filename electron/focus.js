const { spawn } = require("child_process");
const fs = require("fs");
const { execFile } = require("child_process");

function which(bin) {
  try {
    const { execFileSync } = require("child_process");
    return execFileSync("which", [bin], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
    resolve(true);
  });
}

function osascript(script) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], () => resolve(true));
  });
}

async function focusSession(session, runtimeCfg = {}) {
  const appName = runtimeCfg.focusApp || session.label;
  const bin = runtimeCfg.openBin;
  const cwd = session.cwd;

  if (bin && cwd && fs.existsSync(cwd) && which(bin)) {
    await run(bin, [cwd]);
  } else if (cwd && fs.existsSync(cwd)) {
    await run("open", [cwd]);
  }

  if (appName) {
    await osascript(`tell application "System Events"
      set matched to first process whose name contains "${appName.replace(/"/g, "")}"
      set frontmost of matched to true
    end tell`);
  }
  return true;
}

module.exports = { focusSession };
