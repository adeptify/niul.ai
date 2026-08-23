(function exposeHerdMode(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiHerdMode = api;
})(typeof globalThis === "object" ? globalThis : this, function createHerdModeModule() {
  const MAX_SESSION_ACTORS = 32;
  const ACTIVE_SESSION_STATUSES = new Set(["working", "waiting", "idle"]);
  const ENTER_DURATION_MS = 420;
  const EXIT_DURATION_MS = 1800;
  const DEFAULT_FACE = { eyes: [[39, 21], [50, 21]], mouth: [42, 31, 15] };
  const SPECIAL_ACTORS = {
    memo: {
      id: "memo",
      kind: "memo",
      targetId: "memo",
      label: "牛记",
      shortLabel: "牛记",
      caption: "你记，我惦记：牛记",
      status: "memo",
      skinId: "memo",
      skinName: "牛记牛",
      src: "../assets/niulai-memo-v1.png",
      face: DEFAULT_FACE,
    },
    market: {
      id: "market",
      kind: "market",
      targetId: "market",
      label: "大盘",
      shortLabel: "大盘",
      caption: "风吹草动我先看：大盘",
      status: "market",
      skinId: "market",
      skinName: "大盘牛",
      src: "../assets/niulai-market-v1.png",
      face: DEFAULT_FACE,
    },
  };

  function densityFor(count) {
    if (count <= 4) return 1;
    if (count <= 8) return 0.82;
    if (count <= 16) return 0.65;
    return 0.5;
  }

  function skinSource(skin, status = "waiting") {
    if (typeof skin?.src === "string") return skin.src;
    return skin?.src?.[status] || skin?.src?.waiting || skin?.src?.working || "";
  }

  function usableSkins(skins) {
    return (Array.isArray(skins) ? skins : []).filter(
      (skin) => skin && skin.id && skin.id !== "old-friend" && skinSource(skin)
    );
  }

  function normalizeRandom(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(0.999999999, number));
  }

  function chooseSkin(skins, random = Math.random, currentSkinId = "", preferredSkinId = "") {
    const available = usableSkins(skins);
    if (!available.length) return null;
    if (preferredSkinId) {
      const preferred = available.find((skin) => skin.id === preferredSkinId);
      if (preferred) return preferred;
    }
    const pool = currentSkinId
      ? available.filter((skin) => skin.id !== currentSkinId)
      : available;
    const choices = pool.length ? pool : available;
    return choices[Math.floor(normalizeRandom(random()) * choices.length)] || choices[0];
  }

  function actorIdFor(kind, targetId) {
    if (kind === "memo" || kind === "market") return kind;
    return `session:${String(targetId)}`;
  }

  function baseExpression(status = "idle") {
    return {
      mood: status,
      message: "",
      speaking: false,
      petted: false,
      revision: 0,
      messageUntil: null,
      petUntil: null,
    };
  }

  function createEmptyHerdState() {
    return {
      actors: [],
      skinMemory: {},
      revision: 0,
      reconciledAt: 0,
      transitions: { entered: [], updated: [], exiting: [], removed: [] },
    };
  }

  function sessionTarget(row) {
    const targetId = String(row.id);
    const runtimeLabel = row.runtimeLabel || row.runtime || "Session";
    const project = row.project || row.cwdName || row.cwd || "未命名任务";
    const label = row.label || `${runtimeLabel} · ${project}`;
    return {
      ...row,
      id: actorIdFor("session", targetId),
      kind: "session",
      targetId,
      label,
      shortLabel: row.shortLabel || runtimeLabel,
      caption: row.caption || `这摊我盯着：${label}`,
      runtimeLabel,
      project,
    };
  }

  function desiredTargets(snapshot = {}) {
    const sessions = (Array.isArray(snapshot.sessions) ? snapshot.sessions : [])
      .filter((row) => row && row.id != null && ACTIVE_SESSION_STATUSES.has(row.status))
      .slice(0, MAX_SESSION_ACTORS)
      .map(sessionTarget);
    if (snapshot.memo !== false) {
      sessions.push({
        ...SPECIAL_ACTORS.memo,
        ...(snapshot.memo || {}),
        id: "memo",
        kind: "memo",
        targetId: "memo",
      });
    }
    if (snapshot.market) {
      sessions.push({
        ...SPECIAL_ACTORS.market,
        ...(snapshot.market === true ? {} : snapshot.market),
        id: "market",
        kind: "market",
        targetId: "market",
      });
    }
    return sessions;
  }

  function copySkin(actor, skin) {
    if (!skin) return actor;
    return {
      ...actor,
      skinId: skin.id,
      skinName: skin.name || skin.id,
      src: skinSource(skin, actor.status),
      face: skin.face || DEFAULT_FACE,
    };
  }

  function createSessionActor(target, skin, now) {
    return copySkin({
      ...target,
      lifecycle: "entering",
      lifecycleSince: now,
      exitAt: null,
      expression: baseExpression(target.status),
    }, skin);
  }

  function createSpecialActor(target, now) {
    return {
      ...target,
      lifecycle: "entering",
      lifecycleSince: now,
      exitAt: null,
      expression: baseExpression(target.status),
    };
  }

  function actorChanged(previous, next) {
    return [
      "status",
      "label",
      "shortLabel",
      "caption",
      "runtimeId",
      "runtimeLabel",
      "project",
      "skinId",
      "lifecycle",
    ].some((key) => previous?.[key] !== next?.[key]);
  }

  function reconcileHerd(snapshot, previousState = createEmptyHerdState(), options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const random = typeof options.random === "function" ? options.random : Math.random;
    const skins = usableSkins(options.skins);
    const enterDuration = Number.isFinite(options.enterDuration)
      ? Math.max(0, options.enterDuration)
      : ENTER_DURATION_MS;
    const exitDuration = Number.isFinite(options.exitDuration)
      ? Math.max(0, options.exitDuration)
      : EXIT_DURATION_MS;
    const previousActors = new Map((previousState.actors || []).map((actor) => [actor.id, actor]));
    const nextMemory = { ...(previousState.skinMemory || {}) };
    const nextActors = [];
    const entered = [];
    const updated = [];
    const exiting = [];
    const removed = [];
    const desiredIds = new Set();

    for (const target of desiredTargets(snapshot)) {
      const id = target.id || actorIdFor(target.kind, target.targetId);
      desiredIds.add(id);
      const previous = previousActors.get(id);
      if (target.kind !== "session") {
        const actor = previous
          ? {
              ...previous,
              ...target,
              lifecycle: previous.lifecycle === "entering" && now - previous.lifecycleSince < enterDuration
                ? "entering"
                : "active",
              exitAt: null,
              expression: previous.expression || baseExpression(target.status),
            }
          : createSpecialActor({ ...target, id }, now);
        nextActors.push(actor);
        if (!previous) entered.push(id);
        else if (actorChanged(previous, actor)) updated.push(id);
        continue;
      }

      let skinId = target.skinId || previous?.skinId || nextMemory[id] || "";
      let skin = skins.find((item) => item.id === skinId) || null;
      if (!skin) skin = chooseSkin(skins, random, "", skinId);
      if (skin) {
        skinId = skin.id;
        nextMemory[id] = skin.id;
      }
      const lifecycle = previous
        ? previous.lifecycle === "entering" && now - previous.lifecycleSince < enterDuration
          ? "entering"
          : "active"
        : "entering";
      const actor = previous
        ? copySkin({
            ...previous,
            ...target,
            id,
            lifecycle,
            lifecycleSince: lifecycle === previous.lifecycle ? previous.lifecycleSince : now,
            exitAt: null,
            expression: previous.expression || baseExpression(target.status),
          }, skin)
        : createSessionActor({ ...target, id }, skin, now);
      nextActors.push(actor);
      if (!previous) entered.push(id);
      else if (actorChanged(previous, actor)) updated.push(id);
    }

    for (const previous of previousActors.values()) {
      if (desiredIds.has(previous.id)) continue;
      const shouldExit = previous.lifecycle !== "exiting";
      const exitAt = shouldExit ? now + exitDuration : previous.exitAt;
      if (exitAt != null && now >= exitAt) {
        removed.push(previous.id);
        continue;
      }
      const actor = {
        ...previous,
        status: previous.kind === "session" ? "offline" : previous.status,
        lifecycle: "exiting",
        lifecycleSince: shouldExit ? now : previous.lifecycleSince,
        exitAt,
      };
      nextActors.push(actor);
      if (shouldExit) exiting.push(previous.id);
    }

    return {
      actors: nextActors,
      skinMemory: nextMemory,
      revision: (previousState.revision || 0) + 1,
      reconciledAt: now,
      transitions: { entered, updated, exiting, removed },
    };
  }

  function layoutHerd(actors, options = {}) {
    const width = Number.isFinite(options.width) ? options.width : 520;
    const height = Number.isFinite(options.height) ? options.height : 340;
    const actorScale = Number.isFinite(options.actorScale)
      ? Math.max(0.7, Math.min(1.3, options.actorScale))
      : 1;
    const selectedId = options.selectedId || "";
    const count = actors.length;
    if (!count) return [];
    const scale = densityFor(count);
    const topInset = count > 1 ? 32 : 0;
    const contentHeight = height - topInset;
    const size = Math.min(Math.round(220 * scale * actorScale), width, contentHeight);
    const columns = count === 1 ? 1 : count <= 4 ? count : count <= 8 ? 4 : count <= 16 ? 4 : 9;
    const rows = Math.ceil(count / columns);
    const xStep = columns > 1 ? (width - size) / (columns - 1) : 0;
    const yStep = rows > 1 ? (contentHeight - size) / (rows - 1) : 0;
    const lastRowCount = count - columns * (rows - 1);
    return actors.map((actor, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowCount = row === rows - 1 ? lastRowCount : columns;
      const rowWidth = size + Math.max(0, rowCount - 1) * xStep;
      const rowOffset = Math.max(0, (width - rowWidth) / 2);
      const jitterX = count === 1 ? 0 : ((index * 17) % 7) - 3;
      const jitterY = count <= 8 ? (index % 2 ? 2 : -2) : ((index * 11) % 7) - 3;
      const rawX = (columns === 1 ? (width - size) / 2 : rowOffset + column * xStep) + jitterX;
      const rawY = topInset + (rows === 1 ? (contentHeight - size) / 2 : row * yStep) + jitterY;
      const zIndex = actor.id === selectedId ? 1000 : 10 + row * columns + column;
      return {
        ...actor,
        layout: {
          x: Math.round(Math.max(0, Math.min(width - size, rawX))),
          y: Math.round(Math.max(topInset, Math.min(height - size, rawY))),
          size,
          scale,
          actorScale,
          rotation: Number((((index * 7) % 9) - 4).toFixed(2)),
          zIndex,
          exposedEdge: columns > 1 ? Math.max(0, Math.round(xStep)) : size,
        },
        x: Math.round(Math.max(0, Math.min(width - size, rawX))),
        y: Math.round(Math.max(topInset, Math.min(height - size, rawY))),
        size,
        scale,
        actorScale,
        rotation: Number((((index * 7) % 9) - 4).toFixed(2)),
        zIndex,
      };
    });
  }

  function updateActorEffect(state, actorId, effect = {}, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : 0;
    let changed = false;
    const actors = (state.actors || []).map((actor) => {
      if (actor.id !== actorId) return actor;
      changed = true;
      const previous = actor.expression || baseExpression(actor.status);
      const next = {
        ...previous,
        ...effect,
        revision: (previous.revision || 0) + 1,
      };
      if (Object.hasOwn(effect, "message") || Object.hasOwn(effect, "speaking")) {
        next.messageUntil = duration > 0 ? now + duration : null;
      }
      if (Object.hasOwn(effect, "petted")) {
        next.petUntil = duration > 0 ? now + duration : null;
      }
      return { ...actor, expression: next };
    });
    return changed ? { ...state, actors, revision: (state.revision || 0) + 1 } : state;
  }

  function expireActorEffects(state, now = Date.now()) {
    let changed = false;
    const actors = (state.actors || []).map((actor) => {
      const expression = actor.expression || baseExpression(actor.status);
      let next = expression;
      if (expression.messageUntil != null && now >= expression.messageUntil) {
        next = { ...next, message: "", speaking: false, messageUntil: null };
      }
      if (expression.petUntil != null && now >= expression.petUntil) {
        next = { ...next, petted: false, petUntil: null };
      }
      if (next === expression) return actor;
      changed = true;
      return { ...actor, expression: { ...next, revision: (expression.revision || 0) + 1 } };
    });
    return changed ? { ...state, actors, revision: (state.revision || 0) + 1 } : state;
  }

  function rollHerd(state, skins, options = {}) {
    const random = typeof options.random === "function" ? options.random : Math.random;
    const available = usableSkins(skins);
    if (!available.length) return state;
    const skinMemory = { ...(state.skinMemory || {}) };
    const actors = (state.actors || []).map((actor) => {
      if (actor.kind !== "session") return actor;
      const skin = chooseSkin(available, random, actor.skinId);
      if (!skin) return actor;
      skinMemory[actor.id] = skin.id;
      return copySkin(actor, skin);
    });
    return { ...state, actors, skinMemory, revision: (state.revision || 0) + 1 };
  }

  function routeHerdEvent(actors, event = {}) {
    const list = Array.isArray(actors) ? actors : [];
    const actor = event.actorId
      ? list.find((item) => item.id === event.actorId)
      : list.find((item) => item.kind === event.kind && String(item.targetId) === String(event.targetId));
    if (!actor || actor.lifecycle === "exiting") return null;
    if (event.kind && actor.kind !== event.kind) return null;
    if (event.targetId != null && String(actor.targetId) !== String(event.targetId)) return null;
    return {
      actorId: actor.id,
      kind: actor.kind,
      targetId: actor.targetId,
      type: event.type || "update",
      payload: event.payload,
    };
  }

  function createActorTimerRegistry(timerApi = globalThis) {
    const timers = new Map();
    const setTimer = timerApi.setTimeout.bind(timerApi);
    const clearTimer = timerApi.clearTimeout.bind(timerApi);
    const keyFor = (actorId, effect) => `${actorId}\u0000${effect}`;
    function clear(actorId, effect) {
      const key = keyFor(actorId, effect);
      const handle = timers.get(key);
      if (handle == null) return false;
      clearTimer(handle);
      timers.delete(key);
      return true;
    }
    return {
      schedule(actorId, effect, callback, delay) {
        clear(actorId, effect);
        const key = keyFor(actorId, effect);
        const handle = setTimer(() => {
          timers.delete(key);
          callback();
        }, delay);
        timers.set(key, handle);
        return handle;
      },
      clear,
      clearActor(actorId) {
        for (const key of Array.from(timers.keys())) {
          if (!key.startsWith(`${actorId}\u0000`)) continue;
          clearTimer(timers.get(key));
          timers.delete(key);
        }
      },
      clearAll() {
        for (const handle of timers.values()) clearTimer(handle);
        timers.clear();
      },
      count(actorId) {
        if (actorId == null) return timers.size;
        let count = 0;
        for (const key of timers.keys()) if (key.startsWith(`${actorId}\u0000`)) count += 1;
        return count;
      },
    };
  }

  return {
    ACTIVE_SESSION_STATUSES,
    ENTER_DURATION_MS,
    EXIT_DURATION_MS,
    MAX_SESSION_ACTORS,
    SPECIAL_ACTORS,
    actorIdFor,
    chooseSkin,
    createActorTimerRegistry,
    createEmptyHerdState,
    densityFor,
    expireActorEffects,
    layoutHerd,
    reconcileHerd,
    rollHerd,
    routeHerdEvent,
    skinSource,
    updateActorEffect,
  };
});
