const fs = require("fs");
const os = require("os");
const path = require("path");
const { createFileWalker, safeExists, safeStat } = require("./files");

const CACHE_MS = 30000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 20000;
const MAX_RATE_LIMIT_FILES = 24;
const MAX_RATE_LIMIT_BYTES = 512 * 1024;
let cached = null;
const exists = safeExists;
const stat = safeStat;
const walkFiles = createFileWalker({ maxDepth: 10, maxFiles: MAX_FILES });

function filesFromRoots(roots, predicate) {
  const files = [];
  const seen = new Set();
  for (const root of roots.filter(Boolean)) {
    for (const file of walkFiles(root, predicate)) {
      if (seen.has(file)) continue;
      seen.add(file);
      files.push(file);
      if (files.length >= MAX_FILES) return files;
    }
  }
  return files;
}

function filesTouchedToday(roots, predicate, dayStart) {
  const discovered = filesFromRoots(roots, predicate);
  const files = discovered.filter((file) => {
    const metadata = stat(file);
    return (
      metadata &&
      (metadata.mtimeMs >= dayStart ||
        metadata.ctimeMs >= dayStart ||
        metadata.birthtimeMs >= dayStart)
    );
  });
  return {
    files,
    allFiles: discovered,
    discoveredFiles: discovered.length,
    limitHit: discovered.length >= MAX_FILES,
  };
}

function readRecentLines(file, marker, maxBytes = MAX_FILE_BYTES) {
  let handle;
  try {
    const metadata = fs.statSync(file);
    const start = Math.max(0, metadata.size - maxBytes);
    handle = fs.openSync(file, "r");
    const buffer = Buffer.alloc(metadata.size - start);
    fs.readSync(handle, buffer, 0, buffer.length, start);
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
    return { lines: [], truncated: false, metadata: null, failed: true };
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* ignore */
      }
    }
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function usageParts(usage) {
  if (!usage || typeof usage !== "object") return { input: 0, output: 0, total: 0 };
  const input = number(usage.input_tokens ?? usage.inputTokens);
  const output = number(usage.output_tokens ?? usage.outputTokens);
  const explicit = number(usage.total_tokens ?? usage.totalTokens);
  return { input, output, total: explicit || input + output };
}

