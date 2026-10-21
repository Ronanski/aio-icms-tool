/* In-app updates. The app is hosted on GitHub Pages: the Stable channel at the site root (the latest official
   release), the Beta channel under /beta/ (every change merged into main). The Windows and Android apps open the
   hosted app, so an update is only new web files: the app checks version.json of its channel when online and a
   restart loads the new version. Nothing is downloaded or installed, and no browser opens.
   Offline nothing happens: the last version stays cached and keeps working. */
(function () {
  'use strict';
  const esc = UI.esc;
  const PAGES = 'https://ronanski.github.io/aio-icms-tool/';
  const K = { ch: 'plc-trainer.channel', last: 'plc-trainer.updateChecked', skip: 'plc-trainer.updateSkip', seen: 'plc-trainer.lastBuild' };
  const AUTO_EVERY = 3600e3, MIN_GAP = 10 * 60e3;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  /* ---------- versions (semver with pre-release, e.g. 1.3.0-beta.2) ---------- */
  function parse(s) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(s || '').trim());
    return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null;
  }
  function compare(a, b) {
    const x = typeof a === 'string' ? parse(a) : a, y = typeof b === 'string' ? parse(b) : b;
    for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
    if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
      const p = x.pre[i], q = y.pre[i];
      if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
      if (p === q) continue;
      const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
      if (pn && qn) return +p < +q ? -1 : 1;
      if (pn !== qn) return pn ? -1 : 1;
      return p < q ? -1 : 1;
    }
    return 0;
  }

  const platform = () => (/Electron\//.test(navigator.userAgent) ? 'windows' : window.Capacitor ? 'android' : 'web');
  const onPages = () => location.href.startsWith(PAGES);
  const inBeta = () => onPages() && location.pathname.includes('/beta/');
  const channel = () => { const c = get(K.ch); return c === 'beta' || c === 'stable' ? c : inBeta() ? 'beta' : 'stable'; };
  const channelUrl = ch => PAGES + (ch === 'beta' ? 'beta/' : '');
  /* this copy is the one the channel serves: an update is a reload. Elsewhere (a built-in copy, a local file) the
     update opens the hosted app of the channel inside the app */
  const servedHere = ch => onPages() && inBeta() === (ch === 'beta');

  /* ---------- check ---------- */
  const U = { state: { status: 'idle', at: Number(get(K.last)) || 0, info: null } };
  let busy = false;
  U.check = async function (manual) {
    if (busy) return U.state;
    if (!navigator.onLine) { U.state = { ...U.state, status: 'offline' }; return U.state; }
    if (!manual && Date.now() - U.state.at < MIN_GAP) return U.state;
    busy = true;
    const ch = channel();
    try {
      const res = await fetch(channelUrl(ch) + 'version.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const v = await res.json();
      const info = v && typeof v === 'object' && typeof v.build === 'string' && typeof v.version === 'string' ? { version: v.version, build: v.build, notes: typeof v.notes === 'string' ? v.notes : '', channel: ch } : null;
      if (!info) throw new Error('bad version.json');
      // the hosted app: a different build of its channel. A built-in copy (the Android / Windows app, offline fallback)
      // moves to the hosted app only for a newer version: the same version is not an update ("v2.3.0 is ready. You have
      // v2.3.0"). A development copy compares builds.
      const newer = servedHere(ch) || App.BUILD === 'dev' ? info.build !== App.BUILD : compare(info.version, App.VERSION) > 0;
      U.state = { status: newer ? 'available' : 'current', at: Date.now(), info: newer ? info : null };
      set(K.last, String(U.state.at));
      if (newer && (manual || get(K.skip) !== info.build)) { showBar(info); if (!manual) App.log('system', `Update available: v${info.version}${ch === 'beta' ? ' (beta)' : ''}`); }
    } catch (err) {
      // count a failed try too, so an outage is not retried on every start
      U.state = { ...U.state, status: 'error', at: Date.now() };
      set(K.last, String(U.state.at));
    } finally { busy = false; }
    return U.state;
  };

  /* ---------- UI ---------- */
  function hideBar() { const b = document.querySelector('.update-bar'); if (b) b.remove(); }
  function showBar(info) {
    hideBar();
    const beta = info.channel === 'beta';
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = `<span>⬆ <b>PLC Trainer v${esc(info.version)}</b>${beta ? ' <span class="beta-tag">BETA</span>' : ''} is ready. You have v${esc(App.VERSION)}.</span>
      <button class="btn" data-u="notes">What's new</button><button class="btn primary" data-u="go">⟳ Restart to update</button><button class="btn ghost" data-u="later" title="Hide until the next version">Later</button>`;
    bar.onclick = e => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      if (b.dataset.u === 'later') { set(K.skip, info.build); hideBar(); }
      if (b.dataset.u === 'notes') notes(info);
      if (b.dataset.u === 'go') apply(info);
    };
    // in the page flow under the status bar, so it never covers PROG/RUN or the I/O strip
    document.body.insertBefore(bar, document.getElementById('main'));
  }
  /* the new files are loaded network-first, so a reload is the whole update; projects are saved first */
  function apply(info) {
    App.leaveProject(() => {
      App.log('system', `Updating to v${info.version}${info.channel === 'beta' ? ' (beta)' : ''}`);
      if (servedHere(info.channel)) location.reload();
      else location.href = channelUrl(info.channel);
    });
  }
  U.apply = apply;
  /* release notes as plain text with simple headings and bullets (never raw HTML) */
  function md(t) {
    return String(t || '').split(/\r?\n/).map(l => {
      const s = esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^#{1,6}\s/.test(l)) return `<h4>${s.replace(/^#+\s*/, '')}</h4>`;
      if (/^>\s?/.test(l)) return `<p class="rel-note">${s.replace(/^&gt;\s?/, '')}</p>`;
      if (/^\s*[-*]\s/.test(l)) return `<li>${s.replace(/^\s*[-*]\s/, '')}</li>`;
      return s.trim() ? `<p>${s}</p>` : '';
    }).join('');
  }
  function notes(info) {
    UI.modal({ title: `What's new in v${info.version}${info.channel === 'beta' ? ' (beta)' : ''}`, wide: true, body: `<div class="rel-notes">${md(info.notes) || '<p class="help">No release notes.</p>'}</div>`,
      buttons: [{ label: 'Close' }, { label: 'Restart to update', primary: true, onClick: () => apply(info) }] });
  }
  /* File → Updates…: channel, last check, check now */
  U.dialog = function () {
    const m = UI.modal({
      title: 'Updates',
      body: `<p>This app: <b>v${esc(App.VERSION)}</b>${App.BUILD && App.BUILD !== 'dev' ? ` <small>(${esc(App.BUILD)})</small>` : ''} · ${({ windows: 'Windows app', android: 'Android app', web: 'web app' })[platform()]}</p>
        <div class="field"><span>Update channel</span>
          <label class="radio"><input type="radio" name="uch" value="stable"> <b>Stable</b> — official releases</label>
          <label class="radio"><input type="radio" name="uch" value="beta"> <b>Beta</b> — every new change as soon as it is merged; may have bugs</label></div>
        <p class="help" data-ust></p>
        <p class="help">Updates install inside the app: when a new version is ready, <b>Restart to update</b> loads it. Nothing is downloaded and your projects stay. Offline the app keeps working with the version it has.</p>`,
      buttons: [{ label: 'Close' }, { label: 'Check now', primary: true, onClick: () => { run(); return false; } }],
    });
    const st = m.el.querySelector('[data-ust]');
    const show = () => {
      const s = U.state, when = s.at ? new Date(s.at).toLocaleString() : 'never';
      // the hosted app of the other channel is still loaded after a switch: the same version is not "the latest" here
      const moved = onPages() && !servedHere(channel());
      st.textContent = s.status === 'checking' ? 'Checking…' : s.status === 'offline' ? 'You are offline. Connect to the internet to check.' :
        s.status === 'error' ? 'Could not reach the update server. Try again later.' : s.status === 'available' ? `Update ready: v${s.info.version}. Last checked ${when}.` :
        s.status === 'current' && moved ? `The ${channel()} channel loads when you restart.` :
        s.status === 'current' ? `You have the latest ${channel()} version. Last checked ${when}.` : `Last checked: ${when}.`;
      if (s.status === 'current' && moved) {
        const b = document.createElement('button');
        b.className = 'btn'; b.textContent = `⟳ Restart into ${channel() === 'beta' ? 'Beta' : 'Stable'}`;
        b.onclick = () => App.leaveProject(() => { location.href = channelUrl(channel()); });
        st.append(' ', b);
      }
    };
    const run = async () => { U.state = { ...U.state, status: 'checking' }; show(); await U.check(true); show(); };
    m.el.querySelectorAll('[name="uch"]').forEach(i => {
      i.checked = i.value === channel();
      i.onchange = () => { set(K.ch, i.value); set(K.skip, ''); hideBar(); App.log('system', `Update channel set to ${i.value}`); run(); };
    });
    show();
  };
  U.channel = channel;

  U.init = function () {
    // after a restart into a new version, say so once
    const prev = get(K.seen);
    if (App.BUILD && App.BUILD !== 'dev') {
      if (prev && prev !== App.BUILD) { UI.toast(`Updated to v${App.VERSION}${inBeta() ? ' (beta)' : ''}`, 'ok', 4000); App.log('system', `Updated to v${App.VERSION} (${App.BUILD})`); }
      set(K.seen, App.BUILD);
    }
    setTimeout(() => U.check(false), 3000);
    setInterval(() => U.check(false), AUTO_EVERY);
    window.addEventListener('online', () => U.check(false));
  };
  U.compare = compare;
  U.PAGES = PAGES;
  window.Updater = U;
})();
