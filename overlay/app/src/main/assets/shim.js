// Faz a interface do Radar (feita para a extensão do Chrome) rodar no app Android.
// Guarda os dados no celular e busca as páginas pelo Android, sem as limitações do navegador.
(function () {
  const A = window.Android;
  const listeners = [];
  const KEYS = '__keys';
  const parse = s => { try { return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } };

  window.chrome = {
    storage: {
      local: {
        get: async k => {
          const ks = k == null ? (parse(A.get(KEYS)) || []) : (Array.isArray(k) ? k : [k]);
          const o = {};
          ks.forEach(x => { const v = parse(A.get(x)); if (v !== undefined) o[x] = v; });
          return o;
        },
        set: async o => {
          const keys = new Set(parse(A.get(KEYS)) || []);
          const ch = {};
          for (const k in o) { A.set(k, JSON.stringify(o[k])); keys.add(k); ch[k] = { newValue: o[k] }; }
          A.set(KEYS, JSON.stringify([...keys]));
          listeners.forEach(f => { try { f(ch); } catch (e) {} });
        }
      },
      onChanged: { addListener: f => listeners.push(f) }
    },
    runtime: {
      sendMessage: async m => { if (m && m.type === 'reschedule') A.reschedule(); return { ok: true }; },
      onMessage: { addListener() {} },
      getURL: p => p
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    notifications: { create: (id, o) => A.notify(o.title || '', o.message || '') }
  };

  // Abrir o app destrava uma busca que ficou pela metade (app fechado no meio)
  if (location.pathname.endsWith('radar.html')) {
    try {
      const st = parse(A.get('status'));
      if (st && st.state === 'running') A.set('status', JSON.stringify({ state: 'ok', text: 'Busca anterior interrompida', at: Date.now() }));
    } catch (e) {}
  }

  // Mostra na tela o andamento das páginas abertas pelo Android
  let pending = 0;
  setInterval(() => {
    let el = document.getElementById('netdebug');
    if (!el) {
      const st = document.getElementById('status');
      if (!st) return;
      el = document.createElement('p');
      el.id = 'netdebug';
      el.style.cssText = 'font:12px ui-monospace,monospace;color:var(--muted);margin:4px 0 0';
      st.after(el);
    }
    try { el.textContent = pending ? 'Páginas: ' + A.debug() : ''; } catch (e) {}
  }, 1000);

  // Busca feita pelo Android (sem bloqueio de CORS)
  window.fetch = url => new Promise((resolve, reject) => {
    const id = A.fetchStart(String(url));
    pending++;
    const t0 = Date.now();
    const end = () => { pending--; };
    const poll = () => {
      const r = A.fetchResult(id);
      if (r == null) {
        if (Date.now() - t0 > 240000) { end(); return reject(new Error('Tempo esgotado')); }
        return setTimeout(poll, 80);
      }
      end();
      const i = r.indexOf('\n');
      const code = +r.slice(0, i);
      const body = r.slice(i + 1);
      if (!code) return reject(new Error(body || 'Sem conexão'));
      resolve({ ok: code >= 200 && code < 300, status: code, text: async () => body });
    };
    poll();
  });
})();
