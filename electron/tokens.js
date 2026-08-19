const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_MS = 30000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
let cached = null;

function exists(file) {
  try {
    return Boolean(file) && fs.existsSync(file);
  } catch {
    return false;
  }
}

function stat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function walkFiles(root, predicate, acc = [], depth = 0) {
  if (!exists(root) || depth > 8 || acc.length >= 5000) return acc;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, acc, depth + 1);
    else if (predicate(full, entry.name)) acc.push(full);
  }
  return acc;
}

function readRecentLines(file, marker) {
  try {
    const metadata = fs.statSync(file);
    const start = Math.max(0, metadata.size - MAX_FILE_BYTES);
    const handle = fs.openSync(file, "r");
    const buffer = Buffer.alloc(metadata.size - start);
    fs.readSync(handle, buffer, 0, buffer.length, start);
    fs.closeSync(handle);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstBreak = text.indexOf("\n");
      text = firstBreak >= 0 ? text.slice(firstBreak + 1) : "";
    }
    return {
      lines: text.split("\n").filter((line) => line && (!marker || line.includes(marker))),
      truncated: start > 0,
      metadata,
    };
  } catch {
    return { lines: [], truncated: false, metadata: null };
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function usageTotal(usage) {
  if (!usage || typeof usage !== "object") return 0;
  const input = number(usage.input_tokens ?? usage.inputTokens);
  const output = number(usage.output_tokens ?? usage.outputTokens);
  const explicit = number(usage.total_tokens ?? usage.totalTokens);
  return explicit || input + output;
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    return timestampMs(Number(value));
  }
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function localDayStart(now) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function codexTokens(root, dayStart, sessions) {
  const result = { id: "codex", label: "Codex", tokens: 0, files: 0, confidence: "high" };
  const files = walkFiles(root, (file) => file.endsWith(".jsonl")).filter((file) => {
    const metadata = stat(file);
    return metadata && metadata.mtimeMs >= dayStart;
  });

  for (const file of files) {
    const { lines, truncated, metadata } = readRecentLines(file, '"token_count"');
    let previous = null;
    let today = 0;
    let sawBaseline = !truncated && metadata && metadata.birthtimeMs >= dayStart;
    const seenSnapshots = new Set();
    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;
      const timestamp = timestampMs(record.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const info = record.payload.info || {};
      const cumulative = usageTotal(info.total_token_usage);
      const last = usageTotal(info.last_token_usage);
      const signature = JSON.stringify({
        total: info.total_token_usage || null,
        last: info.last_token_usage || null,
      });
      if (seenSnapshots.has(signature)) continue;
      seenSnapshots.add(signature);
      if (timestamp < dayStart) {
        if (cumulative) previous = cumulative;
        sawBaseline = true;
        continue;
      }
      if (!cumulative) continue;
      let delta;
      if (last) {
        // Current Codex logs expose the exact request usage. Prefer it over
        // cumulative subtraction because independent rate-limit lanes can
        // advance out of order (the same approach used by CC-Switch).
        delta = last;
      } else if (previous === null) {
        delta = sawBaseline ? cumulative : last;
      } else {
        delta = cumulative >= previous ? cumulative - previous : last || cumulative;
      }
      today += Math.max(0, delta || 0);
      previous = cumulative;
    }
    if (today > 0) {
      const id = path.basename(file, ".jsonl");
      sessions[`codex:${id}`] = today;
      result.tokens += today;
      result.files += 1;
    }
    if (truncated && !sawBaseline) result.confidence = "partial";
  }
  return result;
}

function claudeTokens(root, dayStart, sessions) {
  const result = { id: "claude-code", label: "Claude Code", tokens: 0, files: 0, confidence: "high" };
  const files = walkFiles(root, (file) => file.endsWith(".jsonl")).filter((file) => {
    const metadata = stat(file);
    return metadata && metadata.mtimeMs >= dayStart;
  });

  for (const file of files) {
    const { lines, truncated } = readRecentLines(file, '"usage"');
    const responses = new Map();
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.type !== "assistant" || !record.message?.usage) continue;
      const timestamp = timestampMs(record.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < dayStart) continue;
      const usage = record.message.usage;
      const tokens =
        number(usage.input_tokens) +
        number(usage.cache_creation_input_tokens) +
        number(usage.cache_read_input_tokens) +
        number(usage.output_tokens);
      if (!tokens) continue;
      const identity =
        record.message.id ||
        record.requestId ||
        record.request_id ||
        `${record.sessionId || path.basename(file)}:${record.timestamp}:${record.message.model || "unknown"}:${lineNumber}`;
      const existing = responses.get(identity);
      const final = Boolean(record.message.stop_reason);
      if (!existing || (final && !existing.final) || tokens > existing.tokens) {
        responses.set(identity, { tokens, final });
      }
    }
    const today = [...responses.values()].reduce((sum, entry) => sum + entry.tokens, 0);
    if (today > 0) {
      const id = path.basename(file, ".jsonl");
      sessions[`claude-code:${id}`] = today;
      result.tokens += today;
      result.files += 1;
    }
    if (truncated) result.confidence = "partial";
  }
  return result;
}

