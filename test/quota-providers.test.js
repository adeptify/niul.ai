const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ClaudeQuotaProvider,
  CodexQuotaProvider,
  loadClaudeCredential,
  loadCodexCredential,
  normalizeClaudeUsage,
  normalizeCodexUsage,
} = require("../electron/quota/providers");

test("Claude normalizer keeps current base and named model windows", () => {
  const now = Date.parse("2026-08-30T00:00:00Z");
  const result = normalizeClaudeUsage(
    {
      five_hour: { utilization: 12.5, resets_at: "2026-08-30T04:00:00Z" },
      seven_day: { used_percentage: 47, resets_at: "2026-09-04T00:00:00Z" },
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 73,
          resets_at: "2026-09-03T00:00:00Z",
          scope: { model: { display_name: "Fable" } },
        },
        {
          kind: "weekly_scoped",
          group: "other",
          percent: 99,
          scope: { model: { display_name: "Not weekly" } },
        },
      ],
    },
    now
  );
  assert.deepEqual(
    result.windows.map((window) => [window.role, window.label, window.remainingPercent]),
    [
      ["five_hour", "5 小时", 87.5],
      ["seven_day", "7 天", 53],
      ["model_weekly", "Fable", 27],
    ]
  );
});

test("Claude normalizer ignores expired, unnamed, and malformed windows", () => {
  const now = Date.parse("2026-08-30T00:00:00Z");
  const result = normalizeClaudeUsage(
    {
      five_hour: { utilization: 20, resets_at: "2026-08-29T23:59:59Z" },
      seven_day: { utilization: "not-a-number" },
      limits: [{ kind: "weekly_scoped", group: "weekly", percent: 20, scope: {} }],
    },
    now
  );
  assert.deepEqual(result.windows, []);
});

test("Codex normalizer maps primary and secondary windows by duration", () => {
  const now = Date.parse("2026-08-30T00:00:00Z");
  const result = normalizeCodexUsage(
    {
      plan_type: "pro",
      rate_limit: {
        primary_window: {
          used_percent: 24,
          limit_window_seconds: 18_000,
          reset_at: (now + 2 * 60 * 60 * 1000) / 1000,
        },
        secondary_window: {
          used_percent: 61,
          limit_window_seconds: 604_800,
          reset_at: (now + 4 * 24 * 60 * 60 * 1000) / 1000,
        },
      },
    },
    now
  );
  assert.equal(result.planType, "pro");
  assert.deepEqual(
    result.windows.map((window) => [window.role, window.remainingPercent]),
    [
      ["five_hour", 76],
      ["seven_day", 39],
    ]
  );
});

test("Claude credential loader reads Keychain JSON without exposing other fields", async () => {
  const calls = [];
  const credential = await loadClaudeCredential({
    configDir: "/Users/test/.claude",
    platform: "darwin",
    account: "tester",
    execFileImpl: (_command, args, _options, callback) => {
      calls.push(args);
      callback(null, JSON.stringify({ claudeAiOauth: { accessToken: "secret", refreshToken: "hidden" } }));
    },
    readFile: () => {
      throw new Error("legacy fallback should not run");
    },
  });
  assert.deepEqual(credential, { accessToken: "secret" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("-w"));
});

test("Codex credential loader is read-only and returns only access metadata", () => {
  let reads = 0;
  const credential = loadCodexCredential({
    codexHome: "/tmp/codex-test",
    readFile: () => {
      reads += 1;
      return JSON.stringify({
        tokens: {
          access_token: "access-secret",
          refresh_token: "must-not-escape",
          account_id: "account-1",
        },
      });
    },
  });
  assert.equal(reads, 1);
  assert.deepEqual(credential, { accessToken: "access-secret", accountId: "account-1" });
});

test("quota providers send credentials only in request headers and normalize the response", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return {
      ok: true,
      json: async () =>
        url.includes("anthropic")
          ? { five_hour: { utilization: 10, resets_at: Date.now() / 1000 + 3600 } }
          : {
              rate_limit: {
                primary_window: {
                  used_percent: 20,
                  limit_window_seconds: 18_000,
                  reset_at: Date.now() / 1000 + 3600,
                },
              },
            },
    };
  };
  const claude = new ClaudeQuotaProvider({
    fetchImpl,
    credentialLoader: async () => ({ accessToken: "claude-secret" }),
  });
  const codex = new CodexQuotaProvider({
    fetchImpl,
    credentialLoader: () => ({ accessToken: "codex-secret", accountId: "account-2" }),
  });
  const [claudeResult, codexResult] = await Promise.all([
    claude.fetchQuota(),
    codex.fetchQuota(),
  ]);
  assert.equal(claudeResult.windows[0].remainingPercent, 90);
  assert.equal(codexResult.windows[0].remainingPercent, 80);
  assert.equal(seen[0].options.headers.Authorization, "Bearer claude-secret");
  assert.equal(seen[1].options.headers.Authorization, "Bearer codex-secret");
  assert.equal(seen[1].options.headers["ChatGPT-Account-Id"], "account-2");
  assert.doesNotMatch(JSON.stringify([claudeResult, codexResult]), /secret/);
});

test("provider errors never include response bodies or credentials", async () => {
  const provider = new ClaudeQuotaProvider({
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => "token=secret" }),
    credentialLoader: async () => ({ accessToken: "secret" }),
  });
  await assert.rejects(
    provider.fetchQuota(),
    (error) => error.code === "UNAUTHORIZED" && !String(error.message).includes("secret")
  );
});

test("Claude missing-credential guidance distinguishes Desktop from standalone login", async () => {
  const provider = new ClaudeQuotaProvider({
    credentialLoader: async () => null,
    fetchImpl: async () => {
      throw new Error("must not fetch without credentials");
    },
  });
  await assert.rejects(
    provider.fetchQuota(),
    (error) =>
      error.code === "NO_CREDENTIALS" &&
      /Claude Desktop 登录不共享/.test(error.message) &&
      /claude auth login/.test(error.message)
  );
});