function usageTotal(usage) {
  return usageParts(usage).total;
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

function localDayEnd(now) {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function inDay(timestamp, dayStart, dayEnd) {
  return Number.isFinite(timestamp) && timestamp >= dayStart && timestamp < dayEnd;
}

function advanceHighWater(highWater, current) {
  highWater.input = Math.max(highWater.input, current.input);
  highWater.output = Math.max(highWater.output, current.output);
  highWater.total = Math.max(highWater.total, current.total);
}

function highWaterDelta(highWater, current) {
  let delta;
  if (current.input || current.output) {
    delta =
      Math.max(0, current.input - highWater.input) +
      Math.max(0, current.output - highWater.output);
  } else {
    delta = Math.max(0, current.total - highWater.total);
  }
  advanceHighWater(highWater, current);
  return delta;
}

function addSessionTokens(sessions, key, tokens) {
  if (tokens > 0) sessions[key] = (sessions[key] || 0) + tokens;
}

function readCodexRateLimit(payload, timestamp, now) {
  const limits = payload && payload.rate_limits;
  const primary = limits && limits.primary;
  if (!primary || !Number.isFinite(Number(primary.used_percent))) return null;
  const eventAt = Number(timestamp);
  const resetValue = Number(primary.resets_at);
  const resetsAt = Number.isFinite(resetValue)
    ? resetValue > 1e12
      ? resetValue
      : resetValue * 1000
    : 0;
  if (!Number.isFinite(eventAt) || eventAt > now || !resetsAt || resetsAt <= now) return null;
  const usedPercent = Math.min(100, Math.max(0, Number(primary.used_percent)));
  return {
    usedPercent,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
    windowMinutes: Number(primary.window_minutes) || 0,
    resetsAt,
    timestamp: eventAt,
    limitId: String(limits.limit_id || "codex"),
    planType: limits.plan_type || "",
  };
}

function latestCodexRateLimit(files, now) {
  const candidates = files
    .map((file) => ({ file, mtime: stat(file)?.mtimeMs || 0 }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_RATE_LIMIT_FILES);
  let latest = null;
  for (const candidate of candidates) {
    const { lines } = readRecentLines(
      candidate.file,
      '"rate_limits"',
      MAX_RATE_LIMIT_BYTES
    );
    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;
      const timestamp = timestampMs(record.timestamp);
      const rateLimit = readCodexRateLimit(record.payload, timestamp, now);
      if (rateLimit && rateLimit.timestamp >= (latest?.timestamp || 0)) latest = rateLimit;
    }
  }
  return latest;
}

function codexTokens(roots, dayStart, dayEnd, sessions, now) {
  const result = { id: "codex", label: "Codex", tokens: 0, files: 0, confidence: "high", rateLimit: null };
  const discovered = filesTouchedToday(roots, (file) => file.endsWith(".jsonl"), dayStart);
  const files = discovered.files;
  result.rateLimit = latestCodexRateLimit(discovered.allFiles, now);
  const seenEvents = new Set();
  if (discovered.limitHit) result.confidence = "partial";

  for (const file of files) {
    const { lines, truncated, metadata, failed } = readRecentLines(file, '"token_count"');
    if (failed || truncated) result.confidence = "partial";
    const highWater = { input: 0, output: 0, total: 0 };
    let baselineKnown = Boolean(
      metadata && metadata.birthtimeMs >= dayStart && metadata.birthtimeMs < dayEnd
    );
    let today = 0;

    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        result.confidence = "partial";
        continue;
      }
      if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;
      const timestamp = timestampMs(record.timestamp);
      if (!Number.isFinite(timestamp)) {
        result.confidence = "partial";
        continue;
      }
      if (timestamp >= dayEnd) continue;

      const info = record.payload.info || {};
      const cumulative = usageParts(info.total_token_usage);
      const last = usageParts(info.last_token_usage);
      const signature = `${timestamp}|${JSON.stringify(info.total_token_usage || null)}|${JSON.stringify(
        info.last_token_usage || null
      )}`;
      const replayed = seenEvents.has(signature);
      seenEvents.add(signature);

      if (timestamp < dayStart) {
        advanceHighWater(highWater, cumulative);
        baselineKnown = true;
        continue;
      }
      if (replayed) {
        advanceHighWater(highWater, cumulative);
        continue;
      }
      if (last.total) {
        today += last.total;
        advanceHighWater(highWater, cumulative);
        continue;
      }
      if (!cumulative.total) continue;
      if (!baselineKnown) {
        advanceHighWater(highWater, cumulative);
        baselineKnown = true;
        result.confidence = "partial";
        continue;
      }
      today += highWaterDelta(highWater, cumulative);
    }

    if (today > 0) {
      const id = path.basename(file, ".jsonl");
      addSessionTokens(sessions, `codex:${id}`, today);
      result.tokens += today;
      result.files += 1;
    }
  }
  result.scannedFiles = files.length;
  result.discoveredFiles = discovered.discoveredFiles;
  return result;
}

function claudeTokens(roots, dayStart, dayEnd, sessions) {
  const result = {
    id: "claude-code",
    label: "Claude Code",
    tokens: 0,
    files: 0,
    confidence: "high",
  };
  const discovered = filesTouchedToday(roots, (file) => file.endsWith(".jsonl"), dayStart);
  const files = discovered.files;
  const responses = new Map();
  if (discovered.limitHit) result.confidence = "partial";

  for (const file of files) {
    const { lines, truncated, failed } = readRecentLines(file, '"usage"');
    if (failed || truncated) result.confidence = "partial";
    const sessionId = path.basename(file, ".jsonl");
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        result.confidence = "partial";
        continue;
      }
      if (record.type !== "assistant" || !record.message?.usage) continue;
      const timestamp = timestampMs(record.timestamp);
      if (!Number.isFinite(timestamp)) {
        result.confidence = "partial";
        continue;
      }
      if (!inDay(timestamp, dayStart, dayEnd)) continue;

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
        `${record.sessionId || sessionId}:${record.timestamp}:${record.message.model || "unknown"}:${lineNumber}`;
      const existing = responses.get(identity);
      const final = Boolean(record.message.stop_reason);
      if (!existing || (final && !existing.final) || tokens > existing.tokens) {
        responses.set(identity, { tokens, final, sessionId, file });
      }
    }
  }

  const contributingFiles = new Set();
  for (const entry of responses.values()) {
    result.tokens += entry.tokens;
    addSessionTokens(sessions, `claude-code:${entry.sessionId}`, entry.tokens);
    contributingFiles.add(entry.file);
  }
  result.files = contributingFiles.size;
  result.scannedFiles = files.length;
  result.discoveredFiles = discovered.discoveredFiles;
  return result;
}

