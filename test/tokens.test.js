const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { collectTokenUsage, localDayStart } = require("../electron/tokens");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-tokens-"));
  const roots = {
    codexRoot: path.join(root, "codex"),
    codexArchiveRoot: path.join(root, "codex-archive"),
    claudeRoot: path.join(root, "claude"),
    grokRoot: path.join(root, "grok"),
    grokArchiveRoot: path.join(root, "grok-archive"),
    geminiRoot: path.join(root, "gemini"),
  };
  Object.values(roots).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return roots;
}

function writeJsonl(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n"));
}

test("Codex uses cumulative deltas instead of summing repeated totals", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const start = localDayStart(now);
  writeJsonl(path.join(roots.codexRoot, "session-a.jsonl"), [
    {
      timestamp: new Date(start - 1000).toISOString(),
      type: "event_msg",
      payload: { type: "token_count", info: { total_token_usage: { total_tokens: 100 } } },
    },
    {
      timestamp: new Date(start + 1000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { total_tokens: 160 }, last_token_usage: { total_tokens: 60 } },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 60);
  assert.equal(result.sessions["codex:session-a"], 60);
});

test("Codex prefers exact last usage across interleaved cumulative lanes", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  writeJsonl(path.join(roots.codexRoot, "session-interleaved.jsonl"), [
    {
      timestamp: new Date(now - 2000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { total_tokens: 1000 },
          last_token_usage: { input_tokens: 80, output_tokens: 20 },
        },
      },
    },
    {
      timestamp: new Date(now - 1000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { total_tokens: 700 },
          last_token_usage: { input_tokens: 40, output_tokens: 10 },
        },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 150);
});

test("Codex total-only fallback uses a component high-water mark", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const start = localDayStart(now);
  writeJsonl(path.join(roots.codexRoot, "session-high-water.jsonl"), [
    {
      timestamp: new Date(start - 1000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 800, output_tokens: 200 } },
      },
    },
    {
      timestamp: new Date(start + 1000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 550, output_tokens: 150 } },
      },
    },
    {
      timestamp: new Date(start + 2000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 880, output_tokens: 220 } },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 100);
});

test("Codex counts equal last usage values from distinct requests", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  writeJsonl(path.join(roots.codexRoot, "session-equal.jsonl"), [
    {
      timestamp: new Date(now - 2000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { total_tokens: 100 },
          last_token_usage: { total_tokens: 100 },
        },
      },
    },
    {
      timestamp: new Date(now - 1000).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { total_tokens: 200 },
          last_token_usage: { total_tokens: 100 },
        },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 200);
});

test("Codex deduplicates replayed fork and archived events", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const replayed = {
    timestamp: new Date(now - 2000).toISOString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: 50 },
        last_token_usage: { total_tokens: 50 },
      },
    },
  };
  const childOnly = {
    timestamp: new Date(now - 1000).toISOString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: 120 },
        last_token_usage: { total_tokens: 70 },
      },
    },
  };
  writeJsonl(path.join(roots.codexRoot, "parent.jsonl"), [replayed]);
  writeJsonl(path.join(roots.codexRoot, "child.jsonl"), [replayed, childOnly]);
  writeJsonl(path.join(roots.codexArchiveRoot, "parent.jsonl"), [replayed]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 120);
});

test("Claude deduplicates repeated assistant usage by message id", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const record = {
    timestamp: new Date(now).toISOString(),
    type: "assistant",
    message: {
      id: "response-1",
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 40,
      },
    },
  };
  writeJsonl(path.join(roots.claudeRoot, "session-b.jsonl"), [record, record]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "claude-code").tokens, 100);
});

test("Claude deduplicates the same message across files", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const record = {
    timestamp: new Date(now).toISOString(),
    type: "assistant",
    message: {
      id: "response-shared",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
  writeJsonl(path.join(roots.claudeRoot, "session-one.jsonl"), [record]);
  writeJsonl(path.join(roots.claudeRoot, "session-two.jsonl"), [record]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "claude-code").tokens, 15);
});

test("Grok legacy context snapshots are reported as estimates, not exact usage", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const turnA = now - 2000;
  const turnB = now - 1000;
  writeJsonl(path.join(roots.grokRoot, "session-c", "updates.jsonl"), [
    { params: { _meta: { turnStartMs: turnA, totalTokens: 20 } } },
    { params: { _meta: { turnStartMs: turnA, totalTokens: 35 } } },
    { params: { _meta: { turnStartMs: turnB, totalTokens: 12 } } },
  ]);
  const result = collectTokenUsage(now, roots);
  const source = result.sources.find((item) => item.id === "grok");
  assert.equal(source.tokens, 0);
  assert.equal(source.estimatedTokens, 47);
  assert.equal(source.confidence, "estimated");
  assert.equal(result.tokens, 0);
  assert.equal(result.sessions["grok:session-c"], undefined);
});

test("Grok prefers exact turn completion usage over legacy snapshots", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  writeJsonl(path.join(roots.grokRoot, "session-modern", "updates.jsonl"), [
    { params: { _meta: { turnStartMs: now - 1000, totalTokens: 999 } } },
    {
      timestamp: new Date(now).toISOString(),
      params: {
        update: {
          sessionUpdate: "turn_completed",
          prompt_id: "prompt-1",
          usage: {
            modelUsage: {
              "grok-build": { inputTokens: 100, outputTokens: 10, cachedReadTokens: 80 },
            },
          },
        },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "grok").tokens, 110);
});

test("Grok deduplicates prompt rewrites but counts distinct equal prompts", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const event = (promptId) => ({
    timestamp: new Date(now).toISOString(),
    params: {
      sessionId: "grok-session",
      update: {
        sessionUpdate: "turn_completed",
        prompt_id: promptId,
        usage: { modelUsage: { model: { inputTokens: 100, outputTokens: 10 } } },
      },
    },
  });
  writeJsonl(path.join(roots.grokRoot, "grok-session", "updates.jsonl"), [
    event("prompt-1"),
    event("prompt-1"),
    event("prompt-2"),
  ]);
  writeJsonl(path.join(roots.grokArchiveRoot, "grok-session", "updates.jsonl"), [
    event("prompt-1"),
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "grok").tokens, 220);
  assert.equal(result.sessions["grok:grok-session"], 220);
});

test("Gemini sums exact per-message totals once", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const file = path.join(roots.geminiRoot, "project-hash", "chats", "session-demo.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      sessionId: "gemini-session",
      messages: [
        {
          id: "gemini-1",
          type: "gemini",
          timestamp: new Date(now).toISOString(),
          tokens: { input: 100, output: 10, thoughts: 5, cached: 80, total: 115 },
        },
      ],
    })
  );
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "gemini").tokens, 115);
  assert.equal(result.sessions["gemini:project-hash:session-demo.json"], 115);
});

test("future usage events are not included in today's total", (t) => {
  const roots = workspace(t);
  const now = Date.now();
  const tomorrow = new Date(localDayStart(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(1, 0, 0, 0);
  writeJsonl(path.join(roots.codexRoot, "session-future.jsonl"), [
    {
      timestamp: new Date(now).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { last_token_usage: { total_tokens: 25 } },
      },
    },
    {
      timestamp: tomorrow.toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { last_token_usage: { total_tokens: 999 } },
      },
    },
  ]);
  const result = collectTokenUsage(now, roots);
  assert.equal(result.sources.find((source) => source.id === "codex").tokens, 25);
});
