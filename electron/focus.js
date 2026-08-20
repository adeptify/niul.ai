const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

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

const IDE_RUNTIMES = new Set(["cursor", "windsurf", "zed"]);
const CLI_RUNTIMES = new Set([
  "claude-code",
  "codex",
  "gemini",
  "pi",
  "aider",
  "crush",
  "goose",
  "amp",
  "opencode",
]);

const TERMINAL_APPS = [
  { needle: "iTerm2", app: "iTerm" },
  { needle: "iTerm", app: "iTerm" },
  { needle: "Ghostty", app: "Ghostty" },
  { needle: "Warp", app: "Warp" },
  { needle: "Alacritty", app: "Alacritty" },
  { needle: "kitty", app: "kitty" },
  { needle: "WezTerm", app: "WezTerm" },
  { needle: "Hyper", app: "Hyper" },
  { needle: "Tabby", app: "Tabby" },
  { needle: "Terminal", app: "Terminal" },
];

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (error) => resolve(!error));
  });
}

function runOutput(cmd, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { encoding: "utf8", timeout: 2000, maxBuffer: 2 * 1024 * 1024, ...options },
      (error, stdout) => resolve(error ? "" : String(stdout || ""))
    );
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

function isIdeRuntime(session, runtimeCfg = {}) {
  if (IDE_RUNTIMES.has(session.runtime)) return true;
  const app = String(runtimeCfg.focusApp || "").toLowerCase();
  return app === "cursor" || app === "windsurf" || app === "zed";
}

function isCliRuntime(session, runtimeCfg = {}) {
  if (session.runtime === "claude-desktop") return false;
  if (CLI_RUNTIMES.has(session.runtime)) return true;
  return Boolean(runtimeCfg.openBin) && !isIdeRuntime(session, runtimeCfg);
}

async function snapshotProcesses() {
  const out = await runOutput("ps", ["-axo", "pid=,ppid=,comm=,args="]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), comm: match[3], args: match[4] };
    })
    .filter(Boolean);
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function argvTokens(value) {
  const tokens = [];
  String(value || "").replace(/"([^"]*)"|'([^']*)'|(\S+)/g, (_match, double, single, bare) => {
    tokens.push(double ?? single ?? bare);
    return "";
  });
  return tokens;
}

function executableTokenLooksLike(value, needle) {
  const target = String(needle || "").toLowerCase();
  if (!target) return false;
  const token = String(value || "").toLowerCase();
  if (target.includes("/") && token.includes(target)) return true;
  return token.split(/[\\/]/).some((segment) => {
    const normalized = segment.replace(/\.(?:js|mjs|cjs|ts)$/, "");
    return (
      normalized === target ||
      normalized === `${target}-cli` ||
      normalized === `${target}-code` ||
      normalized === `${target}-agent` ||
      normalized === `${target}-coding-agent`
    );
  });
}

function processLooksLike(proc, needles) {
  if (!proc || !needles || !needles.length) return false;
  const commandTokens = argvTokens(proc.args);
  const tokenLimit = path.basename(commandTokens[0] || "") === "env" ? 3 : 2;
  const executableTokens = commandTokens.slice(0, tokenLimit);
  return needles.some((needle) => {
    if (!needle) return false;
    const token = new RegExp(`(?:^|[\\s\\/\\\\])${escapeRe(needle)}(?:[\\s:]|$)`, "i");
    const bin = path.basename(executableTokens[0] || "");
    return (
      token.test(proc.comm) ||
      token.test(bin) ||
      executableTokens.some((value) => executableTokenLooksLike(value, needle))
    );
  });
}

function terminalAppForProcess(proc) {
  const hay = `${proc.comm} ${proc.args}`;
  for (const item of TERMINAL_APPS) {
    if (hay.includes(item.needle) || hay.includes(`/Applications/${item.app}.app`)) return item.app;
  }
  return "";
}

function parentTerminal(byPid, proc) {
  let current = byPid.get(proc.ppid);
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const terminal = terminalAppForProcess(current);
    if (terminal) return terminal;
    current = byPid.get(current.ppid);
  }
  return "";
}

async function processCwd(pid) {
  const output = await runOutput(
    "lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    { timeout: 1000, maxBuffer: 128 * 1024 }
  );
  const line = output.split("\n").find((value) => value.startsWith("n"));
  return line ? line.slice(1) : "";
}

function normalizedPath(value) {
  if (!value) return "";
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

async function findParentTerminal(processes, session, runtimeCfg = {}, operations = {}) {
  const needles = [...(runtimeCfg.process || []), runtimeCfg.openBin, session.runtime].filter(Boolean);
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const candidates = processes
    .filter((proc) => processLooksLike(proc, needles))
    .map((proc) => ({ proc, terminal: parentTerminal(byPid, proc) }))
    .filter((candidate) => candidate.terminal);
  const getProcessCwd = operations.processCwd || processCwd;
  const targetCwd = normalizedPath(session.cwd);

  if (targetCwd) {
    const matched = (
      await Promise.all(
        candidates.map(async (candidate) => {
          const cwd = normalizedPath(await getProcessCwd(candidate.proc.pid));
          return cwd === targetCwd ? candidate.terminal : "";
        })
      )
    ).filter(Boolean);
    const matchedApps = [...new Set(matched)];
    if (matchedApps.length === 1) return matchedApps[0];
  }

  const terminalApps = [...new Set(candidates.map((candidate) => candidate.terminal))];
  return terminalApps.length === 1 ? terminalApps[0] : "";
}

async function focusSession(session, runtimeCfg = {}, operations = {}) {
  const appNames = runtimeAppNames(session, runtimeCfg);
  const cwd = session.cwd;
  const launchApplication =
    operations.launchApplication ||
    ((appName, extra = {}) =>
      extra.cwd ? run("open", ["-a", appName, extra.cwd]) : run("open", ["-a", appName]));
  const runOpenBin = operations.runOpenBin || ((bin, args) => run(bin, args));
  const listProcesses = operations.listProcesses || snapshotProcesses;
  const getProcessCwd = operations.processCwd || processCwd;
  const focusRunningApplication = operations.focusApplication || focusApplication;

  if (isIdeRuntime(session, runtimeCfg) && cwd && fs.existsSync(cwd)) {
    if (runtimeCfg.openBin && (await runOpenBin(runtimeCfg.openBin, [cwd]))) return true;
    for (const appName of appNames) {
      if (await launchApplication(appName, { cwd })) return true;
    }
  }

  if (isCliRuntime(session, runtimeCfg)) {
    const terminal = await findParentTerminal(
      await listProcesses(),
      session,
      runtimeCfg,
      { processCwd: getProcessCwd }
    );
    if (terminal && (await launchApplication(terminal))) return true;
  }

  for (const appName of appNames) {
    if (await launchApplication(appName)) return true;
  }
  for (const appName of appNames) {
    if (await focusRunningApplication(appName)) return true;
  }

  if (appNames.length) return false;
  if (cwd && fs.existsSync(cwd)) {
    await run("open", [cwd]);
    return true;
  }
  return false;
}

module.exports = {
  focusSession,
  runtimeAppNames,
  findParentTerminal,
  isIdeRuntime,
  isCliRuntime,
};
