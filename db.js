/**
 * db.js — IndexedDB data layer (replaces raw localStorage)
 * - Bigger storage limit, structured queries, no risk of blocking the main thread.
 * - Automatically migrates any old data saved under localStorage key "mcr_tasks".
 * - Falls back safely to localStorage if IndexedDB is unavailable (rare, but some
 *   locked-down browsers/webviews disable it).
 */
(function () {
  const DB_NAME = 'homework_tracker_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'tasks';
  const LEGACY_KEY = 'mcr_tasks';

  let dbPromise = null;
  let indexedDbBroken = false;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        indexedDbBroken = true;
        return reject(new Error('IndexedDB not supported'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => {
        indexedDbBroken = true;
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  // --- localStorage fallback helpers (used only if IndexedDB truly fails) ---
  function fallbackGetAll() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[DB] Corrupted localStorage data, resetting to empty list.', err);
      return [];
    }
  }
  function fallbackSaveAll(tasks) {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('[DB] localStorage save failed (possibly full/disabled):', err);
    }
  }

  async function migrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      let legacyTasks;
      try {
        legacyTasks = JSON.parse(raw);
      } catch (err) {
        console.error('[DB] Could not parse legacy localStorage data, skipping migration.', err);
        localStorage.removeItem(LEGACY_KEY);
        return;
      }
      if (!Array.isArray(legacyTasks) || legacyTasks.length === 0) {
        localStorage.removeItem(LEGACY_KEY);
        return;
      }
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        legacyTasks.forEach((t) => tx.objectStore(STORE_NAME).put(t));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      localStorage.removeItem(LEGACY_KEY);
      console.log(`[DB] Migrated ${legacyTasks.length} task(s) from localStorage into IndexedDB.`);
    } catch (err) {
      console.error('[DB] Migration skipped due to error (data remains safe in localStorage):', err);
    }
  }

  async function getAllTasks() {
    if (indexedDbBroken) return fallbackGetAll();
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('[DB] getAllTasks failed, falling back to localStorage:', err);
      return fallbackGetAll();
    }
  }

  async function putTask(task) {
    if (indexedDbBroken) {
      const tasks = fallbackGetAll();
      const idx = tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) tasks[idx] = task; else tasks.unshift(task);
      fallbackSaveAll(tasks);
      return;
    }
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(task);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[DB] putTask failed:', err);
    }
  }

  async function deleteTask(id) {
    if (indexedDbBroken) {
      fallbackSaveAll(fallbackGetAll().filter((t) => t.id !== id));
      return;
    }
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[DB] deleteTask failed:', err);
    }
  }

  // Used when cloud sync pulls a full fresh task list down and needs to replace local state.
  async function replaceAllTasks(tasksArray) {
    if (indexedDbBroken) {
      fallbackSaveAll(tasksArray);
      return;
    }
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tasksArray.forEach((t) => store.put(t));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[DB] replaceAllTasks failed:', err);
    }
  }

  window.TaskDB = { migrateFromLocalStorage, getAllTasks, putTask, deleteTask, replaceAllTasks };
})();
