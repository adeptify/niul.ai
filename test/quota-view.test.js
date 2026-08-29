const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatResetTime,
  providerMinimum,
  quotaSummary,
  quotaTone,
  quotaUpdatedText,
} = require("../renderer/quota-view");

test("quota summary shows the tightest current window for each provider", () => {
  const now = 1_000_000;
  const snapshot = {
    status: "fresh",
    providers: [
      {
        id: "claude",
        label: "Claude",
        windows: [
          { remainingPercent: 88, resetsAt: now + 1000 },
          { remainingPercent: 53, resetsAt: now + 2000 },
        ],
      },
      {
        id: "codex",
        label: "Codex",
        windows: [{ remainingPercent: 83, resetsAt: now + 1000 }],
      },
    ],
  };
  assert.equal(providerMinimum(snapshot.providers[0], now).remainingPercent, 53);
  assert.equal(quotaSummary(snapshot, { now }), "Claude 53% · Codex 83%");
  assert.equal(quotaSummary(snapshot, { enabled: false, now }), "额度查询未开启");
});

test("quota view formats reset horizons and semantic tones", () => {
  const now = 1_000_000;
  assert.equal(formatResetTime(now + 45 * 60_000, now), "45 分钟后重置");
  assert.equal(formatResetTime(now + 2 * 3600_000 + 15 * 60_000, now), "2 小时 15 分后重置");
  assert.equal(formatResetTime(now + 3 * 86400_000 + 2 * 3600_000, now), "3 天 2 小时后重置");
  assert.equal(quotaTone(15), "critical");
  assert.equal(quotaTone(35), "low");
  assert.equal(quotaTone(75), "healthy");
});

test("quota update copy distinguishes fresh, older, and missing snapshots", () => {
  const now = 10_000_000;
  assert.equal(quotaUpdatedText({ fetchedAt: now - 20_000 }, now), "刚刚更新");
  assert.equal(quotaUpdatedText({ fetchedAt: now - 12 * 60_000 }, now), "12 分钟前更新");
  assert.equal(quotaUpdatedText({}, now), "还没有可用数据");
});
