/* In-app updates: when online, look at the GitHub Releases of this app and tell the user about a newer version.
   Stable channel: normal releases only. Beta channel: pre-releases (tags like v1.3.0-beta.1) too.
   Offline nothing happens and the app keeps working. Downloads open the installer for this platform. */
(function () {
  'use strict';
  const esc = UI.esc;
  const REPO = 'Ronanski/aio-icms-tool';
  const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
  const K = { ch: 'plc-trainer.channel', last: 'plc-trainer.updateChecked', skip: 'plc-trainer.updateSkip' };
  const AUTO_EVERY = 6 * 3600e3, MIN_GAP = 3600e3;   // GitHub allows 60 unauthenticated requests an hour
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
  const isBeta = v => !!(parse(v) && parse(v).pre.length);
  const channel = () => { const c = get(K.ch); return c === 'beta' || c === 'stable' ? c : isBeta(App.VERSION) ? 'beta' : 'stable'; };

  /* newest release for the channel that is newer than this app, or null */
  function pick(releases, ch, current) {
    let best = null;
    for (const r of Array.isArray(releases) ? releases : []) {
      if (!r || r.draft || (r.prerelease && ch !== 'beta')) continue;
      const v = parse(r.tag_name);
      if (!v || (r.prerelease && !v.pre.length)) continue;
      if (!best || compare(v, best.v) > 0) best = { v, r };
    }
    return best && compare(best.v, parse(current)) > 0 ? best.r : null;
  }
  function assetFor(r, plat) {
    const re = plat === 'windows' ? /Setup-.*\.exe$/i : plat === 'android' ? /-android\.apk$/i : null;
    const a = re && (r.assets || []).find(x => re.test(x.name));
    return a ? a.browser_download_url : null;
  }
  /* open a download or web page outside the app: Electron sends window.open to the browser,
     the Android shell hands navigation to other sites to the system browser */
  function openOut(url) {
    if (!/^https:\/\//.test(url)) return;
    if (platform() === 'android') location.href = url; else window.open(url, '_blank', 'noopener');
  }

  /* ---------- check ---------- */
  const U = { state: { status: 'idle', at: Number(get(K.last)) || 0, release: null } };
  let busy = false;
  U.check = async function (manual) {
    if (busy) return U.state;
    if (!navigator.onLine) { U.state = { ...U.state, status: 'offline' }; return U.state; }
    if (!manual && Date.now() - U.state.at < MIN_GAP) return U.state;
    busy = true;
    try {
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rel = pick(await res.json(), channel(), App.VERSION);
      U.state = { status: rel ? 'available' : 'current', at: Date.now(), release: rel };
      set(K.last, String(U.state.at));
      if (rel && (manual || get(K.skip) !== rel.tag_name)) { showBar(rel); if (!manual) App.log('system', `Update available: ${rel.tag_name}${rel.prerelease ? ' (beta)' : ''}`); }
    } catch (err) {
      // count a failed try too, so a rate limit or outage is not retried on every start
      U.state = { ...U.state, status: 'error', at: Date.now() };
      set(K.last, String(U.state.at));
    } finally { busy = false; }
    return U.state;
  };

  /* ---------- UI ---------- */
  function hideBar() { const b = document.querySelector('.update-bar'); if (b) b.remove(); }
  function showBar(r) {
    hideBar();
    const plat = platform(), url = assetFor(r, plat);
    const label = plat === 'web' && !r.prerelease ? '⟳ Reload to update' : url ? '⤓ Download update' : 'Open release page';
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = `<span>⬆ <b>PLC Trainer ${esc(r.tag_name)}</b> is available${r.prerelease ? ' <span class="beta-tag">BETA</span>' : ''}. You have v${esc(App.VERSION)}.</span>
      <button class="btn" data-u="notes">What's new</button><button class="btn primary" data-u="go">${label}</button><button class="btn ghost" data-u="later" title="Hide until the next version">Later</button>`;
    bar.onclick = e => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      if (b.dataset.u === 'later') { set(K.skip, r.tag_name); hideBar(); }
      if (b.dataset.u === 'notes') notes(r);
      if (b.dataset.u === 'go') install(r);
    };
    // in the page flow under the status bar, so it never covers PROG/RUN or the I/O strip
    document.body.insertBefore(bar, document.getElementById('main'));
  }
  function install(r) {
    const plat = platform(), url = assetFor(r, plat);
    App.log('system', `Update ${r.tag_name} started (${plat})`);
    App.flushSave();
    // the web app updates itself: index.html and scripts are fetched network-first, so a reload loads the new files
    if (plat === 'web' && !r.prerelease) { location.reload(); return; }
    openOut(url || r.html_url);
    if (url) UI.toast(plat === 'android' ? 'Downloading the update. Open the .apk when it finishes and tap Install.' : 'Downloading the installer. Run it to update; your projects are kept.', 'ok', 6000);
  }
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
  function notes(r) {
    UI.modal({ title: `What's new in ${r.tag_name}${r.prerelease ? ' (beta)' : ''}`, wide: true, body: `<div class="rel-notes">${md(r.body) || '<p class="help">No release notes.</p>'}</div>`,
      buttons: [{ label: 'Close' }, { label: 'Update', primary: true, onClick: () => install(r) }] });
  }
  /* File → Updates…: channel, last check, check now */
  U.dialog = function () {
    const m = UI.modal({
      title: 'Updates',
      body: `<p>This app: <b>v${esc(App.VERSION)}</b> · ${({ windows: 'Windows app', android: 'Android app', web: 'web app' })[platform()]}</p>
        <div class="field"><span>Update channel</span>
          <label class="radio"><input type="radio" name="uch" value="stable"> <b>Stable</b> — tested releases</label>
          <label class="radio"><input type="radio" name="uch" value="beta"> <b>Beta</b> — early versions with new features; may have bugs</label></div>
        <p class="help" data-ust></p>
        <p class="help">The app looks for updates when it starts (at most once an hour) while you are online. Offline it works as usual.</p>`,
      buttons: [{ label: 'Close' }, { label: 'Check now', primary: true, onClick: () => { run(); return false; } }],
    });
    const st = m.el.querySelector('[data-ust]');
    const show = () => {
      const s = U.state, when = s.at ? new Date(s.at).toLocaleString() : 'never';
      st.textContent = s.status === 'checking' ? 'Checking…' : s.status === 'offline' ? 'You are offline. Connect to the internet to check.' :
        s.status === 'error' ? 'Could not reach GitHub. Try again later.' : s.status === 'available' ? `Update available: ${s.release.tag_name}. Last checked ${when}.` :
        s.status === 'current' ? `You have the latest ${channel()} version. Last checked ${when}.` : `Last checked: ${when}.`;
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
    setTimeout(() => U.check(false), 3000);
    setInterval(() => U.check(false), AUTO_EVERY);
    window.addEventListener('online', () => U.check(false));
  };
  U.compare = compare;
  U.pick = pick;
  window.Updater = U;
})();
