// v0.32 (R81) : fichier KML des feux d'un vol, à importer dans le projet Google Earth « Feux » (à la main : il n'existe
// pas d'interface publique pour écrire dans un projet Google Earth). Aucun appel réseau : le fichier est fabriqué ici.
// v0.33 (R82) : style des feux du projet (épingle flamme bleue, petite ; libellé jaune).
// Nom des points comme ceux du pilote : « Feu n°12 / 2026 / VILLE SUR ESSAI » (sans commune : « Feu n°12 / 2026 »).

import { numeroFeu, estLigneFeu, normaliser } from './missions.js';

// v0.33 (R82) : même style que les feux du projet Google Earth du pilote.
// Icône : l'épingle « flamme » de la bibliothèque d'icônes de Google Earth web (n° 2124), en bleu #1976D2 : Google Earth
// web écrit ses icônes ainsi (couleur dans l'adresse, pas de <color> d'icône) ; la pointe de l'épingle est sur le point
// (hotSpot 64 / 128, comme dans les fichiers exportés par Google Earth web). Taille « Petite » : 0.8 (« Moyenne » = 1,
// sans <scale> dans ses fichiers). Libellé : jaune #FBC02D (KML : aabbggrr), taille « Moyenne (par défaut) » = 1.
// Le Carnet ne charge jamais cette icône : c'est Google Earth qui la lit à l'import.
export const ICONE_ID = 2124;
export const ICONE_COULEUR = '1976d2';
export const ICONE_FLAMME = `https://earth.google.com/earth/rpc/cc/icon?color=${ICONE_COULEUR}&id=${ICONE_ID}&scale=4`;
export const ICONE_TAILLE = 0.8;
export const LIBELLE_COULEUR = 'ff2dc0fb';
export const LIBELLE_TAILLE = 1;

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
<Style id="feu"><IconStyle><scale>${ICONE_TAILLE}</scale><Icon><href>${xml(ICONE_FLAMME)}</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle><LabelStyle><color>${LIBELLE_COULEUR}</color><scale>${LIBELLE_TAILLE}</scale></LabelStyle></Style>
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
