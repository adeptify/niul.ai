const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

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
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(16 * 1024);
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
      if (typeof cwd === "string" && cwd.startsWith("/")) return cwd;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function classify({ mtime, online, now, workingWindowMs }) {
  if (online && now - mtime <= workingWindowMs) return "working";
  if (online) return "idle";
  return "offline";
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
}) {
  const status = classify({ mtime, online, now, workingWindowMs });
  return {
    id: `${runtime}:${id}`,
    runtime,
    label,
    cwd: cwd || "",
    cwdName: cwd ? path.basename(cwd) : "未知目录",
    file: file || "",
    mtime: mtime || 0,
    status,
    title: title || "",
  };
}

function detectCursor({ now, workingWindowMs, procs, cfg }) {
  const online = isOnline(procs, cfg.process);
  const root = path.join(home(), ".cursor", "projects");
  if (!exists(root)) return [];
  const out = [];
  for (const project of fs.readdirSync(root)) {
    if (project === "empty-window") continue;
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
      const jsonl = path.join(transcripts, sid, `${sid}.jsonl`);
      if (!exists(jsonl)) continue;
      out.push(
        session({
          runtime: "cursor",
          label: cfg.label,
          id: sid,
          cwd,
          file: jsonl,
          mtime: statMtime(jsonl),
          online,
          now,
          workingWindowMs,
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
  const online = isOnline(procs, item.process || [item.id]);
  const globRoot = expand(item.glob || "");
  if (!globRoot) return [];
  const dir = globRoot.includes("*") ? globRoot.split("*")[0].replace(/\/$/, "") : globRoot;
  if (!exists(dir)) return [];
  const files = walkFiles(dir, (p) => {
    if (!globRoot.includes("*")) return p === globRoot || fs.statSync(p).isFile();
    const ext = path.extname(globRoot.replace(/\*/g, ""));
    return !ext || p.endsWith(ext) || p.endsWith(".jsonl") || p.endsWith(".json");
  });
  return files.slice(0, 80).map((file) =>
    session({
      runtime: item.id,
      label: item.label || item.id,
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

const BUILTIN = {
  cursor: detectCursor,
  "claude-code": detectClaudeCode,
  "claude-desktop": detectClaudeDesktop,
  codex: detectCodex,
  gemini: detectGemini,
  opencode: detectOpenCode,
  pi: detectPi,
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
  const maxSessions = config.maxSessions || 60;
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

  const rank = { working: 0, idle: 1, offline: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.mtime - a.mtime);
  if (rows.length > maxSessions) rows = rows.slice(0, maxSessions);

  const counts = { working: 0, idle: 0, offline: 0 };
  for (const row of rows) counts[row.status] += 1;
  const mood = counts.working > 0 ? "working" : counts.idle > 0 ? "waiting" : "offline";
  return { rows, counts, mood, scannedAt: now };
}

if (require.main === module) {
  const { loadConfig } = require("./config");
  console.log(JSON.stringify(scan(loadConfig()), null, 2));
}

module.exports = { scan, snapshotProcesses, isOnline };
