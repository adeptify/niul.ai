const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_SESSION_ACTORS,
  createActorTimerRegistry,
  createEmptyHerdState,
  densityFor,
  expireActorEffects,
  layoutHerd,
  reconcileHerd,
  rollHerd,
  routeHerdEvent,
  updateActorEffect,
} = require("../renderer/herd-mode");

const SKINS = [
  { id: "a", name: "A", src: "a.png" },
  { id: "b", name: "B", src: "b.png" },
  { id: "c", name: "C", src: "c.png" },
];

function sessions(count, status = "working") {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index + 1}`,
    runtime: index % 2 ? "Claude Code" : "Codex",
    cwdName: `project-${index + 1}`,
    status: typeof status === "function" ? status(index) : status,
  }));
}

function reconcile(snapshot, previous = createEmptyHerdState(), options = {}) {
  return reconcileHerd(snapshot, previous, {
    skins: SKINS,
    random: () => 0,
    now: 0,
    ...options,
  });
}

test("reconcile creates exact 0, 1, 8, and 34 actor sets and caps sessions at 32", () => {
  const zero = reconcile({ sessions: [], memo: false, market: false });
  const one = reconcile({ sessions: sessions(1), memo: false, market: false });
  const eight = reconcile({ sessions: sessions(6), memo: true, market: true });
  const thirtyFour = reconcile({ sessions: sessions(40), memo: true, market: true });

  assert.equal(zero.actors.length, 0);
  assert.equal(one.actors.length, 1);
  assert.equal(eight.actors.length, 8);
  assert.equal(thirtyFour.actors.length, MAX_SESSION_ACTORS + 2);
  assert.equal(thirtyFour.actors.filter((actor) => actor.kind === "session").length, 32);
  assert.equal(new Set(thirtyFour.actors.map((actor) => actor.id)).size, 34);
  assert.deepEqual(thirtyFour.actors.slice(-2).map((actor) => actor.id), ["memo", "market"]);
});

test("session identities and random skins stay stable during one run", () => {
  const first = reconcile({ sessions: sessions(1), memo: false, market: false }, undefined, {
    random: () => 0,
    now: 10,
  });
  const second = reconcile({ sessions: sessions(1, "waiting"), memo: false, market: false }, first, {
    random: () => 0.99,
    now: 600,
  });

  assert.equal(first.actors[0].id, "session:row-1");
  assert.equal(first.actors[0].skinId, "a");
  assert.equal(first.actors[0].lifecycle, "entering");
  assert.equal(second.actors[0].skinId, "a");
  assert.equal(second.actors[0].status, "waiting");
  assert.equal(second.actors[0].lifecycle, "active");
  assert.deepEqual(second.transitions.updated, ["session:row-1"]);

  const unchanged = reconcile({ sessions: sessions(1, "waiting"), memo: false, market: false }, second, {
    now: 700,
  });
  assert.deepEqual(unchanged.transitions.updated, []);
});

test("offline actors say goodbye, leave, and recover with the same cow during the run", () => {
  const first = reconcile({ sessions: sessions(1), memo: false, market: false }, undefined, {
    random: () => 0,
    now: 10,
  });
  const offline = reconcile({ sessions: sessions(1, "offline"), memo: false, market: false }, first, {
    now: 700,
  });
  assert.equal(offline.actors[0].lifecycle, "exiting");
  assert.equal(offline.actors[0].status, "offline");
  assert.equal(offline.actors[0].skinId, "a");
  assert.deepEqual(offline.transitions.exiting, ["session:row-1"]);

  const stillExiting = reconcile({ sessions: sessions(1, "offline"), memo: false, market: false }, offline, {
    now: 800,
  });
  assert.deepEqual(stillExiting.transitions.exiting, []);

  const recovered = reconcile({ sessions: sessions(1, "working"), memo: false, market: false }, offline, {
    random: () => 0.99,
    now: 900,
  });
  assert.equal(recovered.actors[0].lifecycle, "active");
  assert.equal(recovered.actors[0].skinId, "a");

  const exitingAgain = reconcile({ sessions: [], memo: false, market: false }, recovered, { now: 1000 });
  const removed = reconcile({ sessions: [], memo: false, market: false }, exitingAgain, { now: 3000 });
  assert.equal(removed.actors.length, 0);
  assert.deepEqual(removed.transitions.removed, ["session:row-1"]);
  assert.equal(removed.skinMemory["session:row-1"], "a");

  const returned = reconcile({ sessions: sessions(1), memo: false, market: false }, removed, {
    random: () => 0.99,
    now: 3100,
  });
  assert.equal(returned.actors[0].skinId, "a");
});

test("a fresh startup may assign a different random cow", () => {
  const firstRun = reconcile({ sessions: sessions(1), memo: false, market: false }, undefined, {
    random: () => 0,
  });
  const nextRun = reconcile({ sessions: sessions(1), memo: false, market: false }, undefined, {
    random: () => 0.99,
  });
  assert.equal(firstRun.actors[0].skinId, "a");
  assert.equal(nextRun.actors[0].skinId, "c");
});

test("Roll changes only Session cow skins and preserves bindings, lifecycle, and special cows", () => {
  const before = reconcile({ sessions: sessions(6), memo: true, market: true });
  const after = rollHerd(before, SKINS, { random: () => 0 });
  const beforeById = new Map(before.actors.map((actor) => [actor.id, actor]));

  for (const actor of after.actors) {
    const previous = beforeById.get(actor.id);
    assert.equal(actor.targetId, previous.targetId);
    assert.equal(actor.lifecycle, previous.lifecycle);
    if (actor.kind === "session") assert.notEqual(actor.skinId, previous.skinId);
    else assert.equal(actor.skinId, previous.skinId);
  }
});

test("per-actor effects expire independently without rewriting another cow", () => {
  const base = reconcile({ sessions: sessions(2), memo: false, market: false });
  const firstId = base.actors[0].id;
  const secondId = base.actors[1].id;
  const secondBefore = base.actors[1];
  const speaking = updateActorEffect(base, firstId, {
    message: "这摊我盯着",
    speaking: true,
  }, { now: 0, duration: 100 });
  assert.equal(speaking.actors[1], secondBefore);

  const petted = updateActorEffect(speaking, secondId, { petted: true }, { now: 0, duration: 200 });
  const expired = expireActorEffects(petted, 150);
  assert.equal(expired.actors[0].expression.speaking, false);
  assert.equal(expired.actors[0].expression.message, "");
  assert.equal(expired.actors[1].expression.petted, true);
  assert.equal(expireActorEffects(expired, 250).actors[1].expression.petted, false);
});

test("actor timer registry clears and replaces timers by actor and effect only", () => {
  let nextHandle = 1;
  const scheduled = new Map();
  const cleared = [];
  const timerApi = {
    setTimeout(callback) {
      const handle = nextHandle++;
      scheduled.set(handle, callback);
      return handle;
    },
    clearTimeout(handle) {
      cleared.push(handle);
      scheduled.delete(handle);
    },
  };
  const registry = createActorTimerRegistry(timerApi);
  registry.schedule("session:a", "speak", () => {}, 100);
  registry.schedule("session:b", "speak", () => {}, 100);
  registry.schedule("session:a", "speak", () => {}, 200);
  assert.equal(registry.count("session:a"), 1);
  assert.equal(registry.count("session:b"), 1);
  assert.deepEqual(cleared, [1]);
  registry.clearActor("session:a");
  assert.equal(registry.count("session:a"), 0);
  assert.equal(registry.count("session:b"), 1);
  registry.clearAll();
  assert.equal(registry.count(), 0);
});

test("1, 8, and 34 actor layouts stay reachable and selected cow rises to the front", () => {
  assert.equal(densityFor(1), 1);
  assert.equal(densityFor(8), 0.82);
  assert.equal(densityFor(16), 0.65);
  assert.equal(densityFor(34), 0.5);

  for (const sessionCount of [1, 6, 32]) {
    const withSpecials = sessionCount > 1;
    const state = reconcile({ sessions: sessions(sessionCount), memo: withSpecials, market: withSpecials });
    const selectedId = state.actors[Math.floor(state.actors.length / 2)].id;
    const layout = layoutHerd(state.actors, { width: 520, height: 340, selectedId });
    const topZ = Math.max(...layout.map((actor) => actor.zIndex));
    assert.equal(layout.find((actor) => actor.id === selectedId).zIndex, topZ);
    for (const actor of layout) {
      assert.ok(actor.x >= 0);
      assert.ok(actor.y >= 0);
      assert.ok(actor.x + actor.size <= 520);
      assert.ok(actor.y + actor.size <= 340);
      assert.ok(actor.layout.exposedEdge >= 35);
    }
  }
});

test("70 to 130 percent herd scaling resizes actors without pushing them outside the stage", () => {
  const state = reconcile({ sessions: sessions(32), memo: true, market: true });
  const small = layoutHerd(state.actors, { actorScale: 0.7 });
  const large = layoutHerd(state.actors, { actorScale: 1.3 });

  assert.ok(large[0].size > small[0].size);
  for (const actor of [...small, ...large]) {
    assert.ok(actor.x >= 0 && actor.y >= 0);
    assert.ok(actor.x + actor.size <= 520);
    assert.ok(actor.y + actor.size <= 340);
  }
});

test("event routing only selects the actor bound to the event target", () => {
  const state = reconcile({ sessions: sessions(2), memo: true, market: true }, undefined, { now: 1000 });
  const actor = state.actors[0];
  assert.deepEqual(routeHerdEvent(state.actors, {
    kind: "session",
    targetId: actor.targetId,
    type: "status",
    payload: { status: "waiting" },
  }), {
    actorId: actor.id,
    kind: "session",
    targetId: actor.targetId,
    type: "status",
    payload: { status: "waiting" },
  });
  assert.equal(routeHerdEvent(state.actors, {
    kind: "session",
    targetId: "another-row",
    type: "status",
  }), null);
  const exiting = reconcile({ sessions: [], memo: false, market: false }, state, { now: 1100 });
  assert.equal(routeHerdEvent(exiting.actors, { actorId: actor.id, type: "status" }), null);
});

test("special actor identity cannot be overridden by snapshot presentation fields", () => {
  const state = reconcile({
    sessions: [],
    memo: { id: "wrong", kind: "session", targetId: "wrong", label: "新版牛记" },
    market: { id: "wrong-market", kind: "session", targetId: "wrong-market" },
  });
  assert.deepEqual(state.actors.map((actor) => [actor.id, actor.kind, actor.targetId]), [
    ["memo", "memo", "memo"],
    ["market", "market", "market"],
  ]);
  assert.equal(state.actors[0].label, "新版牛记");
});
