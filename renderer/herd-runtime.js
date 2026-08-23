(function exposeHerdRuntime(global, factory) {
  const herdMode = typeof module === "object" && module.exports
    ? require("./herd-mode")
    : global.niulaiHerdMode;
  const api = factory(herdMode);
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiHerdRuntime = api;
})(typeof globalThis === "object" ? globalThis : this, function createHerdRuntimeModule(HerdMode) {
  if (!HerdMode) throw new Error("herd runtime requires herd-mode");

  function waitWhyOf(row) {
    return row?.status === "waiting" ? row.waitWhy || "next" : "";
  }

  function projectName(row) {
    return row?.project || row?.cwdName || row?.title || row?.label || "未命名 Session";
  }

  function runtimeName(row) {
    return row?.label || row?.runtimeLabel || row?.runtime || "Agent";
  }

  function sessionResponsibility(row) {
    return `这摊我盯着：${runtimeName(row)} · ${projectName(row)}`;
  }

  function sessionGoodbye(row) {
    return `${projectName(row)} 收工了，我先回棚。`;
  }

  function sessionStatusMessage(row) {
    const name = projectName(row);
    if (row?.status === "working") return `${name} 套上犁了，这摊我继续盯。`;
    if (row?.status === "waiting") {
      if (waitWhyOf(row) === "allow") return `${name} 停犁了，在等你点允许。`;
      if (waitWhyOf(row) === "choose") return `${name} 停犁了，在等你选一下。`;
      return `${name} 停犁了，正等你。`;
    }
    if (row?.status === "idle") return `${name} 去吃草了，我还在这儿。`;
    return sessionGoodbye(row);
  }

  function toSessionTarget(row) {
    return {
      ...row,
      runtimeId: row.runtime,
      runtimeLabel: runtimeName(row),
      project: projectName(row),
      label: `${runtimeName(row)} · ${projectName(row)}`,
      shortLabel: runtimeName(row),
      caption: sessionResponsibility(row),
    };
  }

  function snapshotInput(snapshot = {}, options = {}) {
    const marketEnabled = options.marketEnabled !== false;
    const marketUnavailable = options.marketStatus === "unavailable";
    return {
      sessions: (snapshot.rows || []).map(toSessionTarget),
      memo: options.memo === false
        ? false
        : {
            caption: "你记，我惦记：牛记",
            status: "memo",
          },
      market: marketEnabled
        ? {
            caption: marketUnavailable
              ? "行情暂时没回来，我还守着：大盘"
              : "风吹草动我先看：大盘",
            status: marketUnavailable ? "unavailable" : "market",
          }
        : false,
    };
  }

  function reconcileSnapshot(snapshot, previousState, options = {}) {
    const input = snapshotInput(snapshot, options);
    const next = HerdMode.reconcileHerd(input, previousState, options);
    if (!next.transitions.exiting.length) return next;
    const rows = new Map((snapshot.rows || []).map((row) => [String(row.id), row]));
    const actors = next.actors.map((actor) => {
      if (actor.kind !== "session" || actor.lifecycle !== "exiting") return actor;
      const row = rows.get(String(actor.targetId)) || actor;
      return {
        ...actor,
        caption: sessionGoodbye(row),
        expression: {
          ...(actor.expression || {}),
          message: sessionGoodbye(row),
          speaking: true,
        },
      };
    });
    return { ...next, actors };
  }

  function changedSessionRows(previousRows = [], nextRows = []) {
    const previous = new Map(
      previousRows.map((row) => [String(row.id), `${row.status}:${waitWhyOf(row)}`])
    );
    return nextRows.filter((row) => {
      const key = String(row.id);
      return previous.has(key) && previous.get(key) !== `${row.status}:${waitWhyOf(row)}`;
    });
  }

  function routeSessionEvent(actors, row, type = "status", payload = {}) {
    return HerdMode.routeHerdEvent(actors, {
      kind: "session",
      targetId: row?.id,
      type,
      payload: { row, ...payload },
    });
  }

  function routeWaitingReminder(actors, reminder) {
    if (!reminder?.id) return null;
    return HerdMode.routeHerdEvent(actors, {
      kind: "session",
      targetId: reminder.id,
      type: "waiting-reminder",
      payload: reminder,
    });
  }

  function routeMemoEvent(actors, type, payload = {}) {
    return HerdMode.routeHerdEvent(actors, {
      kind: "memo",
      targetId: "memo",
      type,
      payload,
    });
  }

  function routeMarketEvent(actors, type, payload = {}) {
    return HerdMode.routeHerdEvent(actors, {
      kind: "market",
      targetId: "market",
      type,
      payload,
    });
  }

  return {
    changedSessionRows,
    projectName,
    reconcileSnapshot,
    routeMarketEvent,
    routeMemoEvent,
    routeSessionEvent,
    routeWaitingReminder,
    runtimeName,
    sessionGoodbye,
    sessionResponsibility,
    sessionStatusMessage,
    snapshotInput,
    toSessionTarget,
    waitWhyOf,
  };
});