function grokTokens(root, dayStart, sessions) {
  const result = { id: "grok", label: "Grok Build", tokens: 0, files: 0, confidence: "high" };
  const files = walkFiles(root, (_file, name) => name === "updates.jsonl").filter((file) => {
    const metadata = stat(file);
    return metadata && metadata.mtimeMs >= dayStart;
  });

  for (const file of files) {
    const { lines, truncated } = readRecentLines(file);
    const completedTurns = new Map();
    const legacyTurns = new Map();
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const update = record.params?.update;
      const usage = update?.usage;
      const timestamp = timestampMs(record.timestamp);
      if (
        usage &&
        (!update.sessionUpdate || update.sessionUpdate === "turn_completed") &&
        Number.isFinite(timestamp) &&
        timestamp >= dayStart
      ) {
        const modelUsage = usage.modelUsage;
        const tokens =
          modelUsage && typeof modelUsage === "object"
            ? Object.values(modelUsage).reduce((sum, counters) => sum + usageTotal(counters), 0)
            : usageTotal(usage);
        const identity =
          update.prompt_id || update.promptId || `${record.timestamp || "unknown"}:${lineNumber}`;
        if (tokens) completedTurns.set(identity, tokens);
      }

      const meta = record.params?._meta;
      const turnStart = number(meta?.turnStartMs);
      const legacyTokens = number(meta?.totalTokens);
      if (turnStart && turnStart >= dayStart && legacyTokens) {
        legacyTurns.set(turnStart, Math.max(legacyTokens, legacyTurns.get(turnStart) || 0));
      }
    }
    // Newer Grok Build writes exact per-turn completion usage. The old _meta
    // snapshots describe the same turn, so only use them as a compatibility
    // fallback when no completion usage exists.
    const turns = completedTurns.size ? completedTurns : legacyTurns;
    const today = [...turns.values()].reduce((sum, tokens) => sum + tokens, 0);
    if (today > 0) {
      const id = path.basename(path.dirname(file));
      sessions[`grok:${id}`] = today;
      result.tokens += today;
      result.files += 1;
    }
    if (truncated) result.confidence = "partial";
  }
  return result;
}

function geminiTokens(root, dayStart, sessions) {
  const result = { id: "gemini", label: "Gemini CLI", tokens: 0, files: 0, confidence: "high" };
  const files = walkFiles(root, (_file, name) => name.startsWith("session-") && name.endsWith(".json"))
    .filter((file) => {
      const metadata = stat(file);
      return metadata && metadata.mtimeMs >= dayStart && file.includes(`${path.sep}chats${path.sep}`);
    });

  for (const file of files) {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      result.confidence = "partial";
      continue;
    }
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const seen = new Set();
    let today = 0;
    for (const message of messages) {
      if (message.type !== "gemini" || !message.tokens) continue;
      const timestamp = timestampMs(message.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < dayStart) continue;
      const identity = message.id || `${message.timestamp}:${message.model || "unknown"}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const tokens =
        number(message.tokens.total) ||
        number(message.tokens.input) +
          number(message.tokens.output) +
          number(message.tokens.thoughts);
      today += tokens;
    }
    if (today > 0) {
      const hash = path.basename(path.dirname(path.dirname(file)));
      const name = path.basename(file);
      sessions[`gemini:${hash}:${name}`] = today;
      result.tokens += today;
      result.files += 1;
    }
  }
  return result;
}

function collectTokenUsage(now = Date.now(), options = {}) {
  const dayStart = localDayStart(now);
  const useDefaultRoots =
    !options.codexRoot && !options.claudeRoot && !options.grokRoot && !options.geminiRoot;
  if (useDefaultRoots && cached && cached.dayStart === dayStart && now - cached.collectedAt < CACHE_MS) {
    return cached.snapshot;
  }

  const home = os.homedir();
  const sessions = {};
  const sources = [
    codexTokens(options.codexRoot || path.join(home, ".codex", "sessions"), dayStart, sessions),
    claudeTokens(options.claudeRoot || path.join(home, ".claude", "projects"), dayStart, sessions),
    grokTokens(options.grokRoot || path.join(home, ".grok", "sessions"), dayStart, sessions),
    geminiTokens(options.geminiRoot || path.join(home, ".gemini", "tmp"), dayStart, sessions),
  ].filter((source) => source.files > 0 || source.tokens > 0);
  const snapshot = {
    dayStart,
    tokens: sources.reduce((sum, source) => sum + source.tokens, 0),
    sources,
    sessions,
    supportedRuntimes: ["codex", "claude-code", "grok", "gemini"],
    unsupportedReasons: {
      cursor: "Cursor 本机 Session 暂未暴露实际 usage；不做估算",
      "claude-desktop": "Claude Desktop 本机记录未提供可核对的 usage",
    },
    collectedAt: now,
  };
  if (useDefaultRoots) cached = { dayStart, collectedAt: now, snapshot };
  return snapshot;
}

module.exports = { collectTokenUsage, localDayStart };
