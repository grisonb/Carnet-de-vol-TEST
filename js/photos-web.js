// v0.21 (R34) : photos d'avions trouvées sur Internet, par immatriculation.
// - Wikimedia Commons : photos sous licence libre (CC BY, CC BY-SA, domaine public). Le pilote CHOISIT une photo ; elle
//   est gardée dans la fiche avec son crédit (auteur, licence, lien), affiché sous la photo.
//   Recherche : catégorie « <immat> (aircraft) » (fiable), puis fichiers dont le TITRE contient l'immatriculation.
// - Planespotters.net : une seule photo, AFFICHÉE en ligne avec le nom du photographe et un lien vers sa page,
//   JAMAIS gardée (ses conditions interdisent d'enregistrer l'image sur l'appareil).
// Aucune clé, aucun serveur intermédiaire : l'app appelle ces deux sites directement (CORS autorisé).
// Adresses remplaçables pour les tests (faux serveurs locaux) : CARNET_COMMONS, CARNET_PLANESPOTTERS.

export const commonsApi = () => globalThis.CARNET_COMMONS || 'https://commons.wikimedia.org/w/api.php';
export const planespottersApi = () => globalThis.CARNET_PLANESPOTTERS || 'https://api.planespotters.net/pub/photos/reg/';
// Identification demandée par Wikimedia aux applications web (en-tête autorisé par Commons)
export const AGENT = 'CarnetDeVol (https://github.com/grisonb/Carnet-de-vol-TEST)';
export const MAX_PHOTOS = 24;
const VIGNETTE = 330, GRANDE = 1280;

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Texte simple à partir du HTML des métadonnées Commons (auteur souvent sous forme de lien)
export function texteSimple(html, max = 80) {
  const t = String(html || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
const https = u => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : '');

// Paramètres communs : vignettes de 330 px, auteur et licence, réponse simple (formatversion=2)
function parametres(p) {
  return new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata', iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl', ...p });
}
export const urlCategorie = immat => `${commonsApi()}?${parametres({ generator: 'categorymembers', gcmtype: 'file', gcmlimit: String(MAX_PHOTOS),
  gcmtitle: `Category:${String(immat).trim().toUpperCase()} (aircraft)`, iiurlwidth: String(VIGNETTE) })}`;
export const urlRechercheTitre = immat => `${commonsApi()}?${parametres({ generator: 'search', gsrnamespace: '6', gsrlimit: '20',
  gsrsearch: `intitle:"${String(immat).trim().toUpperCase()}"`, iiurlwidth: String(VIGNETTE) })}`;
export const urlGrande = titre => `${commonsApi()}?${parametres({ titles: titre, iiurlwidth: String(GRANDE) })}`;
export const urlPlanespotters = immat => planespottersApi() + encodeURIComponent(String(immat).trim().toUpperCase());

// Mots qui désignent le type de l'avion (pour signaler une photo dont le titre ne le mentionne pas)
export function motsDuType(avion) {
  const m = new Set(String([avion?.constructeur, avion?.modele, avion?.typeOACI].join(' ')).toLowerCase()
    .split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w)));
  if (/^DH8/.test(avion?.typeOACI || '')) for (const w of ['dhc', 'dash', 'q400', 'bombardier', 'havilland']) m.add(w);
  return m;
}

// Photos d'une réponse Commons. categorie : vraie si la réponse vient de la catégorie de l'immatriculation (fiable) ;
// sinon seuls les fichiers dont le titre contient l'immatriculation sont gardés.
export function lirePhotosCommons(json, immat, { categorie = false, avion = null } = {}) {
  const pages = json && json.query && Array.isArray(json.query.pages) ? json.query.pages : [];
  const cle = norm(immat), mots = motsDuType(avion);
  const res = [];
  for (const p of pages) {
    const ii = p && Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime || '') || !https(ii.thumburl) || !https(ii.descriptionurl)) continue;
    const titre = String(p.title || '');
    if (!categorie && (!cle || !norm(titre).includes(cle))) continue;
    const em = ii.extmetadata || {};
    const val = k => (em[k] && em[k].value) || '';
    const t = titre.toLowerCase();
    res.push({
      titre, vignette: ii.thumburl, page: ii.descriptionurl, categorie,
      auteur: (texteSimple(val('Artist')) || texteSimple(val('Credit'))).replace(/^(User|Utilisateur):/i, '') || 'Auteur non indiqué',
      licence: texteSimple(val('LicenseShortName'), 40) || 'Licence : voir la page de la photo',
      licenceUrl: https(val('LicenseUrl')),
      aVerifier: !categorie && ![...mots].some(w => t.includes(w)),
    });
  }
  return res;
}

// Catégorie d'abord (fiable), puis les titres ; sans doublon ; au plus MAX_PHOTOS
export function fusionnerPhotos(...listes) {
  const vus = new Set(), res = [];
  for (const l of listes) for (const p of l) {
    if (vus.has(p.titre) || res.length >= MAX_PHOTOS) continue;
    vus.add(p.titre); res.push(p);
  }
  return res;
}

// Adresse de la grande version (1280 px, ou l'original s'il est plus petit)
export function lireGrande(json) {
  const p = json && json.query && Array.isArray(json.query.pages) ? json.query.pages[0] : null;
  const ii = p && Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
  return ii ? https(ii.thumburl) || https(ii.url) : '';
}

// Crédit gardé dans la fiche avec la photo choisie
export const creditCommons = p => ({ source: 'Wikimedia Commons', auteur: p.auteur, licence: p.licence, licenceUrl: p.licenceUrl, page: p.page, titre: p.titre });
export const texteCredit = c => (c ? `Photo : ${c.auteur} · ${c.licence} · ${c.source}` : '');

// Planespotters : { vignette, lien, photographe } ou null (adresses gardées telles quelles, comme l'exigent ses règles)
export function lirePlanespotters(json) {
  const p = json && Array.isArray(json.photos) ? json.photos[0] : null;
  if (!p) return null;
  const vignette = https(p.thumbnail_large && p.thumbnail_large.src) || https(p.thumbnail && p.thumbnail.src);
  const lien = https(p.link);
  if (!vignette || !lien) return null;
  return { vignette, lien, photographe: texteSimple(p.photographer) || 'Photographe non indiqué' };
}
