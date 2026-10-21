/* Project storage in the browser: many projects, one localStorage key each, plus an index.
   Every access is wrapped because storage can be missing or blocked (private mode, sandboxed frames). */
(function () {
  'use strict';
  const IDX = 'plc-trainer.projects.v2';
  const PREFIX = 'plc-trainer.proj.';
  const CUR = 'plc-trainer.current';
  const LEGACY = 'plc-trainer.project.v1';

  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  // anything but a list of {id} entries (a hand-edited or damaged index) reads as empty or loses only the bad entries
  const readIdx = () => {
    try { const a = JSON.parse(get(IDX) || '[]'); return Array.isArray(a) ? a.filter(p => p && typeof p.id === 'string') : []; }
    catch (e) { return []; }
  };
  const writeIdx = list => set(IDX, JSON.stringify(list));

  const Store = {
    newId: () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    list: () => readIdx().sort((a, b) => b.updated - a.updated),
    load(id) { try { return JSON.parse(get(PREFIX + id) || 'null'); } catch (e) { return null; } },
    save(id, data) {
      if (!id) return false;
      if (!set(PREFIX + id, JSON.stringify(data))) return false;
      // the index lists a project only once its data is really stored
      const list = readIdx().filter(p => p.id !== id);
      list.push({ id, name: data.name || 'Untitled', updated: Date.now() });
      return writeIdx(list);
    },
    remove(id) { del(PREFIX + id); writeIdx(readIdx().filter(p => p.id !== id)); },
    current: () => get(CUR),
    setCurrent: id => set(CUR, id),
    /* v1.0 kept a single project under one key: move it into the list once */
    migrate() {
      const old = get(LEGACY);
      if (!old) return;
      try {
        const data = JSON.parse(old);
        const id = Store.newId();
        Store.save(id, data);
        if (!Store.current()) Store.setCurrent(id);
      } catch (e) { /* unreadable legacy data is dropped */ }
      del(LEGACY);
    },
  };
  window.Store = Store;
})();
