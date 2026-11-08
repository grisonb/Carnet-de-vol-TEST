// v0.21 (R34) : photos d'avions trouvées sur Internet. Réponses de Commons et de Planespotters INVENTÉES
// (immatriculations F-XZZ., auteurs fictifs) ; aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlCategorie, urlRechercheTitre, urlGrande, urlPlanespotters, lirePhotosCommons, fusionnerPhotos, lireGrande,
  lirePlanespotters, creditCommons, texteCredit, texteSimple, motsDuType, MAX_PHOTOS } from '../../js/photos-web.js';
import { sansPhotos, garderPhotos } from '../../js/sauvegarde.js';

const page = (titre, change = {}) => ({ title: titre, imageinfo: [{ mime: 'image/jpeg', thumburl: `https://upload.example/330px-${encodeURIComponent(titre)}`,
  url: 'https://upload.example/original.jpg', descriptionurl: `https://commons.example/wiki/${encodeURIComponent(titre)}`,
  extmetadata: { Artist: { value: '<a href="//commons.example/wiki/User:Essai">User:Jean Essai</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } }, ...change }] });
const reponse = pages => ({ batchcomplete: true, query: { pages } });
const DASH = { typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'DE HAVILLAND CANADA' };

test('adresses : catégorie « immat (aircraft) », titres, grande version, Planespotters ; adresses remplaçables', () => {
  const c = new URL(urlCategorie(' f-xzza '));
  assert.equal(c.origin + c.pathname, 'https://commons.wikimedia.org/w/api.php');
  assert.equal(c.searchParams.get('gcmtitle'), 'Category:F-XZZA (aircraft)');
  assert.equal(c.searchParams.get('origin'), '*', 'CORS anonyme');
  assert.equal(c.searchParams.get('iiurlwidth'), '330');
  assert.equal(new URL(urlRechercheTitre('F-XZZA')).searchParams.get('gsrsearch'), 'intitle:"F-XZZA"');
  assert.equal(new URL(urlGrande('File:Essai.jpg')).searchParams.get('iiurlwidth'), '1280');
  assert.equal(urlPlanespotters('f-xzza'), 'https://api.planespotters.net/pub/photos/reg/F-XZZA');
  globalThis.CARNET_COMMONS = 'http://127.0.0.1:9/w/api.php'; globalThis.CARNET_PLANESPOTTERS = 'http://127.0.0.1:9/reg/';
  try {
    assert.ok(urlCategorie('F-XZZA').startsWith('http://127.0.0.1:9/w/api.php?'));
    assert.equal(urlPlanespotters('F-XZZA'), 'http://127.0.0.1:9/reg/F-XZZA');
  } finally { delete globalThis.CARNET_COMMONS; delete globalThis.CARNET_PLANESPOTTERS; }
});

test('Commons, catégorie : toutes les photos gardées (sauf fichiers non photo ou sans adresse sûre) ; crédit lisible', () => {
  const l = lirePhotosCommons(reponse([page('File:Incendie 2026-07-15.jpg'), page('File:Plan.svg', { mime: 'image/svg+xml' }),
    page('File:Sans adresse.jpg', { thumburl: 'javascript:alert(1)' }), page('File:Sans auteur.jpg', { extmetadata: {} }),
    page('File:Credit &amp; seul.jpg', { extmetadata: { Credit: { value: 'Photo&nbsp;: <b>Club d&#39;essai</b>' } } })]), 'F-XZZA', { categorie: true, avion: DASH });
  assert.deepEqual(l.map(p => p.titre), ['File:Incendie 2026-07-15.jpg', 'File:Sans auteur.jpg', 'File:Credit &amp; seul.jpg']);
  assert.equal(l[0].auteur, 'Jean Essai', 'lien et « User: » retirés');
  assert.equal(l[0].licence, 'CC BY-SA 4.0');
  assert.equal(l[0].aVerifier, false, 'catégorie de l\'immatriculation : fiable');
  assert.equal(l[1].auteur, 'Auteur non indiqué');
  assert.equal(l[1].licence, 'Licence : voir la page de la photo');
  assert.equal(l[2].auteur, "Photo : Club d'essai");
});

test('Commons, titres : seule une photo dont le titre contient l\'immatriculation ; « À vérifier » sans le type', () => {
  const l = lirePhotosCommons(reponse([page('File:F-XZZA Dash 8 Marignane.jpg'), page('File:FXZZA-2024.jpg'), page('File:F-XZZB Dash 8.jpg'),
    page('File:Meeting aérien 2015.jpg')]), 'F-XZZA', { avion: DASH });
  assert.deepEqual(l.map(p => [p.titre, p.aVerifier]), [['File:F-XZZA Dash 8 Marignane.jpg', false], ['File:FXZZA-2024.jpg', true]]);
  assert.deepEqual(lirePhotosCommons(null, 'F-XZZA'), []);
  assert.deepEqual(lirePhotosCommons({ error: { code: 'maxlag' } }, 'F-XZZA'), []);
  assert.ok(motsDuType(DASH).has('dash') && motsDuType(DASH).has('havilland') && !motsDuType(DASH).has('8'));
});

test('fusion : catégorie d\'abord, sans doublon, au plus 24 photos', () => {
  const a = { titre: 'A' }, b = { titre: 'B' }, b2 = { titre: 'B', autre: 1 }, c = { titre: 'C' };
  assert.deepEqual(fusionnerPhotos([a, b], [b2, c]), [a, b, c]);
  const beaucoup = Array.from({ length: 40 }, (_, i) => ({ titre: 'T' + i }));
  assert.equal(fusionnerPhotos(beaucoup, [a]).length, MAX_PHOTOS);
});

test('grande version : 1280 px, sinon l\'original ; crédit gardé avec la photo', () => {
  assert.equal(lireGrande(reponse([page('File:X.jpg', { thumburl: 'https://upload.example/1280px-X.jpg' })])), 'https://upload.example/1280px-X.jpg');
  assert.equal(lireGrande(reponse([page('File:X.jpg', { thumburl: undefined })])), 'https://upload.example/original.jpg');
  assert.equal(lireGrande({}), '');
  const p = lirePhotosCommons(reponse([page('File:F-XZZA Dash 8.jpg')]), 'F-XZZA', { avion: DASH })[0];
  const c = creditCommons(p);
  assert.deepEqual(Object.keys(c).sort(), ['auteur', 'licence', 'licenceUrl', 'page', 'source', 'titre']);
  assert.equal(texteCredit(c), 'Photo : Jean Essai · CC BY-SA 4.0 · Wikimedia Commons');
  assert.equal(texteCredit(null), '');
  assert.equal(texteSimple('x'.repeat(100), 10), 'xxxxxxxxx…');
});

test('Planespotters : une photo affichée avec photographe et lien ; rien sinon', () => {
  const ps = { photos: [{ id: '1', thumbnail: { src: 'https://t.example/1_t.jpg' }, thumbnail_large: { src: 'https://t.example/1_280.jpg' },
    link: 'https://www.planespotters.example/photo/1/f-xzza', photographer: 'Marie Essai' }] };
  assert.deepEqual(lirePlanespotters(ps), { vignette: 'https://t.example/1_280.jpg', lien: 'https://www.planespotters.example/photo/1/f-xzza', photographe: 'Marie Essai' });
  assert.equal(lirePlanespotters({ photos: [] }), null);
  assert.equal(lirePlanespotters({ error: 'x' }), null);
  assert.equal(lirePlanespotters({ photos: [{ ...ps.photos[0], link: 'javascript:x' }] }), null);
});

test('sauvegardes : la copie NAS retire la photo ET son crédit ; la restauration les remet ensemble', () => {
  const credit = { source: 'Wikimedia Commons', auteur: 'Jean Essai', licence: 'CC BY 4.0', licenceUrl: '', page: 'https://commons.example/x', titre: 'File:x.jpg' };
  const s = { vols: [], avions: [{ id: 'a1', immat: 'F-XZZA', photo: 'data:image/jpeg;base64,AAA', photoCredit: credit }, { id: 'a2', immat: 'F-XZZB', photo: 'data:x' }] };
  const nas = sansPhotos(s);
  assert.ok(nas.avions.every(a => !('photo' in a) && !('photoCredit' in a)));
  const { donnees, gardees } = garderPhotos(nas, s.avions);
  assert.equal(gardees, 2);
  assert.deepEqual(donnees.avions[0].photoCredit, credit);
  assert.equal(donnees.avions[0].photo, 'data:image/jpeg;base64,AAA');
  assert.equal(donnees.avions[1].photoCredit, null, 'photo prise au téléphone : pas de crédit');
});
