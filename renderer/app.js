const STATUS_TEXT = {
  working: "工作中",
  idle: "闲着",
  offline: "不在线",
};

const COW_SRC = {
  working: "../assets/cow-working.png",
  waiting: "../assets/cow-waiting.png",
  offline: "../assets/cow-offline.png",
};

const cache = {};
let mood = "waiting";
let config;

function chromaDraw(src, canvas) {
  const ctx = canvas.getContext("2d");
  const img = cache[src] || new Image();
  const paint = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (r > 180 && b > 180 && g < 90) px[i + 3] = 0;
    }
    ctx.putImageData(data, 0, 0);
  };
  if (cache[src] && img.complete) {
    paint();
    return;
  }
  img.onload = paint;
  img.src = src;
  cache[src] = img;
}

function setCow(nextMood) {
  mood = nextMood;
  chromaDraw(COW_SRC[mood] || COW_SRC.waiting, document.getElementById("cow"));
}

function renderList(snapshot) {
  const list = document.getElementById("list");
  const summary = document.getElementById("summary");
  const { rows, counts } = snapshot;
  summary.textContent = `工作 ${counts.working} · 闲着 ${counts.idle} · 不在线 ${counts.offline}`;
  if (!rows.length) {
    list.innerHTML = `<li class="empty">还没扫到 Session。开着的 Runtime 会出现在这里。</li>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (row) => `
      <li data-id="${row.id}">
        <span class="dot ${row.status}" title="${STATUS_TEXT[row.status]}"></span>
        <span class="rt">${row.label}</span>
        <span class="cwd">${row.cwdName || "—"}
          <small>${STATUS_TEXT[row.status]} · ${row.cwd || row.file}</small>
        </span>
      </li>`
    )
    .join("");
  list.querySelectorAll("li[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const row = rows.find((r) => r.id === el.dataset.id);
      if (row) window.niulai.focusSession(row);
    });
  });
}

async function tick() {
  const snapshot = await window.niulai.scan();
  renderList(snapshot);
  setCow(snapshot.mood);
}

function fillSettings(cfg) {
  const box = document.getElementById("runtimeToggles");
  box.innerHTML = Object.entries(cfg.runtimes || {})
    .map(
      ([id, rt]) =>
        `<label><input type="checkbox" data-rt="${id}" ${rt.enabled === false ? "" : "checked"} /> ${rt.label || id}</label>`
    )
    .join("");
  document.getElementById("customJson").value = JSON.stringify(cfg.custom || [], null, 2);
}

async function saveSettings() {
  const next = structuredClone(config);
  document.querySelectorAll("#runtimeToggles input[data-rt]").forEach((input) => {
    next.runtimes[input.dataset.rt].enabled = input.checked;
  });
  try {
    next.custom = JSON.parse(document.getElementById("customJson").value || "[]");
  } catch {
    alert("自定义 JSON 无效");
    return;
  }
  config = await window.niulai.saveConfig(next);
  document.getElementById("settings").hidden = true;
  tick();
}

function armIgnore() {
  const enter = () => window.niulai.setIgnoreMouse(false);
  const leave = () => window.niulai.setIgnoreMouse(true);
  document.getElementById("hit").addEventListener("mouseenter", enter);
  document.getElementById("hit").addEventListener("mouseleave", leave);
  document.getElementById("settings").addEventListener("mouseenter", enter);
  document.getElementById("settings").addEventListener("mouseleave", leave);
  window.niulai.setIgnoreMouse(true);
}

window.addEventListener("DOMContentLoaded", async () => {
  setCow("waiting");
  armIgnore();
  config = await window.niulai.getConfig();
  fillSettings(config);
  document.getElementById("gear").onclick = () => {
    document.getElementById("settings").hidden = !document.getElementById("settings").hidden;
  };
  document.getElementById("closeSettings").onclick = () => {
    document.getElementById("settings").hidden = true;
  };
  document.getElementById("saveSettings").onclick = saveSettings;
  await tick();
  setInterval(tick, config.pollMs || 2500);
});
