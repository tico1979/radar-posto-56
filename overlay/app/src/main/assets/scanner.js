// Varredura do ZAP e da OLX. Roda no documento offscreen (precisa de DOMParser).
// Rápida: busca várias páginas ao mesmo tempo e, no modo rápido, para quando
// chega em anúncios que já conhece (as buscas vêm ordenadas por mais recentes).
const ZAP_BASE = 'https://www.zapimoveis.com.br/venda/apartamentos/rj+rio-de-janeiro+zona-sul+copacabana/2-quartos/?transacao=venda&tipos=apartamento_residencial&quartos=2&ordem=MOST_RECENT';
const OLX_BASE = 'https://www.olx.com.br/imoveis/venda/apartamentos/2-quartos/estado-rj/rio-de-janeiro-e-regiao/zona-sul/copacabana?sf=1';
const PARALLEL = 4;

const num = s => +(String(s || '').replace(/\D/g, '')) || 0;
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

async function getDoc(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}

function parseZap(d, minPrice, maxPrice) {
  const out = [];
  const seen = new Set();
  for (const a of d.querySelectorAll('a[href*="/imovel/"]')) {
    const id = ((a.getAttribute('href') || '').match(/id-(\d+)/) || [])[1];
    const t = clean(a.textContent);
    if (!id || !t.includes('m²') || seen.has(id)) continue;
    seen.add(id);
    const price = num((t.match(/ em R\$ ?([\d.]+)/) || [])[1]);
    if (!price || price > maxPrice || price < minPrice) continue;
    const q = num((t.match(/(\d+) quartos?/) || [])[1]);
    if (q && q !== 2) continue;
    out.push({
      key: 'ZAP-' + id, src: 'ZAP', id, price,
      m2: num((t.match(/com (\d+) m²/) || [])[1]),
      cond: num((t.match(/Cond\. R\$ ?([\d.]+)/) || [])[1]),
      iptu: num((t.match(/IPTU R\$ ?([\d.]+)/) || [])[1]),
      vaga: /vaga/i.test(t),
      rua: clean((t.match(/Copacabana, Rio de Janeiro(.+?)(?:Contatar|Ver telefone|Mensagem|$)/) || [])[1]),
      title: '', when: '',
      url: `https://www.zapimoveis.com.br/imovel/imovel-id-${id}/`
    });
  }
  return out;
}

function parseOlx(d, minPrice, maxPrice) {
  const out = new Map();
  for (const a of d.querySelectorAll('a[href]')) {
    const href = (a.getAttribute('href') || '').split('?')[0];
    const m = href.match(/^https:\/\/[a-z]+\.olx\.com\.br\/.+-(\d{9,})$/);
    if (!m) continue;
    const key = 'OLX-' + m[1];
    const title = clean(a.textContent);
    if (out.has(key)) { if (!out.get(key).title && title) out.get(key).title = title.slice(0, 160); continue; }
    let el = a;
    for (let i = 0; i < 7 && !/R\$/.test(el.textContent || '') && el.parentElement; i++) el = el.parentElement;
    const t = clean(el.textContent);
    const prices = (t.match(/R\$ ?[\d.]{6,}/g) || []).map(num).filter(p => p > 100000);
    if (!prices.length) continue;
    const price = Math.min(...prices);
    if (price > maxPrice || price < minPrice) continue;
    out.set(key, {
      key, src: 'OLX', id: m[1], price,
      m2: num(((title ? t.replace(title, ' ') : t).match(/(\d+) ?m²/) || [])[1]),
      cond: num((t.match(/Condom[ií]nio R\$ ?([\d.]+)/) || [])[1]),
      iptu: num((t.match(/IPTU R\$ ?([\d.]+)/) || [])[1]),
      vaga: /vaga/i.test(title), rua: '',
      title: title.slice(0, 160),
      when: (t.match(/(Hoje|Ontem|\d{1,2} de [a-zç]+\.?),? \d\d:\d\d/i) || [''])[0],
      url: href
    });
    const ts = olxDate(out.get(key).when);
    if (ts) out.get(key).pubAt = ts;
  }
  for (const it of out.values()) {
    const r = it.title.match(/\bRua ([A-ZÀ-Ú][\wÀ-ú]+(?: (?:d[aeo]s?|[A-ZÀ-Ú][\wÀ-ú]+))*)/);
    if (r) it.rua = 'Rua ' + r[1];
  }
  return [...out.values()];
}