function grokTokens(roots, dayStart, dayEnd, sessions) {
  const result = {
    id: "grok",
    label: "Grok Build",
    tokens: 0,
    estimatedTokens: 0,
    files: 0,
    estimatedFiles: 0,
    confidence: "high",
  };
  const discovered = filesTouchedToday(
    roots,
    (_file, name) => name === "updates.jsonl",
    dayStart
  );
  const files = discovered.files;
  const exactTurns = new Map();
  const legacyTurns = new Map();
  if (discovered.limitHit) result.confidence = "partial";

  for (const file of files) {
    const { lines, truncated, failed } = readRecentLines(file);
    if (failed || truncated) result.confidence = "partial";
    const directorySessionId = path.basename(path.dirname(file));
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        result.confidence = "partial";
        continue;
      }
      const update = record.params?.update;
      const usage = update?.usage;
      const timestamp = timestampMs(record.timestamp);
      if (
        usage &&
        (!update.sessionUpdate || update.sessionUpdate === "turn_completed") &&
        inDay(timestamp, dayStart, dayEnd)
      ) {
        const sessionId =
          record.params?.sessionId || record.sessionId || update.sessionId || directorySessionId;
        const promptId =
          update.prompt_id ||
          update.promptId ||
          record.params?.prompt_id ||
          record.params?.promptId ||
          record.timestamp ||
          `line-${lineNumber}`;
        const modelUsage = usage.modelUsage;
        if (modelUsage && typeof modelUsage === "object") {
          for (const [model, counters] of Object.entries(modelUsage)) {
            const tokens = usageTotal(counters);
            if (!tokens) continue;
            const key = `${sessionId}:${promptId}:${model}`;
            const existing = exactTurns.get(key);
            if (!existing || tokens > existing.tokens) {
              exactTurns.set(key, { tokens, sessionId, file });
            }
          }
        } else {
          const tokens = usageTotal(usage);
          if (tokens) {
            const key = `${sessionId}:${promptId}:unknown`;
            const existing = exactTurns.get(key);
            if (!existing || tokens > existing.tokens) {
              exactTurns.set(key, { tokens, sessionId, file });
            }
          }
        }
      } else if (usage && !Number.isFinite(timestamp)) {
        result.confidence = "partial";
      }

      const meta = record.params?._meta;
      const turnStart = number(meta?.turnStartMs);
      const legacyTokens = number(meta?.totalTokens);
      if (turnStart && inDay(turnStart, dayStart, dayEnd) && legacyTokens) {
        const sessionId = record.params?.sessionId || record.sessionId || directorySessionId;
        const key = `${sessionId}:${turnStart}`;
        const existing = legacyTurns.get(key);
        if (!existing || legacyTokens > existing.tokens) {
          legacyTurns.set(key, { tokens: legacyTokens, file });
        }
      }
    }
  }

  const exactFiles = new Set();
  for (const entry of exactTurns.values()) {
    result.tokens += entry.tokens;
    addSessionTokens(sessions, `grok:${entry.sessionId}`, entry.tokens);
    exactFiles.add(entry.file);
  }
  const estimatedFiles = new Set();
  for (const entry of legacyTurns.values()) {
    result.estimatedTokens += entry.tokens;
    estimatedFiles.add(entry.file);
  }
  result.files = exactFiles.size;
  result.estimatedFiles = estimatedFiles.size;
  result.scannedFiles = files.length;
  result.discoveredFiles = discovered.discoveredFiles;
  result.hasEstimated = result.estimatedTokens > 0;
  if (!result.tokens && result.estimatedTokens) result.confidence = "estimated";
  return result;
}

