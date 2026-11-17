const $ = id => document.getElementById(id);
const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FILTERS = ['fSrc', 'fPosto', 'fMax', 'fM2', 'fSort', 'fQ', 'fNew'];
const DAY2 = 24 * 3600e3;
// data real do anúncio: na OLX, a criação estimada (anúncios renovados contam pela data original)
const eff = it => (it.src === 'OLX' ? (it.origAt || it.pubAt) : it.pubAt) || 0;
let state = { items: {}, status: null, lastScan: 0, lastErrors: [], settings: {} };

function fmtTime(t) {
  if (!t) return 'nunca';
  const d = new Date(t), today = new Date();
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? 'hoje às ' + hm : d.toLocaleDateString('pt-BR') + ' ' + hm;
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `há ${Math.max(m, 1)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} dia${d > 1 ? 's' : ''}` : `há ${Math.round(d / 30)} ${Math.round(d / 30) > 1 ? 'meses' : 'mês'}`;
}
function pubText(it) {
  if (!it.pubAt) return `Data ainda não lida (aparece só em "Qualquer data")`;
  const exact = it.src === 'OLX' || Date.now() - it.pubAt < 864e5;
  const d = new Date(it.pubAt);
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let txt = `Anunciado em <b>${day}${exact ? ' às ' + hm : ''}</b> (${ago(it.pubAt)})`;
  if (it.src === 'OLX') txt = it.renewed
    ? `Anúncio antigo: criado ${ago(it.origAt)} (aprox.), renovado em ${day} às ${hm}`
    : `Anunciado em <b>${day} às ${hm}</b> (${ago(it.pubAt)})`;
  if (it.updAt && it.updAt - it.pubAt > 864e5) txt += ` · atualizado ${ago(it.updAt)}`;
  return txt;
}

function renderStatus() {
  const s = state.status, running = s && s.state === 'running' && Date.now() - s.at < 120000;
  $('btnScan').disabled = !!running;
  $('btnScan').textContent = running ? 'Buscando…' : 'Atualizar';
  const auto = +(state.settings.autoMinutes ?? 30);
  const st = $('status');
  st.className = 'status' + (running ? ' running' : '');
  st.textContent = running ? s.text
    : `Última busca: ${fmtTime(state.lastScan)}` + (s && s.text ? ` · ${s.text}` : '') + (auto ? ` · busca automática a cada ${auto} min` : ' · busca automática desligada');
  const errs = state.lastErrors || [];
  $('errors').hidden = !errs.length || running;
  $('errors').textContent = errs.join(' ');
}

