// Em que posto fica o anúncio, pela rua (ZAP) ou pelo título (OLX).
// Ruas conferidas no guia de ruas copacabana24horas.com.br:
//   Posto 5: Xavier da Silveira, Miguel Lemos, Djalma Ulrich, Sá Ferreira, Leopoldo Miguez, Aires Saldanha, Pompeu Loureiro
//   Posto 5/6: Souza Lima, Almirante Gonçalves, Raul Pompéia
//   Posto 6: Francisco Sá, Júlio de Castilhos, Rainha Elizabeth, Conselheiro Lafaiete, Bulhões de Carvalho,
//            Francisco Otaviano, Joaquim Nabuco, Gomes Carneiro, Saint Roman
//   Divisa 4/5 (fora do filtro padrão): Constante Ramos, Barão de Ipanema, Bolívar
//   Posto 4 (fora): Dias da Rocha, Edmundo Lins e demais
const RE_56 = /Souza Lima|Sousa Lima|Almirante Gon[cç]alves|Raul Pomp[eé]ia/i;
const RE_5 = /Xavier da Silveira|Miguel Lemos|Djalma Ulrich|S[aá] Ferreira|Leopoldo Miguez|Aires Saldanha|Pompeu Loureiro|posto ?5\b|posto cinco/i;
const RE_6 = /Francisco S[aá](?![a-zà-ú])|J[uú]lio de Castilho|Rainha Elizabeth|Conselheiro Lafa|Bulh[oõ]es de Carvalho|Francisco Otaviano|Joaquim Nabuco|Gomes Carneiro|Saint.?Roman|Arpoador|posto ?6\b|posto seis|Forte de Copa/i;
// ruas longas, que passam por vários postos: aí vale o que o título disser
const RE_LONG = /Barata Ribeiro|Nossa Senhora de Copacabana|Atl[aâ]ntica|Tonelero/i;
const RE_DIV = /Constante Ramos|Bar[aã]o de Ipanema|Bol[ií]var/i;

function classify(item) {
  const rua = item.rua || '';
  const title = item.title || '';
  // a rua informada (ZAP) vale mais que o título
  for (const text of [rua, title]) {
    if (!text) continue;
    if (RE_56.test(text)) return 'Posto 5/6';
    const p5 = RE_5.test(text), p6 = RE_6.test(text);
    if (p5 && p6) return 'Posto 5/6';
    if (p5) return 'Posto 5';
    if (p6) return 'Posto 6';
    if (RE_DIV.test(text)) return 'Divisa 4/5';
    if (rua && text === rua && !RE_LONG.test(rua)) return '';   // rua conhecida fora do Posto 5/6: não usa o título
  }
  return '';
}
const isTarget = p => p === 'Posto 5' || p === 'Posto 6' || p === 'Posto 5/6';
