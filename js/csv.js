// Lecture et écriture CSV (RFC 4180 : guillemets, retours à la ligne dans un champ).

export function lireCSV(texte) {
  if (texte.charCodeAt(0) === 0xFEFF) texte = texte.slice(1);
  const premiere = texte.slice(0, Math.max(0, texte.search(/\r?\n/)) || texte.length);
  const sep = premiere.split(';').length > premiere.split(',').length ? ';' : ',';
  const lignes = [];
  let ligne = [], champ = '', entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else entreGuillemets = false;
      } else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter(l => !(l.length === 1 && l[0] === ''));
}

export function lireCSVObjets(texte) {
  const [entetes = [], ...lignes] = lireCSV(texte);
  const noms = entetes.map(e => e.trim());
  return { entetes: noms, lignes: lignes.map(l => Object.fromEntries(noms.map((n, i) => [n, l[i] ?? '']))) };
}

const proteger = (v, sep) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};

// BOM UTF-8 + séparateur « ; » + fins de ligne CRLF : Excel (français) et LibreOffice l'ouvrent directement.
export function ecrireCSV(entetes, lignes, sep = ';') {
  const out = [entetes.map(e => proteger(e, sep)).join(sep)];
  for (const l of lignes) out.push(l.map(v => proteger(v, sep)).join(sep));
  return '﻿' + out.join('\r\n') + '\r\n';
}