function render() {
  const f = {};
  FILTERS.forEach(id => f[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value);
  try { localStorage.setItem('radar-f2', JSON.stringify(f)); } catch (e) {}
  const q = f.fQ.trim().toLowerCase(), now = Date.now();
  const all = Object.values(state.items).map(it => ({ ...it, posto: classify(it), isNew: !it.baseline && now - it.firstSeen < DAY2, recent: now - (it.pubAt || it.firstSeen) < DAY2 }));

  // agrupa anúncios repetidos (mesma fonte, preço, área e local)
  const groups = new Map();
  for (const it of all.sort((a, b) => b.firstSeen - a.firstSeen)) {
    const k = [it.src, it.price, it.m2, it.rua || it.posto].join('|');
    if (groups.has(k)) groups.get(k).dups++; else groups.set(k, { ...it, dups: 0 });
  }
  const uniq = [...groups.values()];
  const bySrc = {};
  uniq.forEach(it => (bySrc[it.price + '|' + it.m2] ??= new Set()).add(it.src));

  let list = uniq.filter(it =>
    (!f.fSrc || it.src === f.fSrc) &&
    (f.fPosto === 'todos' || (f.fPosto === 'alvo' ? isTarget(it.posto) : (it.posto === f.fPosto || (it.posto === 'Posto 5/6' && f.fPosto !== 'Divisa 4/5')))) &&
    it.price <= +f.fMax && it.price >= (state.settings.minPrice || 0) && it.price <= (state.settings.maxPrice || 1e12) && it.m2 >= +f.fM2 && (!+f.fNew || (eff(it) && now - eff(it) < +f.fNew * 3600e3)) &&
    (!q || `${it.rua} ${it.title} ${it.vaga ? 'vaga' : ''}`.toLowerCase().includes(q)));
  const sorts = {
    new: (a, b) => (!!a.gone - !!b.gone) || (eff(b) - eff(a)) || (b.firstSeen - a.firstSeen),
    price: (a, b) => a.price - b.price,
    ppm: (a, b) => a.price / (a.m2 || 1e9) - b.price / (b.m2 || 1e9),
    m2: (a, b) => b.m2 - a.m2
  };
  list.sort(sorts[f.fSort]);
  const nNew = list.filter(it => it.isNew).length;
  $('count').textContent = `${list.length} ${list.length === 1 ? 'imóvel' : 'imóveis'}` + (nNew ? ` · ${nNew} novo${nNew > 1 ? 's' : ''}` : '');

  if (!Object.keys(state.items).length) {
    $('grid').innerHTML = `<div class="empty">Nenhuma busca feita ainda. Clique em <b>Atualizar</b> para ler o ZAP e a OLX (leva cerca de 1 minuto).</div>`;
    return;
  }
  $('grid').innerHTML = list.length ? list.map(it => `
    <article class="card${it.isNew ? ' isnew' : ''}${it.gone ? ' gone' : ''}">
      <div class="top"><span class="src ${it.src}">${it.src}</span><span class="posto">${esc([it.posto, it.rua].filter(Boolean).join(' · ') || 'Copacabana')}</span></div>
      <div><div class="price">${brl(it.price)}${it.prevPrice ? `<s>${brl(it.prevPrice)}</s>` : ''}</div>${it.m2 ? `<div class="ppm">${brl(it.price / it.m2)}/m²</div>` : ''}</div>
      ${it.title ? `<p class="title">${esc(it.title)}</p>` : ''}
      <p class="pub">${pubText(it)}</p>
      <div class="facts"><span><b>${it.m2 || '?'}</b> m²</span><span>Cond. <b>${it.cond ? brl(it.cond) : 'n/i'}</b></span><span>IPTU <b>${it.iptu ? brl(it.iptu) : 'n/i'}</b></span></div>
      <div class="tags">
        ${it.isNew ? `<span class="tag new">NOVO · ${fmtTime(it.firstSeen)}</span>` : ''}
        ${it.prevPrice ? '<span class="tag drop">baixou o preço</span>' : ''}
        ${it.vaga ? '<span class="tag">vaga</span>' : ''}
        ${bySrc[it.price + '|' + it.m2].size > 1 ? '<span class="tag">nas duas fontes</span>' : ''}
        ${it.dups ? `<span class="tag">+${it.dups} anúncio${it.dups > 1 ? 's' : ''} igual</span>` : ''}
        ${it.gone ? '<span class="tag">saiu do ar</span>' : ''}
      </div>
      <a class="go" href="${esc(it.url)}" target="_blank" rel="noopener">Ver anúncio no ${it.src}</a>
    </article>`).join('') : emptyMsg(uniq, f);
}

function emptyMsg(uniq, f) {
  const semData = uniq.filter(it => !eff(it) && (f.fPosto === 'todos' || isTarget(it.posto))).length;
  let m = 'Nenhum imóvel com esses filtros.';
  if (+f.fNew) m = `Nenhum anúncio do Posto 5/6 publicado nesse período.`;
  if (+f.fNew && semData) m += ` ${semData} anúncio${semData > 1 ? 's ainda estão' : ' ainda está'} sem data lida: clique em Atualizar ou escolha "Qualquer data".`;
  return `<div class="empty">${m}</div>`;
}

async function load() {
  const s = await chrome.storage.local.get(['items', 'status', 'lastScan', 'lastErrors', 'settings']);
  state = { items: s.items || {}, status: s.status, lastScan: s.lastScan, lastErrors: s.lastErrors || [], settings: { minPrice: 800000, maxPrice: 850000, autoMinutes: 30, notifyDivisa: false, ...(s.settings || {}) } };
  $('sMax').value = state.settings.maxPrice;
  $('sMin').value = state.settings.minPrice;
  $('faixa').textContent = `${brl(state.settings.minPrice)} e ${brl(state.settings.maxPrice)}`;
  $('sAuto').value = String(state.settings.autoMinutes);
  $('sDiv').checked = !!state.settings.notifyDivisa;
  renderStatus(); render();
  // marca como vistos e limpa o número no ícone
  let changed = false;
  for (const it of Object.values(state.items)) if (!it.viewed) { it.viewed = true; changed = true; }
  if (changed) chrome.storage.local.set({ items: state.items });
  chrome.action.setBadgeText({ text: '' });
}

try { const saved = JSON.parse(localStorage.getItem('radar-f2') || '{}'); FILTERS.forEach(id => { if (saved[id] != null) { if ($(id).type === 'checkbox') $(id).checked = saved[id]; else $(id).value = saved[id]; } }); } catch (e) {}
FILTERS.forEach(id => $(id).addEventListener('input', render));

async function scanHere() {
  $('btnScan').disabled = true;
  $('btnScan').textContent = 'Buscando…';
  try {
    const r = await runScanCore(p => scanAll(p.minPrice, p.maxPrice, text => status('running', text), p.known, p.quick, p.dated, p.undated));
    if (r && r.busy) status('running', 'Já existe uma busca em andamento.');
    if (r && r.error) status('error', 'Erro: ' + r.error);
  } catch (e) {
    status('error', 'Erro: ' + (e && e.message || e));
  }
  const s = await chrome.storage.local.get(['items', 'status', 'lastScan', 'lastErrors']);
  state.items = s.items || {}; state.status = s.status; state.lastScan = s.lastScan; state.lastErrors = s.lastErrors || [];
  renderStatus(); render();
}
$('btnScan').addEventListener('click', scanHere);
chrome.runtime.onMessage.addListener((msg, _s, reply) => { if (msg.type === 'doScanInPage') { scanHere(); reply({ ok: true }); } });
window.addEventListener('error', e => { const st = $('status'); if (st) st.textContent = 'Erro na página: ' + e.message; });
window.addEventListener('unhandledrejection', e => { const st = $('status'); if (st) st.textContent = 'Erro: ' + (e.reason && e.reason.message || e.reason); });

$('btnSave').addEventListener('click', async () => {
  const settings = { minPrice: Math.max(0, +$('sMin').value || 0), maxPrice: Math.max(100000, +$('sMax').value || 850000), autoMinutes: +$('sAuto').value, notifyDivisa: $('sDiv').checked };
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: 'reschedule' });
  $('btnSave').textContent = 'Salvo';
  setTimeout(() => $('btnSave').textContent = 'Salvar', 1500);
});

chrome.storage.onChanged.addListener(ch => {
  if (ch.status) state.status = ch.status.newValue;
  if (ch.lastScan) state.lastScan = ch.lastScan.newValue;
  if (ch.lastErrors) state.lastErrors = ch.lastErrors.newValue || [];
  if (ch.settings) { state.settings = { ...state.settings, ...ch.settings.newValue }; render(); }
  renderStatus();
  if (ch.items) { state.items = ch.items.newValue || {}; render(); }
});
setInterval(renderStatus, 30000);
load();
