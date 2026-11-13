// v0.38 (R93) : cadrage de la photo d'un avion (calcul, garde avec la photo : synchro, copie NAS, restauration).
// Avions et photos INVENTÉS (une « photo » est ici un simple texte data:).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placement, deplacer, zoomer, cadrageValide, ZOOM_MAX } from '../../js/cadrage.js';
import { elementsDuCarnet } from '../../js/synchro.js';
import { sansPhotos, garderPhotos } from '../../js/sauvegarde.js';

const pres = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('sans cadrage : comme avant (remplit le bandeau, centré)', () => {
  const p = placement(260, 195, 390, 190, null); // photo 4:3, bandeau très large
  assert.ok(pres(p.w, 390) && p.h >= 190 && pres(p.left, 0) && pres(p.top, (190 - p.h) / 2));
});

test('le zoom minimum remplit toujours le bandeau, jamais de bande vide', () => {
  for (const c of [{ cx: 0, cy: 0, z: 0.2 }, { cx: 1, cy: 1, z: 1 }, { cx: 0.5, cy: 0.9, z: 3 }, { cx: -4, cy: 7, z: 99 }]) {
    const p = placement(260, 195, 390, 190, c);
    assert.ok(p.left <= 1e-9 && p.top <= 1e-9 && p.left + p.w >= 390 - 1e-9 && p.top + p.h >= 190 - 1e-9, JSON.stringify(c));
    assert.ok(p.cadre.z >= 1 && p.cadre.z <= ZOOM_MAX);
  }
});

test('glisser fait suivre la photo au doigt ; zoomer garde le centre', () => {
  const c0 = { cx: 0.5, cy: 0.5, z: 2 };
  const c1 = deplacer(c0, 30, 0, 260, 195, 390, 190);
  assert.ok(c1.cx < 0.5 && pres(c1.cy, 0.5)); // doigt vers la droite : on voit plus à gauche
  const p0 = placement(260, 195, 390, 190, c0), p1 = placement(260, 195, 390, 190, c1);
  assert.ok(pres(p1.left - p0.left, 30, 1e-6));
  const c2 = zoomer(c0, 1.5, 260, 195, 390, 190);
  assert.ok(pres(c2.z, 3) && pres(c2.cx, 0.5) && pres(c2.cy, 0.5));
  assert.equal(zoomer(c0, 0.01, 260, 195, 390, 190).z, 1);
});

test('même cadrage, autre largeur (téléphone / iPad) : même centre gardé', () => {
  const c = { cx: 0.3, cy: 0.6, z: 2 };
  assert.deepEqual(cadrageValide(placement(260, 195, 360, 190, c).cadre), cadrageValide(c));
  assert.equal(cadrageValide({ cx: NaN, cy: 0, z: 1 }), null);
});

test('le cadrage suit la photo : jamais envoyé par la synchro ni la copie NAS, remis à la restauration', () => {
  const a = { id: 'a1', immat: 'F-XZZA', photo: 'data:image/jpeg;base64,ESSAI', photoCredit: null, photoCadre: { cx: 0.3, cy: 0.5, z: 2 } };
  const el = elementsDuCarnet({ vols: [], avions: [a], personnes: [], reglages: [] }).find(x => x.magasin === 'avions');
  assert.ok(!('photo' in el.donnees) && !('photoCadre' in el.donnees));
  const copie = sansPhotos({ vols: [], avions: [a], personnes: [], reglages: [] });
  assert.ok(!('photo' in copie.avions[0]) && !('photoCadre' in copie.avions[0]));
  const { donnees } = garderPhotos(copie, [a]);
  assert.deepEqual(donnees.avions[0].photoCadre, a.photoCadre);
  assert.equal(donnees.avions[0].photo, a.photo);
});
