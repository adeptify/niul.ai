const assert = require("node:assert/strict");
const test = require("node:test");

const { focusSession, runtimeAppNames } = require("../electron/focus");

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
