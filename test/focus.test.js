const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { focusSession, runtimeAppNames, findParentTerminal } = require("../electron/focus");

test("Codex session opens the Runtime app, never the project name", () => {
  const names = runtimeAppNames(
    { runtime: "codex", label: "ForkLight", cwdName: "ForkLight" },
    { focusApp: "Codex" }
  );

  assert.deepEqual(names, ["Codex", "ChatGPT"]);
  assert.equal(names.includes("ForkLight"), false);
});

test("Runtime configuration overrides aliases without duplicating the app", () => {
  const names = runtimeAppNames(
    { runtime: "cursor", label: "some-project" },
    { focusApps: ["Cursor"], focusApp: "Cursor" }
  );

  assert.deepEqual(names, ["Cursor"]);
});

test("launches the app bundle before trying unreliable process frontmost", async () => {
  const calls = [];
  const opened = await focusSession(
    { runtime: "codex", cwd: "/tmp/project" },
    { focusApps: ["Codex", "ChatGPT"] },
    {
      listProcesses: () => [],
      launchApplication: async (name) => {
        calls.push(`launch:${name}`);
        return name === "Codex";
      },
      focusApplication: async (name) => {
        calls.push(`focus:${name}`);
        return true;
      },
    }
  );

  assert.equal(opened, true);
  assert.deepEqual(calls, ["launch:Codex"]);
});

test("IDE opens the project folder with openBin before raising the app", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-focus-"));
  const calls = [];
  const opened = await focusSession(
    { runtime: "cursor", cwd: dir },
    { focusApp: "Cursor", openBin: "cursor" },
    {
      runOpenBin: async (bin, args) => {
        calls.push(`${bin}:${args.join(",")}`);
        return true;
      },
      launchApplication: async (name) => {
        calls.push(`launch:${name}`);
        return true;
      },
    }
  );
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(opened, true);
  assert.deepEqual(calls, [`cursor:${dir}`]);
});

test("CLI focuses the parent terminal instead of the desktop app", async () => {
  const calls = [];
  const opened = await focusSession(
    { runtime: "claude-code" },
    { focusApp: "Claude", process: ["claude"], openBin: "claude" },
    {
      listProcesses: () => [
        { pid: 10, ppid: 1, comm: "iTerm2", args: "/Applications/iTerm.app/Contents/MacOS/iTerm2" },
        { pid: 22, ppid: 10, comm: "claude", args: "/opt/homebrew/bin/claude" },
      ],
      launchApplication: async (name) => {
        calls.push(`launch:${name}`);
        return true;
      },
    }
  );
  assert.equal(opened, true);
  assert.deepEqual(calls, ["launch:iTerm"]);
});

test("findParentTerminal walks ppid to iTerm", async () => {
  const app = await findParentTerminal(
    [
      { pid: 1, ppid: 0, comm: "launchd", args: "launchd" },
      { pid: 10, ppid: 1, comm: "iTerm2", args: "/Applications/iTerm.app/Contents/MacOS/iTerm2" },
      { pid: 22, ppid: 10, comm: "claude", args: "/opt/homebrew/bin/claude" },
    ],
    { runtime: "claude-code" },
    { process: ["claude"] }
  );
  assert.equal(app, "iTerm");
});

test("findParentTerminal uses cwd to disambiguate terminal apps", async () => {
  const app = await findParentTerminal(
    [
      { pid: 10, ppid: 1, comm: "iTerm2", args: "/Applications/iTerm.app/Contents/MacOS/iTerm2" },
      { pid: 22, ppid: 10, comm: "claude", args: "/opt/homebrew/bin/claude" },
      { pid: 30, ppid: 1, comm: "Warp", args: "/Applications/Warp.app/Contents/MacOS/Warp" },
      { pid: 31, ppid: 30, comm: "claude", args: "/opt/homebrew/bin/claude" },
    ],
    { runtime: "claude-code", cwd: "/work/target" },
    { process: ["claude"] },
    {
      processCwd: async (pid) => (pid === 31 ? "/work/target" : "/work/other"),
    }
  );
  assert.equal(app, "Warp");
});

test("findParentTerminal recognizes an interpreted CLI script path", async () => {
  const app = await findParentTerminal(
    [
      { pid: 30, ppid: 1, comm: "Warp", args: "/Applications/Warp.app/Contents/MacOS/Warp" },
      {
        pid: 31,
        ppid: 30,
        comm: "node",
        args: "/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/@google/gemini-cli/dist/index.js",
      },
    ],
    { runtime: "gemini", cwd: "/work/target" },
    { process: ["gemini"], openBin: "gemini" },
    { processCwd: async () => "/work/target" }
  );
  assert.equal(app, "Warp");
});

test("findParentTerminal refuses an ambiguous multi-terminal match", async () => {
  const app = await findParentTerminal(
    [
      { pid: 10, ppid: 1, comm: "iTerm2", args: "/Applications/iTerm.app/Contents/MacOS/iTerm2" },
      { pid: 22, ppid: 10, comm: "claude", args: "/opt/homebrew/bin/claude" },
      { pid: 30, ppid: 1, comm: "Warp", args: "/Applications/Warp.app/Contents/MacOS/Warp" },
      { pid: 31, ppid: 30, comm: "claude", args: "/opt/homebrew/bin/claude" },
    ],
    { runtime: "claude-code" },
    { process: ["claude"] }
  );
  assert.equal(app, "");
});

test("ambiguous CLI terminals fall back without opening Finder", async () => {
  const calls = [];
  const opened = await focusSession(
    { runtime: "claude-code", cwd: "/tmp/project" },
    { focusApp: "Claude", process: ["claude"], openBin: "claude" },
    {
      listProcesses: async () => [
        { pid: 10, ppid: 1, comm: "iTerm2", args: "/Applications/iTerm.app/Contents/MacOS/iTerm2" },
        { pid: 22, ppid: 10, comm: "claude", args: "/opt/homebrew/bin/claude" },
        { pid: 30, ppid: 1, comm: "Warp", args: "/Applications/Warp.app/Contents/MacOS/Warp" },
        { pid: 31, ppid: 30, comm: "claude", args: "/opt/homebrew/bin/claude" },
      ],
      launchApplication: async (name) => {
        calls.push(name);
        return name === "Claude";
      },
    }
  );
  assert.equal(opened, true);
  assert.deepEqual(calls, ["Claude"]);
});
