import { applyRestore } from './importer.js';

const DB_NAME = 'workout-tracker';
const DB_VERSION = 1;
const KEYED = { exercises: 'id', routines: 'id', sessions: 'id', settings: 'key', meta: 'key' };

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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getAll = (store) => tx(store, 'readonly', (os) => reqP(os.getAll()));
export const get = (store, id) => tx(store, 'readonly', (os) => reqP(os.get(id)));
export const put = (store, rec) => tx(store, 'readwrite', (os) => reqP(os.put(rec)).then(() => rec));
export const remove = (store, id) => tx(store, 'readwrite', (os) => reqP(os.delete(id)));
export const bulkPut = (store, recs) => tx(store, 'readwrite', (os) => { for (const r of recs) os.put(r); });
export const getSingleton = (store, key) => get(store, key);
export const putSingleton = (store, rec) => put(store, rec);
export const clearAll = () => Promise.all(Object.keys(KEYED).map((s) => tx(s, 'readwrite', (os) => reqP(os.clear()))));

export async function exportState() {
  const [exercises, routines, sessions, settings] = await Promise.all([
    getAll('exercises'), getAll('routines'), getAll('sessions'), getSingleton('settings', 'app'),
  ]);
  return { settings: settings ?? { key: 'app', units: 'lb' }, exercises, routines, sessions };
}

export async function importState(state, mode) {
  const current = await exportState();
  const finalState = applyRestore(current, state, mode);
  await clearAll();
  const settings = finalState.settings
    ? { units: 'lb', ...finalState.settings, key: 'app' }
    : { key: 'app', units: 'lb' };
  await putSingleton('settings', settings);
  await bulkPut('exercises', finalState.exercises ?? []);
  await bulkPut('routines', finalState.routines ?? []);
  await bulkPut('sessions', finalState.sessions ?? []);
}
