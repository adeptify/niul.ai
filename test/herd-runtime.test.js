const test = require("node:test");
const assert = require("node:assert/strict");
const HerdMode = require("../renderer/herd-mode");
const HerdRuntime = require("../renderer/herd-runtime");

const SKINS = [
  { id: "a", name: "A", src: "a.png" },
  { id: "b", name: "B", src: "b.png" },
];

function row(id, status, extra = {}) {
  return {
    id,
    runtime: "codex",
    label: "Codex",
    cwdName: `project-${id}`,
    status,
    ...extra,
  };
}

function reconcile(rows, previous = HerdMode.createEmptyHerdState(), options = {}) {
  return HerdRuntime.reconcileSnapshot(
    { rows },
    previous,
    { skins: SKINS, random: () => 0, now: 1000, ...options }
  );
}

test("real scan rows create one bound actor per active Session plus the enabled special cows", () => {
  const state = reconcile([
    row("working", "working"),
    row("waiting", "waiting"),
    row("idle", "idle"),
    row("offline", "offline"),
  ]);

  assert.deepEqual(state.actors.map((actor) => actor.id), [
    "session:working",
    "session:waiting",
    "session:idle",
    "memo",
    "market",
  ]);
  assert.equal(state.actors[0].caption, "这摊我盯着：Codex · project-working");
  assert.equal(state.actors.at(-2).caption, "你记，我惦记：牛记");
  assert.equal(state.actors.at(-1).caption, "风吹草动我先看：大盘");
});

test("a first scan with no Session still leaves the enabled duty cows on watch", () => {
  const state = reconcile([], undefined, { marketStatus: "unavailable" });

  assert.deepEqual(state.actors.map((actor) => actor.id), ["memo", "market"]);
  assert.equal(state.actors[0].lifecycle, "entering");
  assert.equal(state.actors[1].status, "unavailable");
  assert.match(state.actors[1].caption, /还守着/);
});

test("offline Session says goodbye and can recover as the same cow", () => {
  const active = reconcile([row("one", "working")]);
  const skinId = active.actors.find((actor) => actor.id === "session:one").skinId;
  const offline = reconcile([row("one", "offline")], active, { now: 1600 });
  const exiting = offline.actors.find((actor) => actor.id === "session:one");

  assert.equal(exiting.lifecycle, "exiting");
  assert.equal(exiting.caption, "project-one 收工了，我先回棚。");
  assert.equal(exiting.expression.message, exiting.caption);

  const recovered = reconcile([row("one", "waiting")], offline, {
    now: 1700,
    random: () => 0.99,
  });
  const actor = recovered.actors.find((item) => item.id === "session:one");
  assert.equal(actor.lifecycle, "active");
  assert.equal(actor.skinId, skinId);
  assert.equal(actor.caption, "这摊我盯着：Codex · project-one");
});

test("status and waiting events route only to their bound Session cow", () => {
  const beforeRows = [row("a", "working"), row("b", "working")];
  const nextRows = [row("a", "waiting", { waitWhy: "allow" }), row("b", "working")];
  const state = reconcile(nextRows);
  const changes = HerdRuntime.changedSessionRows(beforeRows, nextRows);

  assert.deepEqual(changes.map((item) => item.id), ["a"]);
  assert.equal(HerdRuntime.sessionStatusMessage(changes[0]), "project-a 停犁了，在等你点允许。");
  assert.equal(HerdRuntime.routeSessionEvent(state.actors, changes[0]).actorId, "session:a");
  assert.equal(
    HerdRuntime.routeWaitingReminder(state.actors, { id: "b", text: "还在等" }).actorId,
    "session:b"
  );
  assert.equal(HerdRuntime.routeWaitingReminder(state.actors, { id: "missing" }), null);
});

test("Memo and market events cannot cross into Session cows", () => {
  const state = reconcile([row("one", "working")]);
  assert.equal(HerdRuntime.routeMemoEvent(state.actors, "saved").actorId, "memo");
  assert.equal(HerdRuntime.routeMarketEvent(state.actors, "reaction").actorId, "market");
  assert.equal(
    HerdMode.routeHerdEvent(state.actors, { kind: "memo", targetId: "market", type: "wrong" }),
    null
  );
});

test("market failure keeps the market cow and disabling market removes only that cow", () => {
  const unavailable = reconcile([row("one", "working")], undefined, {
    marketStatus: "unavailable",
  });
  const market = unavailable.actors.find((actor) => actor.id === "market");
  assert.equal(market.status, "unavailable");
  assert.match(market.caption, /行情暂时没回来/);

  const disabled = reconcile([row("one", "working")], unavailable, {
    marketEnabled: false,
    now: 1600,
  });
  assert.equal(disabled.actors.find((actor) => actor.id === "memo").lifecycle, "active");
  assert.equal(disabled.actors.find((actor) => actor.id === "session:one").lifecycle, "active");
  assert.equal(disabled.actors.find((actor) => actor.id === "market").lifecycle, "exiting");
  assert.deepEqual(disabled.transitions.exiting, ["market"]);
});