// Data do anúncio
const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
function olxDate(when, now = new Date()) {
  const m = (when || '').match(/(Hoje|Ontem|(\d{1,2}) de ([a-zç]{3})[a-zç]*\.?),? (\d\d):(\d\d)/i);
  if (!m) return 0;
  const d = new Date(now);
  d.setSeconds(0, 0); d.setHours(+m[4], +m[5]);
  if (/ontem/i.test(m[1])) d.setDate(d.getDate() - 1);
  else if (m[2]) {
    d.setMonth(MESES[m[3].toLowerCase()] ?? d.getMonth(), +m[2]);
    if (d > now) d.setFullYear(d.getFullYear() - 1);
  }
  return d.getTime();
}
const UNIT = { minuto: 60e3, hora: 3600e3, dia: 864e5, semana: 7 * 864e5, mes: 30 * 864e5, mês: 30 * 864e5, ano: 365 * 864e5 };
function relDate(txt, now = Date.now()) {
  if (!txt) return 0;
  const abs = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (abs) return new Date(+abs[3], +abs[2] - 1, +abs[1]).getTime();
  const r = txt.match(/há (\d+|um|uma) (minuto|hora|dia|semana|m[eê]s|ano)/i);
  if (!r) return /agora|instantes/i.test(txt) ? now : 0;
  const n = /^\d+$/.test(r[1]) ? +r[1] : 1;
  const u = r[2].toLowerCase().replace('ê', 'e');
  return now - n * (UNIT[u] || UNIT[r[2].toLowerCase()] || 0);
}
// O card do ZAP não traz data: lê "Publicado há X" na página de cada anúncio novo.
async function zapDates(items, dated, progress) {
  // primeiro os do Posto 5/6, depois o resto de Copacabana
  const rank = it => { const p = typeof classify === 'function' ? classify(it) : ''; return isTarget(p) ? 0 : p ? 1 : 2; };
  const todo = items.filter(it => !dated.has(it.key)).sort((a, b) => rank(a) - rank(b)).slice(0, 40);
  for (let i = 0; i < todo.length; i += 8) {
    progress(`ZAP: data dos anúncios ${i + 1}–${Math.min(i + 8, todo.length)} de ${todo.length}`);
    await Promise.all(todo.slice(i, i + 8).map(async it => {
      try {
        const d = await getDoc(it.url);
        const t = clean(d.body && d.body.textContent);
        const pub = (t.match(/Publicado (há [^,.]+|em \d{2}\/\d{2}\/\d{4})/i) || [])[1];
        const upd = (t.match(/atualizado (há [^,.]+|em \d{2}\/\d{2}\/\d{4})/i) || [])[1];
        const ts = relDate(pub);
        if (ts) it.pubAt = ts;
        const tu = relDate(upd);
        if (tu) it.updAt = tu;
      } catch (e) {}
    }));
  }
}

