const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPreviewActors,
  densityFor,
  layoutPreviewActors,
  normalizePreviewCount,
  pointerCaptureTarget,
  routePreviewActor,
} = require("../renderer/herd-preview");

test("builds the 1, 8, and 34 cow review densities with dedicated memo and market cows", () => {
  const one = buildPreviewActors(1);
  const eight = buildPreviewActors(8);
  const thirtyFour = buildPreviewActors(34);

  assert.equal(one.length, 1);
  assert.equal(one[0].kind, "session");
  assert.equal(eight.filter((actor) => actor.kind === "session").length, 6);
  assert.equal(eight.filter((actor) => actor.kind === "memo").length, 1);
  assert.equal(eight.filter((actor) => actor.kind === "market").length, 1);
  assert.equal(thirtyFour.filter((actor) => actor.kind === "session").length, 32);
  assert.equal(new Set(thirtyFour.map((actor) => actor.id)).size, 34);
  assert.equal(thirtyFour.at(-2).src, "../assets/niulai-memo-v1.png");
  assert.equal(thirtyFour.at(-1).src, "../assets/niulai-market-v1.png");
});

test("uses the agreed density scale and keeps every actor inside the 520 by 340 stage", () => {
  assert.equal(densityFor(1), 1);
  assert.equal(densityFor(8), 0.82);
  assert.equal(densityFor(16), 0.65);
  assert.equal(densityFor(34), 0.5);

  for (const count of [1, 8, 34]) {
    const layout = layoutPreviewActors(buildPreviewActors(count));
    assert.equal(layout.length, count);
    for (const actor of layout) {
      assert.ok(actor.x >= 0);
      assert.ok(actor.y >= 0);
      assert.ok(actor.x + actor.size <= 520);
      assert.ok(actor.y + actor.size <= 340);
    }
  }
});

test("34 cow layout overlaps while retaining exposed selectable edges", () => {
  const layout = layoutPreviewActors(buildPreviewActors(34));
  const firstRow = layout.slice(0, 9);
  for (let index = 1; index < firstRow.length; index += 1) {
    const exposedEdge = firstRow[index].x - firstRow[index - 1].x;
    assert.ok(exposedEdge > 35, `edge ${index} is exposed`);
    assert.ok(exposedEdge < firstRow[index].size, `actor ${index} overlaps its neighbor`);
  }
});

test("preview layout forwards the user herd scale while keeping the fixed stage", () => {
  const actors = buildPreviewActors(34);
  const small = layoutPreviewActors(actors, 520, 340, "", 0.7);
  const large = layoutPreviewActors(actors, 520, 340, "", 1.3);

  assert.ok(large[0].size > small[0].size);
  assert.ok(large.every((actor) => actor.x + actor.size <= 520));
  assert.ok(large.every((actor) => actor.y + actor.size <= 340));
});

test("right-edge actors can flip their readable active caption inward", () => {
  const layout = layoutPreviewActors(buildPreviewActors(34));
  assert.ok(layout.some((actor) => actor.x + actor.size > 430));
});

test("preview identities are stable and routes stay bound to actor kind", () => {
  assert.deepEqual(buildPreviewActors(34), buildPreviewActors(34));
  const actors = buildPreviewActors(8);
  assert.deepEqual(routePreviewActor(actors[0]), {
    type: "focus-session",
    targetId: actors[0].targetId,
  });
  assert.deepEqual(routePreviewActor(actors.at(-2)), { type: "open-memo", targetId: "memo" });
  assert.deepEqual(routePreviewActor(actors.at(-1)), { type: "open-market", targetId: "market" });
  assert.equal(normalizePreviewCount("34"), 34);
  assert.equal(normalizePreviewCount("999"), 8);
});

test("a cow click keeps pointer capture on its hit target so Session routing receives the click", () => {
  const hit = { setPointerCapture() {} };
  const stage = { setPointerCapture() {} };
  const target = {
    closest(selector) {
      return selector === ".herd-hit" ? hit : null;
    },
  };

  assert.equal(pointerCaptureTarget(target, stage), hit);
  assert.equal(pointerCaptureTarget({ closest: () => null }, stage), stage);
});