function geminiTokens(roots, dayStart, dayEnd, sessions) {
  const result = { id: "gemini", label: "Gemini CLI", tokens: 0, files: 0, confidence: "high" };
  const discovered = filesTouchedToday(
    roots,
    (file, name) =>
      name.startsWith("session-") &&
      name.endsWith(".json") &&
      file.includes(`${path.sep}chats${path.sep}`),
    dayStart
  );
  const files = discovered.files;
  const seenMessages = new Set();
  if (discovered.limitHit) result.confidence = "partial";

  for (const file of files) {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      result.confidence = "partial";
      continue;
    }
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const projectHash = path.basename(path.dirname(path.dirname(file)));
    const sessionName = path.basename(file);
    const sessionId = value.sessionId || `${projectHash}:${sessionName}`;
    let today = 0;
    for (const message of messages) {
      if (message.type !== "gemini" || !message.tokens) continue;
      const timestamp = timestampMs(message.timestamp);
      if (!Number.isFinite(timestamp)) {
        result.confidence = "partial";
        continue;
      }
      if (!inDay(timestamp, dayStart, dayEnd)) continue;
      const identity = `${sessionId}:${message.id || `${message.timestamp}:${message.model || "unknown"}`}`;
      if (seenMessages.has(identity)) continue;
      seenMessages.add(identity);
      const tokens =
        number(message.tokens.total) ||
        number(message.tokens.input) +
          number(message.tokens.output) +
          number(message.tokens.thoughts);
      today += tokens;
    }
    if (today > 0) {
      addSessionTokens(sessions, `gemini:${projectHash}:${sessionName}`, today);
      result.tokens += today;
      result.files += 1;
    }
  }
  result.scannedFiles = files.length;
  result.discoveredFiles = discovered.discoveredFiles;
  return result;
}

function collectTokenUsage(now = Date.now(), options = {}) {
  const dayStart = localDayStart(now);
  const dayEnd = localDayEnd(now);

  const home = os.homedir();
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(home, ".codex");
  const claudeHome =
    options.claudeHome ||
    process.env.CLAUDE_CONFIG_DIR ||
    process.env.CLAUDE_HOME ||
    path.join(home, ".claude");
  const grokHome = options.grokHome || process.env.GROK_HOME || path.join(home, ".grok");
  const geminiHome =
    options.geminiHome ||
    process.env.GEMINI_CLI_HOME ||
    process.env.GEMINI_DIR ||
    path.join(home, ".gemini");

  const codexRoots = options.codexRoot
    ? [options.codexRoot, options.codexArchiveRoot]
    : [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")];
  const claudeRoots = [options.claudeRoot || path.join(claudeHome, "projects")];
  const grokRoots = options.grokRoot
    ? [options.grokRoot, options.grokArchiveRoot]
    : [path.join(grokHome, "sessions"), path.join(grokHome, "archived_sessions")];
  const geminiRoots = [options.geminiRoot || path.join(geminiHome, "tmp")];
  const cacheKey = JSON.stringify([codexRoots, claudeRoots, grokRoots, geminiRoots]);
  if (
    cached &&
    cached.cacheKey === cacheKey &&
    cached.dayStart === dayStart &&
    now - cached.collectedAt < CACHE_MS
  ) {
    return cached.snapshot;
  }

  const sessions = {};
  const sources = [
    codexTokens(codexRoots, dayStart, dayEnd, sessions, now),
    claudeTokens(claudeRoots, dayStart, dayEnd, sessions),
    grokTokens(grokRoots, dayStart, dayEnd, sessions),
    geminiTokens(geminiRoots, dayStart, dayEnd, sessions),
  ].filter(
    (source) =>
      source.files > 0 ||
      source.tokens > 0 ||
      Number(source.estimatedTokens || 0) > 0 ||
      Boolean(source.rateLimit)
  );
  const snapshot = {
    dayStart,
    dayEnd,
    tokens: sources.reduce((sum, source) => sum + source.tokens, 0),
    estimatedTokens: sources.reduce((sum, source) => sum + Number(source.estimatedTokens || 0), 0),
    sources,
    sessions,
    rateLimit: sources.find((source) => source.id === "codex")?.rateLimit || null,
    supportedRuntimes: ["codex", "claude-code", "grok", "gemini"],
    unsupportedReasons: {
      cursor: "Cursor 本机 Session 未暴露完整实际 usage；不按文本或稀疏私有字段估算",
      "claude-desktop": "Claude Desktop 本机记录未提供可核对的完整 usage",
    },
    collectedAt: now,
  };
  cached = { cacheKey, dayStart, collectedAt: now, snapshot };
  return snapshot;
}

module.exports = { collectTokenUsage, localDayStart, localDayEnd };
