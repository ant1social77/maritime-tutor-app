// Минимальная обёртка над IndexedDB: хранилища kv (настройки, очередь) и files (кэш файлов репо).
const DB_NAME = 'maritime-tutor';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const keys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());

/** Удалить ключи с префиксом (только локальный кэш на устройстве). */
export async function clearPrefix(store, prefix) {
  const ks = await keys(store);
  await tx(store, 'readwrite', (s) => { ks.filter((k) => String(k).startsWith(prefix)).forEach((k) => s.delete(k)); });
}

export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
