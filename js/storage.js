import { applyRestore } from './importer.js';
import { defaultSettings, SCHEMA_VERSION } from './schema.js';

const DB_NAME = 'workout-tracker';
const DB_VERSION = 2;
const KEYED = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key', meta: 'key', bodyweight: 'date' };
const DATA_STORES = ['exercises', 'routines', 'sessions', 'bodyweight'];
export const STORES = Object.keys(KEYED);

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, keyPath] of Object.entries(KEYED)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version (or the dev fixture loader) upgrade/delete the database instead of blocking.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // Another tab (e.g. an old v1 page) still has the database open, so the upgrade can't proceed.
    req.onblocked = () => { dbPromise = null; reject(new Error('Another copy of the app is still open. Close other tabs or windows of this app, then tap Reload.')); };
  });
  return dbPromise;
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Runs fn over one or more stores in ONE transaction. Resolves with fn's result once the
// transaction commits; if fn throws (e.g. a put with no key) or any request fails, every write
// in it is rolled back and the promise rejects. fn must only await IndexedDB requests.
export async function transact(storeNames, mode, fn) {
  const db = await openDb();
  const names = [].concat(storeNames);
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    let failed = false;
    const fail = (e) => {
      if (failed) return;
      failed = true;
      try { t.abort(); } catch { /* already finished */ }
      reject(e);
    };
    t.oncomplete = () => { if (!failed) resolve(result); };
    t.onerror = (ev) => fail(t.error ?? ev.target?.error ?? new Error('Storage error'));
    t.onabort = () => fail(t.error ?? new Error('Transaction aborted'));
    try {
      Promise.resolve(fn(stores)).then((r) => { result = r; }, fail);
    } catch (e) {
      fail(e);
    }
  });
}

const one = (store, mode, fn) => transact(store, mode, (s) => fn(s[store]));

export const getAll = (store) => one(store, 'readonly', (os) => reqP(os.getAll()));
export const get = (store, id) => one(store, 'readonly', (os) => reqP(os.get(id)));
export const put = (store, rec) => one(store, 'readwrite', (os) => reqP(os.put(rec)).then(() => rec));
export const remove = (store, id) => one(store, 'readwrite', (os) => reqP(os.delete(id)));
export const bulkPut = (store, recs) => one(store, 'readwrite', (os) => { for (const r of recs) os.put(r); });
export const getSingleton = (store, key) => get(store, key);
export const putSingleton = (store, rec) => put(store, rec);
export const clearAll = () => transact(STORES, 'readwrite', (s) => { for (const n of STORES) s[n].clear(); });

export async function getMeta() {
  const m = await get('meta', 'schema');
  return m?.version ?? null;
}

export async function getSettings() {
  return { ...defaultSettings(), ...((await get('settings', 'app')) ?? {}), key: 'app' };
}

export function readAll() {
  return transact(STORES, 'readonly', (s) => Promise.all([
    reqP(s.exercises.getAll()), reqP(s.routines.getAll()), reqP(s.sessions.getAll()),
    reqP(s.bodyweight.getAll()), reqP(s.settings.get('app')),
  ]).then(([exercises, routines, sessions, bodyweight, settings]) => ({
    settings: settings ?? null, exercises, routines, sessions, bodyweight,
  })));
}

// Replaces every data store and the settings singleton, and stamps meta.schema, in one
// transaction. A failure part-way leaves the database exactly as it was (spec §5.2, §7.11).
export function writeAll(state, schemaVersion) {
  return transact(STORES, 'readwrite', (s) => {
    for (const name of DATA_STORES) {
      s[name].clear();
      for (const rec of state[name] ?? []) s[name].put(rec);
    }
    s.settings.put({ ...defaultSettings(), ...(state.settings ?? {}), key: 'app' });
    s.meta.put({ key: 'schema', version: schemaVersion });
  });
}

export async function exportState() {
  const { settings, exercises, routines, sessions, bodyweight } = await readAll();
  return { settings: { ...defaultSettings(), ...(settings ?? {}), key: 'app' }, exercises, routines, sessions, bodyweight };
}

export async function importState(state, mode) {
  const current = await exportState();
  await writeAll(applyRestore(current, state, mode), SCHEMA_VERSION);
}
