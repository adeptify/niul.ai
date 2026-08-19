const fs = require("fs");
const path = require("path");

function read(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(file, memos) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(memos, null, 2));
}

function createMemoStore(file) {
  let memos = read(file);
  const persist = () => write(file, memos);

  return {
    list() {
      return memos
        .filter((memo) => !memo.completedAt)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30);
    },

    add(input) {
      const text = String(input?.text || "").trim().slice(0, 1000);
      if (!text) throw new Error("Memo 不能为空");
      const remindAt = Number(input?.remindAt || 0);
      const memo = {
        id: `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        createdAt: Date.now(),
        remindAt: Number.isFinite(remindAt) && remindAt > Date.now() ? remindAt : null,
        notifiedAt: null,
        completedAt: null,
      };
      memos = [memo, ...memos].slice(0, 200);
      persist();
      return memo;
    },

    complete(id) {
      const memo = memos.find((item) => item.id === id);
      if (!memo) return false;
      memo.completedAt = Date.now();
      persist();
      return true;
    },

    due(now = Date.now()) {
      const due = memos.filter(
        (memo) => !memo.completedAt && !memo.notifiedAt && memo.remindAt && memo.remindAt <= now
      );
      if (due.length) {
        for (const memo of due) memo.notifiedAt = now;
        persist();
      }
      return due;
    },
  };
}

module.exports = { createMemoStore };
