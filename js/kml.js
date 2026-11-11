// v0.32 (R81) : fichier KML des feux d'un vol, à importer dans le projet Google Earth « Feux » (à la main : il n'existe
// pas d'interface publique pour écrire dans un projet Google Earth). Aucun appel réseau : le fichier est fabriqué ici.
// Nom des points comme ceux du pilote : « Feu n°12 / 2026 / VILLE SUR ESSAI » (sans commune : « Feu n°12 / 2026 »).

import { numeroFeu, estLigneFeu, normaliser } from './missions.js';

// Icône « pompiers » (flamme) de la palette standard de Google Earth ; libellé orange (KML : aabbggrr)
export const ICONE_FLAMME = 'http://maps.google.com/mapfiles/kml/shapes/firedept.png';
const ORANGE_KML = 'ff1a8cff';

const xml = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const communeMajuscules = c => String(c || '').trim().toUpperCase().replace(/[-‐‑–—_]+/g, ' ').replace(/\s+/g, ' ').trim();
const pourFichier = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Numéro de chaque position de feu du vol : n° gardé avec la position, sinon la ligne « FEU n°… » de la même commune
// (commune envoyée par NPF-Q400, gardée même si la flamme a été déplacée), sinon dans l'ordre s'il y a autant de lignes.
export function numerosDesFeux(vol) {
  const feux = (vol && vol.feuxPositions) || [];
  const lignes = (vol.missions || []).filter(estLigneFeu).map(t => ({ t, n: numeroFeu(t), cle: normaliser(t) })).filter(l => l.n !== null);
  const libres = [...lignes], res = feux.map(f => (Number(f.numero) > 0 ? Number(f.numero) : null));
  const prendre = l => { libres.splice(libres.indexOf(l), 1); return l.n; };
  for (const l of lignes) if (res.includes(l.n)) libres.splice(libres.indexOf(l), 1);
  feux.forEach((f, i) => {
    if (res[i] !== null) return;
    const c = normaliser(f.communeNpf || f.commune || f.nom || '');
    const l = c && libres.find(x => x.cle.includes(c));
    if (l) res[i] = prendre(l);
  });
  const restants = res.filter(x => x === null).length;
  if (restants && restants === libres.length) feux.forEach((f, i) => { if (res[i] === null) res[i] = prendre(libres[0]); });
  return res;
}

export function nomPoint(numero, annee, commune) {
  const c = communeMajuscules(commune);
  return [numero ? `Feu n°${numero}` : 'Feu', annee, c].filter(Boolean).join(' / ');
}

// Points KML d'un vol (ou d'un seul feu : indice) : [{ nom, lat, lon, numero, commune }]
export function pointsFeux(vol, indice = null) {
  const annee = String(vol.date || '').slice(0, 4), nums = numerosDesFeux(vol);
  return (vol.feuxPositions || []).map((f, i) => ({ f, i }))
    .filter(({ f, i }) => (indice === null || i === indice) && typeof f.lat === 'number' && typeof f.lon === 'number')
    .map(({ f, i }) => {
      const commune = f.communeAVenir ? '' : (f.commune || '');
      return { nom: nomPoint(nums[i], annee, commune), lat: f.lat, lon: f.lon, numero: nums[i], commune };
    });
}

// Nom du fichier : « Feu-12-2026-VILLE-SUR-ESSAI.kml » (un feu) ou « Feux-JJ-MM-AAAA.kml » (tout le vol)
export function nomFichierKml(vol, points, unSeul) {
  if (unSeul && points.length === 1) {
    const p = points[0];
    return ['Feu', p.numero || '', String(vol.date || '').slice(0, 4), pourFichier(p.commune)].filter(Boolean).join('-') + '.kml';
  }
  const d = String(vol.date || '');
  return `Feux-${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}.kml`;
}

export function texteKml(titre, points) {
  const coord = x => String(Math.round(x * 1e6) / 1e6);
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${xml(titre)}</name>
<Style id="feu"><IconStyle><scale>1.2</scale><Icon><href>${ICONE_FLAMME}</href></Icon></IconStyle><LabelStyle><color>${ORANGE_KML}</color><scale>1.1</scale></LabelStyle></Style>
${points.map(p => `<Placemark>
<name>${xml(p.nom)}</name>
<styleUrl>#feu</styleUrl>
<Point><coordinates>${coord(p.lon)},${coord(p.lat)},0</coordinates></Point>
</Placemark>`).join('\n')}
</Document>
</kml>
`;
}

// Tout ce qu'il faut pour un envoi : { nom, texte, points } ou null s'il n'y a aucune position
export function kmlDuVol(vol, indice = null) {
  const points = pointsFeux(vol, indice);
  if (!points.length) return null;
  const nom = nomFichierKml(vol, points, indice !== null);
  const d = String(vol.date || '');
  const titre = indice !== null ? points[0].nom : `Feux du ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return { nom, texte: texteKml(titre, points), points };
}
