// Lưu dữ liệu người dùng bằng IndexedDB (chỉ trên máy, không gửi đi đâu).
// Lúc mở app nạp hết vào bộ nhớ → app đọc đồng bộ (store.get), ghi thì cập nhật bộ nhớ + IndexedDB.
// Không có IndexedDB (trình duyệt cũ / chế độ riêng tư) → tự lùi về localStorage.

import { serialize, parse } from './datafile.js';

const DB_NAME = 'yuhtahntax', OS = 'kv', LS_PREFIX = 'ytt:';
const BUILD = '__BUILD__';
const cache = new Map();
let db = null;

const req2p = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });

function open() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
    r.onblocked = () => fail(new Error('IndexedDB bị chặn'));
  });
}

function lsEntries() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_PREFIX)) out.push([k.slice(LS_PREFIX.length), JSON.parse(localStorage.getItem(k))]);
    }
  } catch {}
  return out;
}

export async function initStore() {
  try {
    db = await open();
    const tx = db.transaction(OS, 'readonly').objectStore(OS);
    const [keys, vals] = await Promise.all([req2p(tx.getAllKeys()), req2p(tx.getAll())]);
    keys.forEach((k, i) => cache.set(k, vals[i]));

    // Chuyển dữ liệu từ bản cũ (localStorage) sang IndexedDB một lần
    const old = lsEntries();
    if (old.length) {
      const w = db.transaction(OS, 'readwrite').objectStore(OS);
      for (const [k, v] of old) if (!cache.has(k)) { cache.set(k, v); w.put(v, k); }
      try { old.forEach(([k]) => localStorage.removeItem(LS_PREFIX + k)); } catch {}
    }
  } catch (e) {
    console.warn('Không dùng được IndexedDB, chuyển sang localStorage:', e);
    db = null;
    lsEntries().forEach(([k, v]) => cache.set(k, v));
  }
  // Xin trình duyệt giữ dữ liệu lâu dài (không tự xoá khi máy thiếu dung lượng)
  try { await navigator.storage?.persist?.(); } catch {}
}

/** Toàn bộ dữ liệu người dùng → nội dung file .yuhtax (định dạng xem datafile.js / FORMAT.md). */
export function exportAll() {
  return serialize(Object.fromEntries(cache), BUILD);
}

/** Đọc nội dung file .yuhtax (mọi phiên bản cũ đều được nâng cấp), thay toàn bộ dữ liệu hiện tại. Lỗi → throw. */
export async function importAll(text) {
  const f = parse(text);
  const entries = Object.entries(f.data);
  cache.clear();
  entries.forEach(([k, v]) => cache.set(k, v));
  if (db) {
    await new Promise((ok, fail) => {
      const tx = db.transaction(OS, 'readwrite'), os = tx.objectStore(OS);
      os.clear();
      entries.forEach(([k, v]) => os.put(v, k));
      tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error);
    });
  } else {
    try {
      lsEntries().forEach(([k]) => localStorage.removeItem(LS_PREFIX + k));
      entries.forEach(([k, v]) => localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)));
    } catch {}
  }
  return f;
}

export const store = {
  get(k, d) {
    // structuredClone để code gọi sửa thoải mái mà không đụng bản trong cache
    return cache.has(k) ? structuredClone(cache.get(k)) : d;
  },
  set(k, v) {
    const val = structuredClone(v);
    cache.set(k, val);
    if (db) {
      try { db.transaction(OS, 'readwrite').objectStore(OS).put(val, k); } catch (e) { console.warn(e); }
    } else {
      try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(val)); } catch {}
    }
  },
};
