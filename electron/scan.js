const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { collectTokenUsage } = require("./tokens");

const cwdCache = new Map();

function home() {
  return os.homedir();
}

function expand(p) {
  if (!p) return p;
  return p.replace(/^~(?=$|\/)/, home());
}

function exists(p) {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
}

function statMtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function walkFiles(root, pred, acc = [], depth = 0) {
  if (!exists(root) || depth > 8 || acc.length > 4000) return acc;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) walkFiles(full, pred, acc, depth + 1);
    else if (pred(full, ent.name)) acc.push(full);
  }
  return acc;
}

function snapshotProcesses() {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,comm=,args="], {
      encoding: "utf8",
      timeout: 2000,
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
        if (!m) return null;
        return { pid: Number(m[1]), comm: m[2], args: m[3] };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROCESS_BLOCKLIST = [
  "CursorUIViewService",
  "AMPDevices",
  "AMPDeviceDiscovery",
  "Codex Framework",
  "crashpad",
  "TextInputUI",
];

function isOnline(procs, needles) {
  if (!needles || !needles.length) return false;
  return procs.some((p) => {
    const hay = `${p.comm} ${p.args}`;
    if (PROCESS_BLOCKLIST.some((b) => hay.includes(b))) return false;
    if (/\bbuiltin export PATH\b/.test(hay)) return false;
    return needles.some((n) => {
      if (!n) return false;
      const token = new RegExp(`(?:^|[\\s\\/\\\\])${escapeRe(n)}(?:[\\s:]|$)`, "i");
      if (token.test(p.comm)) return true;
      if (hay.includes(`/Applications/${n}.app`)) return true;
      const first = (p.args || "").split(" ").slice(0, 2).join(" ");
      const bin = new RegExp(`(?:^|[\\s])(?:[^\\s]*\\/)?${escapeRe(n)}(?:\\s|$)`, "i");
      return bin.test(first);
    });
  });
}

function reconstructHyphenPath(encoded) {
  const raw = String(encoded || "").replace(/^-/, "");
  if (!raw) return "";
  const segs = raw.split("-").filter(Boolean);
  const slashy = "/" + segs.join("/");
  if (exists(slashy)) return slashy;
  if (segs.length >= 2) {
    const dotted = "/" + segs.slice(0, -1).join("/") + "." + segs[segs.length - 1];
    if (exists(dotted)) return dotted;
    const dashed = "/" + segs.slice(0, -1).join("/") + "-" + segs[segs.length - 1];
    if (exists(dashed)) return dashed;
  }
  return slashy;
}

function readJsonlCwd(file, maxLines = 40) {
  if (cwdCache.has(file)) return cwdCache.get(file);
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(512 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const text = buf.slice(0, n).toString("utf8");
    const lines = text.split("\n").filter(Boolean).slice(0, maxLines);
    for (const line of lines) {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const cwd =
        o.cwd ||
        (o.payload && o.payload.cwd) ||
        (o.message && o.message.cwd) ||
        o.gitBranch && o.cwd;
      if (typeof cwd === "string" && cwd.startsWith("/")) {
        cwdCache.set(file, cwd);
        return cwd;
      }
    }
  } catch {
    /* ignore */
  }
  cwdCache.set(file, "");
  return "";
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonlTail(file, maxBytes = 256 * 1024, maxRecords = 80) {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    let text = buffer.toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return text
      .split("\n")
      .filter(Boolean)
      .slice(-maxRecords)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function messageParts(record) {
  const content = record && record.message && record.message.content;
  return Array.isArray(content) ? content : [];
}

function activity(status, label, reason, activityAt, confidence = "medium") {
  return { status, label, reason, activityAt: activityAt || 0, confidence };
}

function classify({ mtime, online, now, workingWindowMs }) {
  if (!online) return activity("offline", "未运行", "没有发现对应 Runtime 进程", mtime, "high");
  if (now - mtime <= workingWindowMs) {
    return activity("working", "活动中", "Session 数据刚刚更新", mtime, "medium");
  }
  return activity("idle", "闲置", "Runtime 在运行，但此 Session 没有近期活动", mtime, "medium");
}

function inferJsonlActivity(runtime, file, { online, now, workingWindowMs }) {
  const mtime = statMtime(file);
  if (!online) return classify({ mtime, online, now, workingWindowMs });
  const age = now - mtime;
  const recentSessionMs = 30 * 60 * 1000;
  const pendingTurnMs = 6 * 60 * 60 * 1000;
  if (age > pendingTurnMs) {
    return activity("idle", "闲置", "Runtime 在运行，但此 Session 已停止活动", mtime, "medium");
  }
  const records = readJsonlTail(file);
  if (!records.length) return classify({ mtime, online, now, workingWindowMs });

  if (runtime === "codex") {
    let lifecycle = "";
    let lifecycleIndex = -1;
    records.forEach((record, index) => {
      const type = record && record.payload && record.payload.type;
      if (type === "task_started" || type === "task_complete" || type === "turn_aborted") {
        lifecycle = type;
        lifecycleIndex = index;
      }
    });
    if (lifecycle === "task_started" && age <= pendingTurnMs) {
      return activity("working", "执行中", "Codex turn 已开始，尚未记录完成事件", mtime, "high");
    }
    if ((lifecycle === "task_complete" || lifecycle === "turn_aborted") && age <= recentSessionMs) {
      return activity("waiting", "等你", "Codex 已完成最近一轮", mtime, "high");
    }
    const afterLifecycle = records.slice(lifecycleIndex + 1);
    if (
      age <= pendingTurnMs &&
      afterLifecycle.some(
        (record) =>
          record.type === "response_item" &&
          ["function_call", "custom_tool_call", "function_call_output", "custom_tool_call_output"].includes(
            record.payload && record.payload.type
          )
      )
    ) {
      return activity("working", "调用工具", "Codex 最近事件是工具调用", mtime, "high");
    }
  }

  const last = records[records.length - 1];
  const parts = messageParts(last);
  const partTypes = parts.map((part) => part && part.type).filter(Boolean);
  const hasToolUse = partTypes.includes("tool_use");
  const hasToolResult = partTypes.includes("tool_result");
  const hasThinking = partTypes.includes("thinking");
  const hasText = partTypes.includes("text");
  const role = last.role || last.type;

  if (runtime === "cursor") {
    if (last.type === "turn_ended" && age <= recentSessionMs) {
      return activity("waiting", "等你", "Cursor 已完成最近一轮", mtime, "high");
    }
    if (age <= pendingTurnMs && (hasToolUse || hasToolResult)) {
      return activity("working", hasToolUse ? "调用工具" : "处理结果", "Cursor turn 尚未结束", mtime, "high");
    }
    if (age <= pendingTurnMs && role === "user") {
      return activity("working", "正在响应", "收到用户消息，尚未记录 turn 结束", mtime, "high");
    }
    if (age <= recentSessionMs && role === "assistant" && hasText && !hasToolUse) {
      return activity("waiting", "等你", "Cursor 最近一轮已给出回复", mtime, "medium");
    }
  }

  if (runtime === "claude-code" || runtime === "claude-desktop") {
    if (age <= pendingTurnMs && (hasToolUse || hasToolResult || hasThinking)) {
      return activity(
        "working",
        hasToolUse ? "调用工具" : hasThinking ? "思考中" : "处理结果",
        "Claude 最近事件仍在一个执行链中",
        mtime,
        "high"
      );
    }
    if (age <= pendingTurnMs && last.type === "user") {
      return activity("working", "正在响应", "Claude 已收到新消息", mtime, "medium");
    }
    if (age <= recentSessionMs && (last.type === "last-prompt" || (last.type === "assistant" && hasText))) {
      return activity("waiting", "等你", "Claude 最近一轮已完成", mtime, "medium");
    }
  }

  if (age <= workingWindowMs) {
    return activity("working", "活动中", `${runtime} Session 数据刚刚更新`, mtime, "medium");
  }
  if (age <= recentSessionMs) {
    return activity("waiting", "等你", "最近使用过，当前没有执行事件", mtime, "low");
  }
  return activity("idle", "闲置", "Runtime 在运行，但此 Session 已停止活动", mtime, "medium");
}

function session({
  runtime,
  label,
  id,
  cwd,
  file,
  mtime,
  online,
  now,
  workingWindowMs,
  title,
  activityHint,
}) {
  const state = activityHint || classify({ mtime, online, now, workingWindowMs });
  return {
    id: `${runtime}:${id}`,
    runtime,
    label,
    cwd: cwd || "",
    cwdName: cwd ? path.basename(cwd) : "未知目录",
    file: file || "",
    mtime: mtime || 0,
    status: state.status,
    statusText: state.label,
    statusReason: state.reason,
    statusConfidence: state.confidence,
    activityAt: state.activityAt || mtime || 0,
    title: title || "",
  };
}

function detectCursor({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = path.join(home(), ".cursor", "projects");
  if (!exists(root)) return [];
  const out = [];
  for (const project of fs.readdirSync(root)) {
    if (project === "empty-window" || project.startsWith(".")) continue;
    const projectDir = path.join(root, project);
    const transcripts = path.join(projectDir, "agent-transcripts");
    let cwd = "";
    const termDir = path.join(projectDir, "terminals");
    if (exists(termDir)) {
      for (const f of fs.readdirSync(termDir)) {
        if (!f.endsWith(".txt")) continue;
        try {
          const head = fs.readFileSync(path.join(termDir, f), "utf8").slice(0, 800);
          const m = head.match(/^cwd:\s*(.+)$/m);
          if (m && exists(m[1].trim())) {
            cwd = m[1].trim();
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!cwd) cwd = reconstructHyphenPath(project);
    if (!exists(transcripts)) {
      const mtime = statMtime(projectDir);
      if (mtime) {
        out.push(
          session({
            runtime: "cursor",
            label: cfg.label,
            id: project,
            cwd,
            file: projectDir,
            mtime,
            online,
            now,
            workingWindowMs,
          })
        );
      }
      continue;
    }
    for (const sid of fs.readdirSync(transcripts)) {
      const sessionDir = path.join(transcripts, sid);
      const jsonl = path.join(sessionDir, `${sid}.jsonl`);
      if (!exists(jsonl)) continue;
      const activityFiles = walkFiles(sessionDir, (file) => file.endsWith(".jsonl"))
        .sort((a, b) => statMtime(b) - statMtime(a))
        .slice(0, 12);
      const activityStates = activityFiles.map((file) => ({
        file,
        mtime: statMtime(file),
        state: inferJsonlActivity("cursor", file, { online, now, workingWindowMs }),
      }));
      const workingState = activityStates.find(({ state }) => state.status === "working");
      const newestState = activityStates[0];
      const selected = workingState || newestState;
      const mtime = newestState ? newestState.mtime : statMtime(jsonl);
      out.push(
        session({
          runtime: "cursor",
          label: cfg.label,
          id: sid,
          cwd,
          file: jsonl,
          mtime,
          online,
          now,
          workingWindowMs,
          activityHint: selected && selected.state,
        })
      );
    }
  }
  return out;
}

function detectClaudeCode({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = expand(process.env.CLAUDE_HOME || path.join(home(), ".claude", "projects"));
  if (!exists(root)) return [];
  const out = [];
  for (const project of fs.readdirSync(root)) {
    const dir = path.join(root, project);
    if (!fs.statSync(dir).isDirectory()) continue;
    const cwdGuess = reconstructHyphenPath(project);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(dir, name);
      const cwd = readJsonlCwd(file) || cwdGuess;
      out.push(
        session({
          runtime: "claude-code",
          label: cfg.label,
          id: name.replace(/\.jsonl$/, ""),
          cwd,
          file,
          mtime: statMtime(file),
          online,
          now,
          workingWindowMs,
          activityHint: inferJsonlActivity("claude-code", file, { online, now, workingWindowMs }),
        })
      );
    }
  }
  return out;
}

function detectClaudeDesktop({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = path.join(home(), "Library", "Application Support", "Claude", "local-agent-mode-sessions");
  if (!exists(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory() || name === "skills-plugin") continue;
    const files = walkFiles(dir, (p) => p.endsWith(".json") || p.endsWith(".jsonl"));
    const newest = files.sort((a, b) => statMtime(b) - statMtime(a))[0];
    const mtime = newest ? statMtime(newest) : statMtime(dir);
    const cwd = newest ? readJsonlCwd(newest) : "";
    out.push(
      session({
        runtime: "claude-desktop",
        label: cfg.label,
        id: name,
        cwd,
        file: newest || dir,
        mtime,
        online,
        now,
        workingWindowMs,
        activityHint:
          newest && newest.endsWith(".jsonl")
            ? inferJsonlActivity("claude-desktop", newest, { online, now, workingWindowMs })
            : undefined,
      })
    );
  }
  return out;
}

function detectCodex({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = expand(process.env.CODEX_HOME || path.join(home(), ".codex"));
  const sessions = path.join(root, "sessions");
  if (!exists(sessions)) return [];
  return walkFiles(sessions, (p) => p.endsWith(".jsonl")).map((file) => {
    const cwd = readJsonlCwd(file);
    return session({
      runtime: "codex",
      label: cfg.label,
      id: path.basename(file, ".jsonl"),
      cwd,
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
      activityHint: inferJsonlActivity("codex", file, { online, now, workingWindowMs }),
    });
  });
}

function detectGemini({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = expand(process.env.GEMINI_CLI_HOME || path.join(home(), ".gemini"));
  const tmp = path.join(root, "tmp");
  if (!exists(tmp)) return [];
  const out = [];
  for (const hash of fs.readdirSync(tmp)) {
    const chats = path.join(tmp, hash, "chats");
    if (!exists(chats)) continue;
    for (const name of fs.readdirSync(chats)) {
      const file = path.join(chats, name);
      out.push(
        session({
          runtime: "gemini",
          label: cfg.label,
          id: `${hash}:${name}`,
          cwd: "",
          file,
          mtime: statMtime(file),
          online,
          now,
          workingWindowMs,
        })
      );
    }
  }
  return out;
}

function detectOpenCode({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const data = expand(process.env.OPENCODE_DATA_HOME || path.join(home(), ".local", "share", "opencode"));
  const dbs = [];
  if (exists(data)) {
    for (const name of fs.readdirSync(data)) {
      if (name.startsWith("opencode") && name.endsWith(".db")) dbs.push(path.join(data, name));
    }
  }
  const storage = path.join(data, "storage", "session");
  if (exists(storage)) {
    return walkFiles(storage, (p) => p.endsWith(".json")).map((file) => {
      let cwd = "";
      try {
        const o = JSON.parse(fs.readFileSync(file, "utf8"));
        cwd = o.directory || o.cwd || o.path || "";
      } catch {
        /* ignore */
      }
      return session({
        runtime: "opencode",
        label: cfg.label,
        id: path.basename(file, ".json"),
        cwd,
        file,
        mtime: statMtime(file),
        online,
        now,
        workingWindowMs,
      });
    });
  }
  if (!dbs.length) return [];
  return dbs.map((file) =>
    session({
      runtime: "opencode",
      label: cfg.label,
      id: path.basename(file),
      cwd: "",
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
      title: "OpenCode database",
    })
  );
}

function detectPi({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = expand(process.env.PI_CODING_AGENT_SESSION_DIR || path.join(home(), ".pi", "agent", "sessions"));
  if (!exists(root)) return [];
  return walkFiles(root, (p) => p.endsWith(".jsonl")).map((file) => {
    const cwd = readJsonlCwd(file) || reconstructHyphenPath(path.basename(path.dirname(file)));
    return session({
      runtime: "pi",
      label: cfg.label,
      id: path.basename(file, ".jsonl"),
      cwd,
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
    });
  });
}

function detectGrok({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const grokHome = expand(process.env.GROK_HOME || path.join(home(), ".grok"));
  const root = path.join(grokHome, "sessions");
  if (!exists(root)) return [];
  const livePids = new Set(procs.map((process) => process.pid));
  const activeSessions = new Map(
    (readJson(path.join(grokHome, "active_sessions.json"), []) || [])
      .filter((item) => item && item.session_id)
      .map((item) => [item.session_id, item])
  );
  const summaries = walkFiles(root, (_file, name) => name === "summary.json")
    .sort((a, b) => statMtime(b) - statMtime(a))
    .slice(0, 120);

  return summaries.map((summaryFile) => {
    const summary = readJson(summaryFile, {}) || {};
    const sessionDir = path.dirname(summaryFile);
    const id = summary.info?.id || path.basename(sessionDir);
    const updates = path.join(sessionDir, "updates.jsonl");
    const signals = path.join(sessionDir, "signals.json");
    const mtime = Math.max(statMtime(summaryFile), statMtime(updates), statMtime(signals));
    const activeEntry = activeSessions.get(id);
    const isRegisteredActive =
      activeEntry && livePids.has(Number(activeEntry.pid)) && now - mtime <= 6 * 60 * 60 * 1000;
    let state;
    if (!online) {
      state = activity("offline", "未运行", "没有发现 Grok Build 或 Grok Bot 进程", mtime, "high");
    } else if (isRegisteredActive) {
      state = activity("working", "执行中", "Grok active_sessions 记录该 Session 正在运行", mtime, "high");
    } else if (now - mtime <= 30 * 60 * 1000) {
      state = activity("waiting", "等你", "Grok Session 最近更新，当前没有活动执行记录", mtime, "medium");
    } else {
      state = activity("idle", "闲置", "Grok Runtime 在运行，但此 Session 已停止活动", mtime, "medium");
    }
    return session({
      runtime: "grok",
      label: cfg.label,
      id,
      cwd: summary.info?.cwd || "",
      file: exists(updates) ? updates : summaryFile,
      mtime,
      online,
      now,
      workingWindowMs,
      title: summary.generated_title || "",
      activityHint: state,
    });
  });
}

function detectAider({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const files = [
    ...walkFiles(path.join(home(), ".aider"), (p, name) => name.includes("chat") && (p.endsWith(".md") || p.endsWith(".json"))),
    ...walkFiles(process.cwd(), (p, name) => name.startsWith(".aider") && name.endsWith(".yml"), [], 1),
  ];
  const root = path.join(home(), ".aider");
  if (!files.length && exists(root)) {
    return [
      session({
        runtime: "aider",
        label: cfg.label,
        id: "aider-home",
        cwd: "",
        file: root,
        mtime: statMtime(root),
        online,
        now,
        workingWindowMs,
      }),
    ];
  }
  return files.map((file) =>
    session({
      runtime: "aider",
      label: cfg.label,
      id: path.basename(file),
      cwd: path.dirname(file),
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
    })
  );
}

function detectContinue({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const roots = [
    path.join(home(), ".continue", "sessions"),
    path.join(home(), ".continue", "dev_data", "sessions"),
  ];
  const out = [];
  for (const root of roots) {
    if (!exists(root)) continue;
    for (const file of walkFiles(root, (p) => p.endsWith(".json"))) {
      out.push(
        session({
          runtime: "continue",
          label: cfg.label,
          id: path.basename(file, ".json"),
          cwd: "",
          file,
          mtime: statMtime(file),
          online,
          now,
          workingWindowMs,
        })
      );
    }
  }
  return out;
}

function detectWindsurf({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = path.join(home(), ".codeium", "windsurf");
  if (!exists(root) && !online) return [];
  const files = walkFiles(root, (p) => p.endsWith(".json") || p.endsWith(".jsonl"));
  if (!files.length && online) {
    return [
      session({
        runtime: "windsurf",
        label: cfg.label,
        id: "windsurf",
        cwd: "",
        file: root,
        mtime: Date.now(),
        online,
        now,
        workingWindowMs,
        title: "Windsurf running",
      }),
    ];
  }
  return files.slice(0, 40).map((file) =>
    session({
      runtime: "windsurf",
      label: cfg.label,
      id: path.basename(file),
      cwd: "",
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
    })
  );
}

function detectSimpleHome({ runtime, dir, globExts, now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = expand(dir);
  if (!exists(root)) {
    if (!online) return [];
    return [
      session({
        runtime,
        label: cfg.label,
        id: runtime,
        cwd: "",
        file: root,
        mtime: now,
        online,
        now,
        workingWindowMs,
        title: `${cfg.label} running`,
      }),
    ];
  }
  const files = walkFiles(root, (p) => globExts.some((ext) => p.endsWith(ext)));
  return files.slice(0, 40).map((file) =>
    session({
      runtime,
      label: cfg.label,
      id: path.basename(file),
      cwd: readJsonlCwd(file),
      file,
      mtime: statMtime(file),
      online,
      now,
      workingWindowMs,
    })
  );
}

function detectCustom(item, { now, workingWindowMs, procs }) {
  const processNames = Array.isArray(item.process) ? item.process.filter(Boolean) : [];
  const online = processNames.length ? isOnline(procs, processNames) : true;
  const globRoot = expand(item.glob || "");
  if (!globRoot) return [];
  const dir = globRoot.includes("*") ? globRoot.split("*")[0].replace(/\/$/, "") : globRoot;
  if (!exists(dir)) return [];
  const files = walkFiles(dir, (p) => {
    if (!globRoot.includes("*")) return p === globRoot || fs.statSync(p).isFile();
    const ext = path.extname(globRoot.replace(/\*/g, ""));
    return !ext || p.endsWith(ext) || p.endsWith(".jsonl") || p.endsWith(".json");
  });
  return files.slice(0, 80).map((file) => {
    const mtime = statMtime(file);
    const activityHint = processNames.length
      ? undefined
      : now - mtime <= workingWindowMs
        ? activity("working", "活动中", "未配置进程名，仅根据 Session 文件更新判断", mtime, "low")
        : activity("idle", "闲置", "未配置进程名，无法确认 Runtime 是否仍在运行", mtime, "low");
    return session({
      runtime: item.id,
      label: item.label || item.id,
      id: path.basename(file),
      cwd: readJsonlCwd(file),
      file,
      mtime,
      online,
      now,
      workingWindowMs,
      activityHint,
    });
  });
}

const BUILTIN = {
  cursor: detectCursor,
  "claude-code": detectClaudeCode,
  "claude-desktop": detectClaudeDesktop,
  codex: detectCodex,
  gemini: detectGemini,
  opencode: detectOpenCode,
  pi: detectPi,
  grok: detectGrok,
  aider: detectAider,
  continue: detectContinue,
  windsurf: detectWindsurf,
  copilot: (ctx) =>
    detectSimpleHome({
      runtime: "copilot",
      dir: path.join(home(), ".copilot"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  crush: (ctx) =>
    detectSimpleHome({
      runtime: "crush",
      dir: path.join(home(), ".local", "share", "crush"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  goose: (ctx) =>
    detectSimpleHome({
      runtime: "goose",
      dir: path.join(home(), ".local", "share", "goose"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  amp: (ctx) =>
    detectSimpleHome({
      runtime: "amp",
      dir: path.join(home(), ".amp"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  cline: (ctx) =>
    detectSimpleHome({
      runtime: "cline",
      dir: path.join(home(), ".cline"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  zed: (ctx) =>
    detectSimpleHome({
      runtime: "zed",
      dir: path.join(home(), ".local", "share", "zed"),
      globExts: [".json", ".jsonl"],
      ...ctx,
    }),
  warp: (ctx) =>
    detectSimpleHome({
      runtime: "warp",
      dir: path.join(home(), "Library", "Application Support", "dev.warp.Warp-Stable"),
      globExts: [".json", ".jsonl", ".db"],
      ...ctx,
    }),
  chatgpt: (ctx) =>
    detectSimpleHome({
      runtime: "chatgpt",
      dir: path.join(home(), "Library", "Application Support", "com.openai.chat"),
      globExts: [".json", ".jsonl", ".db"],
      ...ctx,
    }),
};

function scan(config) {
  const now = Date.now();
  const workingWindowMs = config.workingWindowMs || 25000;
  const maxOfflineAgeMs = config.maxOfflineAgeMs || 3 * 24 * 3600 * 1000;
  const maxSessions = config.maxSessions || 32;
  const maxSessionsPerRuntime = config.maxSessionsPerRuntime || 8;
  const procs = snapshotProcesses();
  let rows = [];

  for (const [id, cfg] of Object.entries(config.runtimes || {})) {
    if (!cfg || cfg.enabled === false) continue;
    const fn = BUILTIN[id];
    if (!fn) continue;
    try {
      rows.push(...fn({ now, workingWindowMs, procs, cfg: { ...cfg, id } }));
    } catch (err) {
      rows.push({
        id: `${id}:error`,
        runtime: id,
        label: cfg.label || id,
        cwd: "",
        cwdName: "",
        file: "",
        mtime: 0,
        status: "offline",
        title: String(err.message || err),
      });
    }
  }

  for (const item of config.custom || []) {
    if (!item || item.enabled === false) continue;
    try {
      rows.push(...detectCustom(item, { now, workingWindowMs, procs }));
    } catch {
      /* ignore custom errors */
    }
  }

  rows = rows.filter((row) => {
    if (row.status !== "offline") return true;
    return now - (row.mtime || 0) <= maxOfflineAgeMs;
  });

  const rank = { working: 0, waiting: 1, idle: 2, offline: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.mtime - a.mtime);
  const runtimeCounts = new Map();
  rows = rows.filter((row) => {
    const count = runtimeCounts.get(row.runtime) || 0;
    if (count >= maxSessionsPerRuntime) return false;
    runtimeCounts.set(row.runtime, count + 1);
    return true;
  });
  if (rows.length > maxSessions) rows = rows.slice(0, maxSessions);

  let tokenUsage = {
    tokens: 0,
    sources: [],
    sessions: {},
    supportedRuntimes: ["codex", "claude-code", "grok", "gemini"],
    collectedAt: now,
  };
  try {
    const collected = collectTokenUsage(now);
    const enabledRuntimes = new Set(
      Object.entries(config.runtimes || {})
        .filter(([, runtime]) => runtime && runtime.enabled !== false)
        .map(([id]) => id)
    );
    const sources = collected.sources.filter((source) => enabledRuntimes.has(source.id));
    tokenUsage = {
      ...collected,
      sources,
      tokens: sources.reduce((sum, source) => sum + source.tokens, 0),
    };
    rows = rows.map((row) => ({
      ...row,
      tokensToday: tokenUsage.sessions[row.id] || 0,
      tokenTracked: tokenUsage.supportedRuntimes.includes(row.runtime),
    }));
  } catch {
    /* Token usage is optional; Session monitoring must continue if collection fails. */
  }

  const counts = { working: 0, waiting: 0, idle: 0, offline: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const mood = counts.working > 0 ? "working" : counts.waiting + counts.idle > 0 ? "waiting" : "offline";
  return { rows, counts, mood, tokenUsage, scannedAt: now };
}

if (require.main === module) {
  const { loadConfig } = require("./config");
  console.log(JSON.stringify(scan(loadConfig()), null, 2));
}

module.exports = { scan, snapshotProcesses, isOnline, inferJsonlActivity };
