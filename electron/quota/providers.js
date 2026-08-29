const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";

class QuotaProviderError extends Error {
  constructor(message, code, options = {}) {
    super(message, options);
    this.name = "QuotaProviderError";
    this.code = code;
  }
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    return timestampMs(Number(value));
  }
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function quotaWindow(raw, definition, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const usedPercent = percent(
    raw.utilization ?? raw.used_percentage ?? raw.used_percent ?? raw.percent
  );
  if (usedPercent === null) return null;
  const resetsAt = timestampMs(raw.resets_at ?? raw.reset_at);
  if (resetsAt && resetsAt <= now) return null;
  return {
    id: definition.id,
    role: definition.role,
    label: definition.label,
    usedPercent: Math.round(usedPercent * 10) / 10,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
    resetsAt,
  };
}

function modelWindowId(displayName) {
  const slug = String(displayName || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `model-weekly-${slug || "unknown"}`;
}

function normalizeClaudeUsage(payload, now = Date.now()) {
  const windows = [];
  const known = [
    ["five_hour", { id: "five-hour", role: "five_hour", label: "5 小时" }],
    ["seven_day", { id: "seven-day", role: "seven_day", label: "7 天" }],
  ];
  for (const [key, definition] of known) {
    const window = quotaWindow(payload?.[key], definition, now);
    if (window) windows.push(window);
  }

  const modelNames = new Set();
  for (const limit of Array.isArray(payload?.limits) ? payload.limits : []) {
    if (limit?.kind !== "weekly_scoped" || limit?.group !== "weekly") continue;
    const displayName = String(limit?.scope?.model?.display_name || "").trim();
    if (!displayName || modelNames.has(displayName.toLowerCase())) continue;
    const window = quotaWindow(
      limit,
      {
        id: modelWindowId(displayName),
        role: "model_weekly",
        label: displayName,
      },
      now
    );
    if (!window) continue;
    modelNames.add(displayName.toLowerCase());
    windows.push(window);
  }
  return {
    id: "claude",
    label: "Claude",
    planType: String(payload?.plan_type || ""),
    windows,
  };
}

function codexWindowDefinition(key, raw) {
  const seconds = Number(raw?.limit_window_seconds) || Number(raw?.window_minutes) * 60;
  if (seconds > 0 && seconds <= 6 * 60 * 60) {
    return { id: "five-hour", role: "five_hour", label: "5 小时" };
  }
  if (seconds >= 6 * 24 * 60 * 60) {
    return { id: "seven-day", role: "seven_day", label: "7 天" };
  }
  return key.startsWith("primary")
    ? { id: "five-hour", role: "five_hour", label: "5 小时" }
    : { id: "seven-day", role: "seven_day", label: "7 天" };
}

function normalizeCodexUsage(payload, now = Date.now()) {
  const limits = payload?.rate_limit || payload?.rate_limits || {};
  const sources = [
    ["primary_window", limits.primary_window],
    ["secondary_window", limits.secondary_window],
    ["primary", limits.primary],
    ["secondary", limits.secondary],
  ];
  const windows = [];
  const seen = new Set();
  for (const [key, raw] of sources) {
    if (!raw) continue;
    const definition = codexWindowDefinition(key, raw);
    if (seen.has(definition.id)) continue;
    const window = quotaWindow(raw, definition, now);
    if (!window) continue;
    seen.add(definition.id);
    windows.push(window);
  }
  return {
    id: "codex",
    label: "Codex",
    planType: String(payload?.plan_type || limits?.plan_type || ""),
    windows,
  };
}

function parseClaudeCredential(raw) {
  try {
    const value = JSON.parse(String(raw || ""));
    const accessToken = value?.claudeAiOauth?.accessToken;
    return typeof accessToken === "string" && accessToken ? { accessToken } : null;
  } catch {
    return null;
  }
}

function keychainPassword(service, account, execFileImpl = execFile) {
  return new Promise((resolve) => {
    const args = ["find-generic-password", "-s", service];
    if (account) args.push("-a", account);
    args.push("-w");
    execFileImpl(
      "security",
      args,
      { encoding: "utf8", timeout: 4_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => resolve(error ? "" : String(stdout || "").trim())
    );
  });
}

async function loadClaudeCredential({
  configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
  platform = process.platform,
  account = process.env.USER || process.env.USERNAME || "",
  execFileImpl = execFile,
  readFile = fs.readFileSync,
} = {}) {
  if (platform === "darwin") {
    const sha8 = crypto.createHash("sha256").update(String(configDir)).digest("hex").slice(0, 8);
    for (const service of [`Claude Code-credentials-${sha8}`, "Claude Code-credentials"]) {
      for (const candidateAccount of account ? [account, ""] : [""]) {
        const raw = await keychainPassword(service, candidateAccount, execFileImpl);
        const credential = parseClaudeCredential(raw);
        if (credential) return credential;
      }
    }
  }
  try {
    return parseClaudeCredential(readFile(path.join(configDir, ".credentials.json"), "utf8"));
  } catch {
    return null;
  }
}

function loadCodexCredential({
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  readFile = fs.readFileSync,
} = {}) {
  try {
    const value = JSON.parse(readFile(path.join(codexHome, "auth.json"), "utf8"));
    const tokens = value?.tokens || {};
    const accessToken = tokens.access_token || value.access_token;
    const accountId = tokens.account_id || value.account_id || "";
    if (typeof accessToken !== "string" || !accessToken) return null;
    return { accessToken, accountId: String(accountId || "") };
  } catch {
    return null;
  }
}

async function responseJson(response, providerLabel) {
  if (!response?.ok) {
    const status = Number(response?.status) || 0;
    if (status === 401 || status === 403) {
      throw new QuotaProviderError(
        `${providerLabel} 登录已过期，请重新运行对应 CLI 登录`,
        "UNAUTHORIZED"
      );
    }
    throw new QuotaProviderError(
      `${providerLabel} 额度服务返回 ${status || "异常状态"}`,
      "HTTP_ERROR"
    );
  }
  try {
    return await response.json();
  } catch (error) {
    throw new QuotaProviderError(`${providerLabel} 额度响应无法识别`, "BAD_RESPONSE", {
      cause: error,
    });
  }
}

class ClaudeQuotaProvider {
  constructor({
    fetchImpl = globalThis.fetch,
    credentialLoader = loadClaudeCredential,
    endpoint = CLAUDE_USAGE_ENDPOINT,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
    this.id = "claude";
    this.label = "Claude";
    this.fetchImpl = fetchImpl;
    this.credentialLoader = credentialLoader;
    this.endpoint = endpoint;
  }

  async fetchQuota({ signal, now = Date.now() } = {}) {
    const credential = await this.credentialLoader();
    if (!credential?.accessToken) {
      throw new QuotaProviderError(
        "未找到独立 Claude Code 登录；Claude Desktop 登录不共享，请运行 claude auth login",
        "NO_CREDENTIALS"
      );
    }
    let response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credential.accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "claude-code/2.1.0",
        },
      });
    } catch (error) {
      throw new QuotaProviderError(
        signal?.aborted ? "Claude 额度请求超时" : "无法连接 Claude 额度服务",
        signal?.aborted ? "TIMEOUT" : "NETWORK",
        { cause: error }
      );
    }
    const normalized = normalizeClaudeUsage(await responseJson(response, this.label), now);
    if (!normalized.windows.length) {
      throw new QuotaProviderError("Claude 暂未返回可用额度窗口", "BAD_RESPONSE");
    }
    return normalized;
  }
}

