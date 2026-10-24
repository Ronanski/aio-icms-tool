/* MT PLC Studio in-app updates (docs/PLC_APP_SPEC.md section 14), as in the trainer: the app is hosted on GitHub
   Pages, Stable at /mtps/ (the latest MT PLC Studio release) and Beta at /mtps/beta/ (every merge into main). The exe
   and the APK start their built-in copy; when the hosted copy of the channel is newer, "Restart to update" loads it,
   and its service worker keeps it for offline use. Nothing is downloaded or installed. Offline nothing happens. */
(function () {
  'use strict';
  const PAGES = 'https://ronanski.github.io/aio-icms-tool/mtps/';
  const get = k => { try { return localStorage.getItem('mtps.' + k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem('mtps.' + k, v); } catch (e) { /* ignore */ } };
  let A = null;
  const st = { status: 'idle', at: Number(get('upChecked')) || 0, info: null };

  function parse(s) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(s || '').trim());
    return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null;
  }
  function compare(a, b) {
    const x = parse(a), y = parse(b);
    if (!x || !y) return 0;
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
  const platform = () => (/Electron\//.test(navigator.userAgent) ? 'Windows app' : window.Capacitor ? 'Android app' : 'web app');
  const onPages = () => location.href.startsWith(PAGES);
  const inBeta = () => onPages() && /\/mtps\/beta\//.test(location.pathname);
  // a preview version starts on Beta, so its users get the next preview
  const channel = () => { const c = get('channel'); return c === 'beta' || c === 'stable' ? c : inBeta() || /-/.test(A ? A.version : '') ? 'beta' : 'stable'; };
  const url = ch => PAGES + (ch === 'beta' ? 'beta/' : '');
  const servedHere = ch => onPages() && inBeta() === (ch === 'beta');

  async function check(manual) {
    if (!navigator.onLine) { st.status = 'offline'; return st; }
    if (!manual && Date.now() - st.at < 10 * 60e3) return st;
    const ch = channel();
    try {
      const res = await fetch(url(ch) + 'version.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const v = await res.json();
      if (!v || typeof v.version !== 'string' || typeof v.build !== 'string') throw new Error('bad version.json');
      const info = { version: v.version, build: v.build, notes: typeof v.notes === 'string' ? v.notes : '', channel: ch };
      // the hosted copy of this channel: another build is an update. Elsewhere (built-in copy): a newer version only.
      const newer = servedHere(ch) || A.build === 'dev' ? info.build !== A.build && (A.build !== 'dev' || compare(info.version, A.version) > 0) : compare(info.version, A.version) > 0;
      Object.assign(st, { status: newer ? 'available' : 'current', at: Date.now(), info: newer ? info : null });
      set('upChecked', String(st.at));
      if (newer && (manual || get('upSkip') !== info.build)) A.onAvailable(info);
    } catch (e) {
      Object.assign(st, { status: 'error', at: Date.now() });
      set('upChecked', String(st.at));
    }
    return st;
  }
  function apply(info) { if (servedHere(info.channel)) location.reload(); else location.href = url(info.channel); }
  function dialog() {
    const esc = A.esc;
    const el = A.dialog({
      title: 'Updates',
      body: `<p>This app: <b>v${esc(A.version)}</b>${A.build !== 'dev' ? ` <span class="muted">(${esc(A.build)})</span>` : ''} · ${platform()}</p>
        <div class="frow"><label>Update channel</label><select class="inp" id="uch"><option value="stable">Stable: official releases</option><option value="beta">Beta: every new change, may have bugs</option></select></div>
        <p class="help" id="ust"></p>
        <p class="help">Updates install inside the app: when a new version is ready, Restart to update loads it. Your projects stay. Offline the app keeps working with the version it has.</p>`,
      buttons: [{ l: 'Close' }, { l: 'Check now', pri: true, run: () => { go(); return false; } }],
    });
    const sel = el.querySelector('#uch'), out = el.querySelector('#ust');
    sel.value = channel();
    const show = () => {
      const when = st.at ? new Date(st.at).toLocaleString() : 'never';
      out.textContent = st.status === 'checking' ? 'Checking…' : st.status === 'offline' ? 'You are offline.' : st.status === 'error' ? 'Could not reach the update server. Try again later.'
        : st.status === 'available' ? `Update ready: v${st.info.version}. Last checked ${when}.` : st.status === 'current' ? `You have the latest ${channel()} version. Last checked ${when}.` : `Last checked: ${when}.`;
    };
    const go = async () => { st.status = 'checking'; show(); await check(true); show(); };
    sel.onchange = () => { set('channel', sel.value); set('upSkip', ''); go(); };
    show();
  }
  window.MTPSUpdater = {
    init(app) {
      A = app;
      const seen = get('lastBuild');
      if (A.build !== 'dev') { if (seen && seen !== A.build) A.toast(`Updated to v${A.version}`, 'ok'); set('lastBuild', A.build); }
      setTimeout(() => check(false), 4000);
      setInterval(() => check(false), 3600e3);
      addEventListener('online', () => check(false));
    },
    check, apply, dialog, compare, channel,
    skip(info) { set('upSkip', info.build); },
  };
})();
