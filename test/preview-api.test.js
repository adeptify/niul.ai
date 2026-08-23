const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPreviewApi,
  PREVIEW_CONFIG,
  PREVIEW_MARKET_SNAPSHOT,
  PREVIEW_SNAPSHOT,
} = require("../renderer/preview-api");

test("preview data preserves the production IPC shapes", async () => {
  const api = createPreviewApi();
  const [config, snapshot, market] = await Promise.all([
    api.getConfig(),
    api.scan(),
    api.getMarketSnapshot(),
  ]);
  assert.deepEqual(config, PREVIEW_CONFIG);
  assert.equal(snapshot.rows.length, PREVIEW_SNAPSHOT.rows.length);
  assert.equal(snapshot.counts.working, 2);
  assert.equal(market.quotes.length, PREVIEW_MARKET_SNAPSHOT.quotes.length);
});

test("preview memos and configuration are isolated per API instance", async () => {
  const first = createPreviewApi();
  const second = createPreviewApi();
  const memo = await first.saveMemo({ text: "记住边界" });
  assert.equal((await first.listMemos()).length, 1);
  assert.equal((await second.listMemos()).length, 0);
  await first.completeMemo(memo.id);
  assert.equal((await first.listMemos()).length, 0);
  await first.saveConfig({ ...PREVIEW_CONFIG, cowScale: 1.2 });
  assert.equal((await first.getConfig()).cowScale, 1.2);
  assert.equal((await second.getConfig()).cowScale, 1);
});
