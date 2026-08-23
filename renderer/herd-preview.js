(function exposeHerdPreview(global, factory) {
  const herdMode = typeof module === "object" && module.exports
    ? require("./herd-mode")
    : global.niulaiHerdMode;
  const api = factory(herdMode);
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiHerdPreview = api;
})(typeof globalThis === "object" ? globalThis : this, function createHerdPreviewModule(HerdMode) {
  if (!HerdMode) throw new Error("herd preview requires herd-mode");
  const PREVIEW_COUNTS = [1, 8, 34];
  const DEFAULT_SKINS = [
    { id: "original", name: "原版牛来", src: "../assets/niulai-neutral-animated-v1.png" },
    { id: "skirt", name: "小裙子牛来", src: "../assets/niulai-skirt-v1.png" },
    { id: "headband", name: "头箍牛来", src: "../assets/niulai-headband-v1.png" },
    { id: "study", name: "认真学习的牛来", src: "../assets/niulai-study-v1.png" },
    { id: "backpack", name: "背书包的牛来", src: "../assets/niulai-backpack-v1.png" },
    { id: "dance", name: "跳舞的牛来", src: "../assets/niulai-dance-v1.png" },
    { id: "football", name: "踢足球的牛来", src: "../assets/niulai-football-v1.png" },
  ];
  const DEFAULT_FACE = { eyes: [[39, 21], [50, 21]], mouth: [42, 31, 15] };
  const SESSION_SEEDS = [
    { id: "preview-cursor", runtime: "Cursor", project: "niul.ai", status: "working" },
    { id: "preview-claude", runtime: "Claude Code", project: "runtime-lab", status: "working" },
    { id: "preview-codex", runtime: "Codex", project: "desktop-agent", status: "waiting" },
    { id: "grok:preview-grok", runtime: "Grok Build", project: "agent-lab", status: "waiting" },
    { id: "preview-opencode", runtime: "OpenCode", project: "playground", status: "idle" },
    { id: "preview-offline", runtime: "Pi", project: "scratch", status: "offline" },
  ];

  function normalizePreviewCount(value) {
    const number = Number(value);
    return PREVIEW_COUNTS.includes(number) ? number : 8;
  }

  function densityFor(count) {
    return HerdMode.densityFor(count);
  }

  function skinSource(skin) {
    if (typeof skin?.src === "string") return skin.src;
    return skin?.src?.waiting || skin?.src?.working || "";
  }

  function sessionActor(index, skins) {
    const seed = SESSION_SEEDS[index % SESSION_SEEDS.length];
    const round = Math.floor(index / SESSION_SEEDS.length) + 1;
    const suffix = round > 1 ? ` ${round}` : "";
    const skin = skins[(index * 5 + 1) % skins.length] || skins[0];
    const targetId = round === 1 ? seed.id : `${seed.id}-${round}`;
    return {
      id: `session:${targetId}`,
      kind: "session",
      targetId,
      label: `${seed.runtime}${suffix} · ${seed.project}`,
      shortLabel: `${seed.runtime}${suffix}`,
      caption: `这摊我盯着：${seed.runtime}${suffix} · ${seed.project}`,
      status: seed.status,
      runtimeId: seed.runtime.toLowerCase().replace(/\s+/g, "-"),
      runtimeLabel: `${seed.runtime}${suffix}`,
      project: seed.project,
      skinId: skin.id,
      skinName: skin.name,
      src: skinSource(skin),
      face: skin.face || DEFAULT_FACE,
    };
  }

  function buildPreviewActors(value, skinOptions = DEFAULT_SKINS) {
    const count = normalizePreviewCount(value);
    const skins = skinOptions.filter((skin) => skin && skin.id && skinSource(skin));
    const usableSkins = skins.length ? skins : DEFAULT_SKINS;
    const sessionCount = count === 1 ? 1 : count - 2;
    const actors = Array.from({ length: sessionCount }, (_, index) => sessionActor(index, usableSkins));
    if (count > 1) {
      actors.push({
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
      });
      actors.push({
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
      });
    }
    return actors;
  }

  function layoutPreviewActors(actors, width = 520, height = 340, selectedId = "", actorScale = 1) {
    return HerdMode.layoutHerd(actors, { width, height, selectedId, actorScale });
  }

  function routePreviewActor(actor) {
    if (!actor) return null;
    if (actor.kind === "memo") return { type: "open-memo", targetId: "memo" };
    if (actor.kind === "market") return { type: "open-market", targetId: "market" };
    return { type: "focus-session", targetId: actor.targetId };
  }

  function pointerCaptureTarget(target, stage) {
    const hit = target?.closest?.(".herd-hit");
    return hit && typeof hit.setPointerCapture === "function" ? hit : stage;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mountHerdPreview(options) {
    const stage = options.stage;
    if (!stage) throw new Error("herd preview requires a stage");
    const state = {
      count: normalizePreviewCount(options.count),
      actors: [],
      soundEnabled: options.soundEnabled !== false,
      selectedId: "",
      entryTimer: 0,
      actionTimer: 0,
      routeTimer: 0,
      clickTimes: [],
      dragging: null,
      suppressClick: false,
      actorScale: Number.isFinite(options.actorScale) ? options.actorScale : 1,
      renderId: 0,
      messages: new Map(),
    };
    const actorTimers = HerdMode.createActorTimerRegistry(window);
    const listenerAbort = new AbortController();
    const listenerOptions = { signal: listenerAbort.signal };
    const skins = (options.skins || DEFAULT_SKINS).filter((skin) => skin.id !== "old-friend");
    const root = element("div", "herd-preview");
    const toolbar = element("div", "herd-preview-toolbar");
    toolbar.setAttribute("aria-label", "牛群切片验收控制");
    const eyebrow = element("span", "herd-preview-eyebrow", "牛群切片");
    const density = element("div", "herd-density-switch");
    density.setAttribute("role", "group");
    density.setAttribute("aria-label", "预览牛群数量");
    for (const count of PREVIEW_COUNTS) {
      const button = element("button", "herd-density-button", String(count));
      button.type = "button";
      button.dataset.herdCount = String(count);
      button.setAttribute("aria-label", `预览 ${count} 头牛`);
      density.append(button);
    }
    const sound = element("button", "herd-preview-tool");
    sound.type = "button";
    sound.dataset.herdSound = "";
    const replay = element("button", "herd-preview-tool", "再来一窝");
    replay.type = "button";
    replay.dataset.herdReplay = "";
    toolbar.append(eyebrow, density, sound, replay);
    const swarm = element("div", "herd-swarm");
    swarm.setAttribute("role", "group");
    const live = element("p", "herd-live");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    if (options.showToolbar === false) toolbar.hidden = true;
    root.classList.toggle("is-runtime", options.previewMode === false);
    root.append(toolbar, swarm, live);
    stage.append(root);
    stage.dataset.herdPreview = "true";
    stage.removeAttribute("role");
    stage.removeAttribute("tabindex");

    function syncToolbar() {
      for (const button of density.querySelectorAll("[data-herd-count]")) {
        const active = Number(button.dataset.herdCount) === state.count;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
      sound.textContent = state.soundEnabled ? "声音 ×1" : "声音关";
      sound.setAttribute("aria-pressed", String(state.soundEnabled));
      sound.setAttribute("aria-label", state.soundEnabled ? "关闭群体哞声" : "打开群体哞声");
    }

    function setLive(message) {
      live.textContent = message;
      if (typeof options.onLiveSummary === "function") options.onLiveSummary(message);
    }

    function actorElement(actor) {
      return swarm.querySelector(`[data-herd-actor-id="${CSS.escape(actor.id)}"]`);
    }

    function drawActor(actor, node, renderId) {
      const canvas = node.querySelector("canvas");
      Promise.resolve(options.prepareFrame(actor.src)).then((prepared) => {
        if (state.renderId !== renderId || !node.isConnected) return;
        options.drawFrame(prepared, canvas);
        node.classList.add("is-ready");
        if (swarm.querySelectorAll(".herd-actor.is-ready").length === state.actors.length) {
          root.dataset.ready = "true";
          stage.dataset.herdReadyMs = String(Math.round(performance.now()));
          if (!stage.dataset.herdFirstReadyMs) {
            stage.dataset.herdFirstReadyMs = stage.dataset.herdReadyMs;
          }
        }
      }).catch(() => node.classList.add("is-image-error"));
    }

    function createActorNode(actor, renderId) {
      const activeMessage = state.messages.get(actor.id);
      const lifecycle = actor.lifecycle ? ` is-lifecycle-${actor.lifecycle}` : "";
      const button = element(
        "button",
        `herd-actor is-${actor.kind} is-${actor.status}${lifecycle}${activeMessage ? " is-addressing is-speaking" : ""}`
      );
      button.type = "button";
      button.dataset.herdActorId = actor.id;
      button.dataset.herdKind = actor.kind;
      button.dataset.herdSkinId = actor.skinId;
      button.style.left = `${actor.x}px`;
      button.style.top = `${actor.y}px`;
      button.style.width = `${actor.size}px`;
      button.style.height = `${actor.size}px`;
      button.style.zIndex = String(actor.zIndex);
      button.style.setProperty("--herd-rotation", `${actor.rotation}deg`);
      button.classList.toggle("is-edge-right", actor.x + actor.size > 430);
      button.setAttribute("aria-label", `${actor.caption}。单击查看，拖动全群，双击只摸这头牛`);
      const hit = element("span", "herd-hit");
      const art = element("span", "herd-cow-art");
      const canvas = element("canvas", "herd-canvas");
      canvas.width = 420;
      canvas.height = 420;
      const face = element("span", "herd-face");
      face.setAttribute("aria-hidden", "true");
      const leftEye = element("i", "herd-eye is-left");
      const rightEye = element("i", "herd-eye is-right");
      const mouth = element("i", "herd-mouth");
      mouth.append(element("b"));
      face.append(leftEye, rightEye, mouth);
      const [[leftX, leftY], [rightX, rightY]] = actor.face?.eyes || DEFAULT_FACE.eyes;
      const [mouthX, mouthY, mouthWidth] = actor.face?.mouth || DEFAULT_FACE.mouth;
      button.style.setProperty("--herd-eye-left-x", `${leftX}%`);
      button.style.setProperty("--herd-eye-left-y", `${leftY}%`);
      button.style.setProperty("--herd-eye-right-x", `${rightX}%`);
      button.style.setProperty("--herd-eye-right-y", `${rightY}%`);
      button.style.setProperty("--herd-mouth-x", `${mouthX}%`);
      button.style.setProperty("--herd-mouth-y", `${mouthY}%`);
      button.style.setProperty("--herd-mouth-width", `${mouthWidth}%`);
      art.append(canvas, face);
      const caption = element("span", "herd-caption", activeMessage?.message || actor.caption);
      const identity = element("span", "herd-identity");
      identity.append(element("i", "herd-state-dot"), element("b", "", actor.shortLabel));
      button.append(hit, art, caption, identity);
      drawActor(actor, button, renderId);
      return button;
    }

    function announceEntry({ voice = true, actorIds = null } = {}) {
      window.clearTimeout(state.entryTimer);
      root.classList.remove("is-entering", "is-introducing");
      const ids = actorIds ? new Set(actorIds) : null;
      const entering = state.actors.filter((actor) => !ids || ids.has(actor.id));
      if (!entering.length) return;
      const nodes = entering.map(actorElement).filter(Boolean);
      for (const node of nodes) node.classList.add("is-entering", "is-addressing", "is-speaking");
      if (!ids || entering.length === state.actors.length) {
        void root.offsetWidth;
        root.classList.add("is-entering", "is-introducing");
      }
      stage.dataset.groupMooCount = "0";
      setLive(`${entering.length} 头牛同时报到。每头牛只关注自己认领的对象。`);
      if (voice && state.soundEnabled && typeof options.onGroupMoo === "function") {
        options.onGroupMoo("long");
        stage.dataset.groupMooCount = "1";
      }
      state.entryTimer = window.setTimeout(() => {
        root.classList.remove("is-entering", "is-introducing");
        for (const node of nodes) node.classList.remove("is-entering", "is-addressing", "is-speaking");
      }, 4300);
    }

    function render({ introduce = true } = {}) {
      const renderId = ++state.renderId;
      delete root.dataset.ready;
      delete stage.dataset.herdReadyMs;
      state.actors = layoutPreviewActors(
        state.actors,
        520,
        340,
        state.selectedId,
        state.actorScale
      );
      swarm.replaceChildren(...state.actors.map((actor) => createActorNode(actor, renderId)));
      swarm.setAttribute("aria-label", `${state.actors.length} 头牛的牛群`);
      stage.dataset.herdCount = String(state.actors.length);
      stage.style.setProperty("--herd-density", String(densityFor(state.actors.length)));
      syncToolbar();
      if (introduce) requestAnimationFrame(() => announceEntry());
    }

    function rebuild(count, { introduce = true } = {}) {
      actorTimers.clearAll();
      state.count = normalizePreviewCount(count);
      state.actors = buildPreviewActors(state.count, skins);
      state.selectedId = state.actors[0]?.id || "";
      render({ introduce });
    }

    function announceActor(actorOrId, message, duration = 1800) {
      const actor = typeof actorOrId === "string"
        ? state.actors.find((item) => item.id === actorOrId)
        : actorOrId;
      if (!actor) return false;
      const node = actorElement(actor);
      if (!node) return false;
      state.messages.set(actor.id, { message, until: Date.now() + duration });
      node.querySelector(".herd-caption").textContent = message;
      node.classList.add("is-addressing", "is-speaking");
      setLive(message);
      actorTimers.schedule(actor.id, "speaking", () => {
        state.messages.delete(actor.id);
        const currentNode = actorElement(actor);
        currentNode?.classList.remove("is-addressing", "is-speaking");
        const currentCaption = currentNode?.querySelector(".herd-caption");
        if (currentCaption) currentCaption.textContent = actor.caption;
      }, duration);
      return true;
    }

    function routeActor(actor) {
      const route = routePreviewActor(actor);
      if (route?.type === "focus-session") {
        options.onFocusSession?.(route.targetId);
        announceActor(actor, `就看这摊：${actor.label}`);
      } else if (route?.type === "open-memo") {
        options.onOpenMemo?.();
        announceActor(actor, "你写，我替你惦记。到点我叫你。");
      } else if (route?.type === "open-market") {
        options.onOpenMarket?.();
        announceActor(actor, "大盘这边有风吹草动，我先看。");
      }
    }

    function petActor(actor) {
      const node = actorElement(actor);
      if (!node) return;
      node.classList.remove("is-petted");
      void node.offsetWidth;
      node.classList.add("is-petted");
      announceActor(actor, "只摸我？行，手法还可以。", 1500);
      options.onSingleMoo?.("short");
      actorTimers.schedule(actor.id, "petted", () => node.classList.remove("is-petted"), 740);
    }

    function registerClick() {
      const now = Date.now();
      state.clickTimes = state.clickTimes.filter((time) => now - time < 1600);
      state.clickTimes.push(now);
      if (state.clickTimes.length < 5) return false;
      state.clickTimes = [];
      window.clearTimeout(state.routeTimer);
      options.onMarathonToggle?.();
      return true;
    }

    function roll() {
      const available = skins.length ? skins : DEFAULT_SKINS;
      const rolled = HerdMode.rollHerd({
        actors: state.actors,
        skinMemory: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.skinId])),
        revision: 0,
      }, available);
      state.actors = rolled.actors;
      render({ introduce: false });
      options.onActorsChange?.(state.actors.map((actor) => ({ ...actor })), { type: "roll" });
      root.classList.remove("is-rolling");
      void root.offsetWidth;
      root.classList.add("is-rolling");
      setLive(`Session 牛重新抽了造型；牛记牛、大盘牛和绑定关系都没变。`);
      window.setTimeout(() => root.classList.remove("is-rolling"), 720);
    }

    function setMarathon(running) {
      root.classList.toggle("is-marathon", Boolean(running));
    }

    function setSound(enabled) {
      state.soundEnabled = Boolean(enabled);
      syncToolbar();
    }

    function setActorScale(value) {
      const next = Number.isFinite(Number(value))
        ? Math.max(0.7, Math.min(1.3, Number(value)))
        : 1;
      if (next === state.actorScale) return false;
      state.actorScale = next;
      render({ introduce: false });
      requestAnimationFrame(() => options.onLayoutChange?.());
      return true;
    }

    function announceGroup(message, duration = 1800) {
      window.clearTimeout(state.actionTimer);
      root.classList.add("is-group-speaking");
      setLive(message);
      state.actionTimer = window.setTimeout(() => root.classList.remove("is-group-speaking"), duration);
    }

    function actorViewKey(actors) {
      return JSON.stringify(actors.map((actor) => [
        actor.id,
        actor.kind,
        actor.targetId,
        actor.label,
        actor.shortLabel,
        actor.caption,
        actor.status,
        actor.lifecycle,
        actor.skinId,
        actor.src,
      ]));
    }

    function updateActors(nextActors, { introducedIds = [], announce = true } = {}) {
      const incoming = Array.isArray(nextActors) ? nextActors : [];
      const incomingIds = new Set(incoming.map((actor) => actor.id));
      for (const actor of state.actors) {
        if (incomingIds.has(actor.id)) continue;
        actorTimers.clearActor(actor.id);
        state.messages.delete(actor.id);
      }
      const changed = actorViewKey(incoming) !== actorViewKey(state.actors);
      state.actors = incoming;
      if (!incomingIds.has(state.selectedId)) state.selectedId = incoming[0]?.id || "";
      if (changed) render({ introduce: false });
      if (announce && introducedIds.length) {
        requestAnimationFrame(() => announceEntry({ actorIds: introducedIds }));
      }
      return changed;
    }

    toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
    toolbar.addEventListener("click", (event) => {
      event.stopPropagation();
      const countButton = event.target.closest("button[data-herd-count]");
      if (countButton) {
        rebuild(Number(countButton.dataset.herdCount));
        options.onCountChange?.(state.count);
        return;
      }
      if (event.target.closest("[data-herd-sound]")) {
        state.soundEnabled = !state.soundEnabled;
        options.onSoundChange?.(state.soundEnabled);
        syncToolbar();
        setLive(state.soundEnabled ? "群体哞声已打开；报到时只响一层。" : "群体哞声已关闭；职责文字仍保留。");
        return;
      }
      if (event.target.closest("[data-herd-replay]")) announceEntry();
    });

    swarm.addEventListener("focusin", (event) => {
      const actor = event.target.closest("[data-herd-actor-id]");
      if (!actor) return;
      state.selectedId = actor.dataset.herdActorId;
      actor.classList.add("is-selected");
    });
    swarm.addEventListener("focusout", (event) => {
      event.target.closest("[data-herd-actor-id]")?.classList.remove("is-selected");
    });
    swarm.addEventListener("click", (event) => {
      if (state.suppressClick) return;
      const node = event.target.closest("[data-herd-actor-id]");
      if (!node || registerClick()) return;
      const actor = state.actors.find((item) => item.id === node.dataset.herdActorId);
      if (!actor) return;
      state.selectedId = actor.id;
      window.clearTimeout(state.routeTimer);
      if (event.detail > 1) return;
      state.routeTimer = window.setTimeout(() => routeActor(actor), 230);
    });
    swarm.addEventListener("dblclick", (event) => {
      if (state.suppressClick) return;
      event.preventDefault();
      window.clearTimeout(state.routeTimer);
      const node = event.target.closest("[data-herd-actor-id]");
      const actor = state.actors.find((item) => item.id === node?.dataset.herdActorId);
      if (actor) petActor(actor);
    });
    swarm.addEventListener("keydown", (event) => {
      const node = event.target.closest("[data-herd-actor-id]");
      if (!node) return;
      const currentIndex = state.actors.findIndex((item) => item.id === node.dataset.herdActorId);
      if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? state.actors.length - 1 : (currentIndex + delta + state.actors.length) % state.actors.length;
        actorElement(state.actors[nextIndex])?.focus();
      } else if ((event.key === "Enter" || event.key === " ") && event.shiftKey) {
        event.preventDefault();
        const actor = state.actors[currentIndex];
        if (actor) petActor(actor);
      }
    });

    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".herd-preview-toolbar")) return;
      options.onArmAudio?.();
      const captureTarget = pointerCaptureTarget(event.target, stage);
      state.dragging = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        captureTarget,
        moved: false,
      };
      // Keep a simple click captured by the cow that was actually hit. Capturing
      // it on the whole stage retargets the eventual click to the stage and eats
      // the cow's Session route, while the same capture still supports group drag.
      captureTarget.setPointerCapture?.(event.pointerId);
    }, listenerOptions);
    stage.addEventListener("pointermove", (event) => {
      if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
      const distance = Math.hypot(event.clientX - state.dragging.clientX, event.clientY - state.dragging.clientY);
      if (!state.dragging.moved && distance > 4) {
        state.dragging.moved = true;
        root.classList.add("is-dragging");
        stage.dataset.dragState = "moving";
        options.onDragStart?.({
          originX: state.dragging.screenX,
          originY: state.dragging.screenY,
          screenX: event.screenX,
          screenY: event.screenY,
          bounds: options.getBounds?.(),
        });
      }
      if (state.dragging.moved) options.onDragMove?.(event.screenX, event.screenY, options.getBounds?.());
    }, listenerOptions);
    const finishDrag = (event) => {
      if (!state.dragging || (event?.pointerId != null && event.pointerId !== state.dragging.pointerId)) return;
      const moved = state.dragging.moved;
      const pointerId = state.dragging.pointerId;
      const captureTarget = state.dragging.captureTarget;
      state.dragging = null;
      root.classList.remove("is-dragging");
      if (moved) options.onDragEnd?.();
      if (moved) {
        stage.dataset.dragState = "ended";
        announceGroup("整群挪好啦，接着各盯各的。", 1200);
      }
      state.suppressClick = moved;
      if (captureTarget?.hasPointerCapture?.(pointerId)) {
        try { captureTarget.releasePointerCapture(pointerId); } catch { /* already released */ }
      }
      window.setTimeout(() => { state.suppressClick = false; }, 0);
    };
    stage.addEventListener("pointerup", finishDrag, listenerOptions);
    stage.addEventListener("pointercancel", finishDrag, listenerOptions);
    stage.addEventListener("lostpointercapture", finishDrag, listenerOptions);

    if (Array.isArray(options.actors)) {
      state.actors = options.actors;
      state.selectedId = state.actors[0]?.id || "";
      render({ introduce: options.introduceOnMount !== false });
    } else {
      rebuild(state.count);
    }
    return {
      get actors() { return state.actors.map((actor) => ({ ...actor })); },
      get count() { return state.count; },
      roll,
      setMarathon,
      setSound,
      setActorScale,
      announceGroup,
      announceActor,
      replayEntry: announceEntry,
      setCount: rebuild,
      updateActors,
      destroy() {
        listenerAbort.abort();
        window.clearTimeout(state.entryTimer);
        window.clearTimeout(state.actionTimer);
        window.clearTimeout(state.routeTimer);
        actorTimers.clearAll();
        root.remove();
        delete stage.dataset.herdPreview;
        delete stage.dataset.herdCount;
      },
    };
  }

  return {
    PREVIEW_COUNTS,
    buildPreviewActors,
    densityFor,
    layoutPreviewActors,
    mountHerdPreview,
    normalizePreviewCount,
    pointerCaptureTarget,
    routePreviewActor,
  };
});
