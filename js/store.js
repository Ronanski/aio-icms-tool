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
  const readIdx = () => { try { return JSON.parse(get(IDX) || '[]'); } catch (e) { return []; } };
  const writeIdx = list => set(IDX, JSON.stringify(list));

  const Store = {
    newId: () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    list: () => readIdx().sort((a, b) => b.updated - a.updated),
    load(id) { try { return JSON.parse(get(PREFIX + id) || 'null'); } catch (e) { return null; } },
    save(id, data) {
      if (!id) return false;
      const ok = set(PREFIX + id, JSON.stringify(data));
      const list = readIdx().filter(p => p.id !== id);
      list.push({ id, name: data.name || 'Untitled', updated: Date.now() });
      writeIdx(list);
      return ok;
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