class CodexQuotaProvider {
  constructor({
    fetchImpl = globalThis.fetch,
    credentialLoader = loadCodexCredential,
    endpoint = CODEX_USAGE_ENDPOINT,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
    this.id = "codex";
    this.label = "Codex";
    this.fetchImpl = fetchImpl;
    this.credentialLoader = credentialLoader;
    this.endpoint = endpoint;
  }

  async fetchQuota({ signal, now = Date.now() } = {}) {
    const credential = await this.credentialLoader();
    if (!credential?.accessToken) {
      throw new QuotaProviderError("未找到 Codex 登录，请先运行 codex", "NO_CREDENTIALS");
    }
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${credential.accessToken}`,
      "OpenAI-Beta": "codex-1",
      originator: "Codex Desktop",
      "User-Agent": "codex-cli",
    };
    if (credential.accountId) headers["ChatGPT-Account-Id"] = credential.accountId;
    let response;
    try {
      response = await this.fetchImpl(this.endpoint, { signal, headers });
    } catch (error) {
      throw new QuotaProviderError(
        signal?.aborted ? "Codex 额度请求超时" : "无法连接 Codex 额度服务",
        signal?.aborted ? "TIMEOUT" : "NETWORK",
        { cause: error }
      );
    }
    const normalized = normalizeCodexUsage(await responseJson(response, this.label), now);
    if (!normalized.windows.length) {
      throw new QuotaProviderError("Codex 暂未返回可用额度窗口", "BAD_RESPONSE");
    }
    return normalized;
  }
}

module.exports = {
  CLAUDE_USAGE_ENDPOINT,
  CODEX_USAGE_ENDPOINT,
  ClaudeQuotaProvider,
  CodexQuotaProvider,
  QuotaProviderError,
  loadClaudeCredential,
  loadCodexCredential,
  normalizeClaudeUsage,
  normalizeCodexUsage,
  parseClaudeCredential,
  timestampMs,
};
