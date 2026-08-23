const fs = require("node:fs");
const path = require("node:path");

function safeExists(file) {
  try {
    return Boolean(file) && fs.existsSync(file);
  } catch {
    return false;
  }
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function createFileWalker({ maxDepth = 8, maxFiles = 4000 } = {}) {
  return function walkFiles(root, predicate, acc = [], depth = 0) {
    if (!safeExists(root) || depth > maxDepth || acc.length >= maxFiles) return acc;
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return acc;
    }
    for (const entry of entries) {
      if (acc.length >= maxFiles) break;
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) walkFiles(full, predicate, acc, depth + 1);
      else if (predicate(full, entry.name)) acc.push(full);
    }
    return acc;
  };
}

module.exports = { createFileWalker, readJson, safeExists, safeStat };
