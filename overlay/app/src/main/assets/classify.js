// Em que posto fica o anúncio, pela rua (ZAP) ou pelo título (OLX).
// Divisão combinada com o Thiago:
//   Posto 5: Constante Ramos, Barão de Ipanema, Bolívar, Xavier da Silveira, Miguel Lemos, Djalma Ulrich
//            (e as paralelas Leopoldo Miguez, Aires Saldanha, Pompeu Loureiro)
//   Posto 5/6: Sá Ferreira (entre a Djalma Ulrich e a Sousa Lima)
//   Posto 6: Sousa Lima, Almirante Gonçalves, Raul Pompéia, Francisco Sá, Júlio de Castilhos, Rainha Elisabeth,
//            Francisco Otaviano, Joaquim Nabuco, Conselheiro Lafaiete, Bulhões de Carvalho, Gomes Carneiro, Saint Roman
//   Fora (Posto 4): Dias da Rocha, Edmundo Lins
const RE_OUT = /Dias da Rocha|Edmundo Lins/i;
const RE_56 = /S[aá] Ferreira/i;
const RE_5 = /Constante Ramos|Bar[aã]o de Ipanema|Bol[ií]var|Xavier da Silveira|Miguel Lemos|Djalma Ulrich|Leopoldo Miguez|Aires Saldanha|Pompeu Loureiro|posto ?5\b|posto cinco/i;
const RE_6 = /So[uv]?za Lima|Sousa Lima|Almirante Gon[cç]alves|Raul Pomp[eé]ia|Francisco S[aá](?![a-zà-ú])|J[uú]lio de Castilho|Rainha Eli[sz]abeth|Conselheiro Lafa|Bulh[oõ]es de Carvalho|Francisco Otaviano|Joaquim Nabuco|Gomes Carneiro|Saint.?Roman|Arpoador|posto ?6\b|posto seis|Forte de Copa/i;
// ruas longas, que passam por vários postos: aí vale o que o título disser
const RE_LONG = /Barata Ribeiro|Nossa Senhora de Copacabana|Atl[aâ]ntica|Tonelero/i;
const RE_DIV = /(?!)/; // não usado mais (a antiga divisa 4/5 agora conta como Posto 5)

function classify(item) {
  const rua = item.rua || '';
  const title = item.title || '';
  if (RE_OUT.test(rua)) return '';
  // a rua informada (ZAP) vale mais que o título
  for (const text of [rua, title]) {
    if (!text) continue;
    if (RE_56.test(text)) return 'Posto 5/6';
    const p5 = RE_5.test(text), p6 = RE_6.test(text);
    if (p5 && p6) return 'Posto 5/6';
    if (p5) return 'Posto 5';
    if (p6) return 'Posto 6';
    if (RE_OUT.test(text)) return '';
    if (rua && text === rua && !RE_LONG.test(rua)) return '';   // rua conhecida fora do Posto 5/6: não usa o título
  }
  return '';
}
const isTarget = p => p === 'Posto 5' || p === 'Posto 6' || p === 'Posto 5/6';