// Lê as páginas de uma fonte em lotes paralelos.
async function scanSource({ name, pageUrl, parse, totalRe, perPage, maxPages, minPrice, maxPrice, known, quick, progress }) {
  const out = new Map();
  progress(`${name}: página 1`);
  const first = await getDoc(pageUrl(1));
  const firstItems = parse(first, minPrice, maxPrice);
  if (!firstItems.length && !first.querySelector('a[href*="/imovel/"], a[href*="olx.com.br/"]')) {
    throw new Error(`${name} não devolveu anúncios. Abra o site numa aba (passe pela verificação, se aparecer) e clique em Atualizar de novo.`);
  }
  firstItems.forEach(it => out.set(it.key, it));
  const total = num((clean(first.body && first.body.textContent).match(totalRe) || [])[1]);
  const lastPage = total ? Math.min(maxPages, Math.ceil(total / perPage)) : maxPages;
  const allKnown = list => list.length > 0 && list.every(it => known.has(it.key));
  if (quick && allKnown(firstItems)) return [...out.values()];

  for (let start = 2; start <= lastPage; start += PARALLEL) {
    const pages = [];
    for (let n = start; n < start + PARALLEL && n <= lastPage; n++) pages.push(n);
    progress(`${name}: páginas ${pages[0]}–${pages[pages.length - 1]} de ${lastPage}`);
    const docs = await Promise.all(pages.map(n => getDoc(pageUrl(n)).catch(() => null)));
    let fresh = 0, unknown = 0;
    for (const d of docs) {
      if (!d) continue;
      for (const it of parse(d, minPrice, maxPrice)) {
        if (out.has(it.key)) continue;
        out.set(it.key, it); fresh++;
        if (!known.has(it.key)) unknown++;
      }
    }
    if (!fresh) break;                    // acabaram os resultados
    if (quick && !unknown) break;         // só anúncios já conhecidos daqui pra frente
  }
  return [...out.values()];
}

async function scanAll(minPrice, maxPrice, progress, knownKeys = [], quick = false, datedKeys = [], undated = []) {
  const extraDates = {};
  const known = new Set(knownKeys);
  const dated = new Set(datedKeys);
  const common = { minPrice, maxPrice, known, quick, progress };
  const sources = [
    scanSource({
      ...common, name: 'ZAP', parse: parseZap, perPage: 30, maxPages: 35,
      totalRe: /([\d.]+) Apartamentos/,
      pageUrl: n => `${ZAP_BASE}&precoMinimo=${minPrice}&precoMaximo=${maxPrice}&pagina=${n}`
    }).then(async list => {
      // também data os anúncios guardados que ainda não têm data (mesmo que não tenham vindo nesta busca)
      const inList = new Set(list.map(it => it.key));
      const extra = undated.filter(it => !inList.has(it.key)).map(it => ({ ...it }));
      await zapDates(list.concat(extra), dated, progress);
      extra.forEach(it => { if (it.pubAt) extraDates[it.key] = { pubAt: it.pubAt, updAt: it.updAt }; });
      return list;
    }),
    scanSource({
      ...common, name: 'OLX', parse: parseOlx, perPage: 50, maxPages: 15,
      totalRe: /de ([\d.]+) resultados/,
      pageUrl: n => `${OLX_BASE}&ps=${minPrice}&pe=${maxPrice}&o=${n}`
    })
  ];
  // ZAP e OLX ao mesmo tempo
  const results = await Promise.allSettled(sources);
  // A OLX mostra a data da última renovação. O número do anúncio é sequencial
  // (cerca de 250 mil anúncios novos por dia no Brasil), então dá para estimar
  // quando ele foi criado de fato comparando com o anúncio mais novo da busca.
  if (results[1].status === 'fulfilled') {
    const olx = results[1].value;
    const ref = olx.reduce((b, it) => (+it.id > +b.id && it.pubAt ? it : b), { id: 0 });
    if (ref.pubAt) {
      for (const it of olx) {
        const days = (+ref.id - +it.id) / 250000;
        const est = ref.pubAt - days * 864e5;
        if (it.pubAt && it.pubAt - est > 2 * 864e5) { it.origAt = est; it.renewed = true; }
        else { it.origAt = it.pubAt; it.renewed = false; }
      }
    }
  }
  const items = [], errors = [], complete = [];
  results.forEach((r, i) => {
    const name = i ? 'OLX' : 'ZAP';
    if (r.status === 'fulfilled') { items.push(...r.value); complete.push(name); }
    else errors.push(`${name}: ${r.reason && r.reason.message || r.reason}`);
  });
  return { items, errors, complete, extraDates };
}
