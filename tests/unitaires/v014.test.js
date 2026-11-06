// v0.14 : copie NAS sans photos (R35), PDF centré (R36) et polices plus grandes (R37). Données INVENTÉES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde, sansPhotos, garderPhotos } from '../../js/sauvegarde.js';
import { paginer, dessinerPDF, TAILLES, MINI, LIGNES_PAR_PAGE } from '../../js/pdf.js';
import { chargerJsPDF, enregistreur, textesDansCases } from '../outils/pdf-noeud.js';
import { volsPDF } from '../outils/vols-pdf.js';

const PHOTO_A = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
const PHOTO_B = 'data:image/jpeg;base64,' + 'B'.repeat(4000);
const contenu = () => ({
  vols: [{ id: 'v1', date: '2025-05-06', avionId: 'a1' }, { id: 'v2', date: '2025-05-07', avionId: 'a2' }],
  avions: [{ id: 'a1', immat: 'F-XZZA', nom: 'ZX1', photo: PHOTO_A }, { id: 'a2', immat: 'F-XZZB', photo: null }],
  personnes: [{ id: 'p1', tri: 'ZZZ' }], suppressions: [],
  reglages: [{ cle: 'regles', valeur: [] }, { cle: 'etiquettes', valeur: ['ESSAI'] }, { cle: 'nasMotDePasse', valeur: 'secret' }],
});

test('copie NAS : sans photo d\'avion, avec toutes les données', () => {
  const complet = creerSauvegarde(contenu());
  const s = sansPhotos(complet);
  assert.ok(s.avions.every(a => !('photo' in a)), 'aucune photo dans la copie NAS');
  assert.equal(s.sansPhotos, true);
  assert.deepEqual(s.avions.map(a => a.immat), ['F-XZZA', 'F-XZZB']);
  assert.equal(s.avions[0].nom, 'ZX1');
  assert.deepEqual(s.vols, complet.vols); assert.deepEqual(s.personnes, complet.personnes);
  assert.deepEqual(s.reglages.map(r => r.cle), ['regles', 'etiquettes'], 'règles et étiquettes gardées, mot de passe jamais copié');
  assert.ok(texteSauvegarde(s).length < texteSauvegarde(complet).length - 3000, 'la copie est plus petite');
  assert.equal(lireSauvegarde(texteSauvegarde(s)).ok, true, 'la copie se relit comme une sauvegarde');
  // la sauvegarde de secours manuelle garde les photos, et sansPhotos ne la modifie pas
  assert.equal(complet.avions[0].photo, PHOTO_A);
  assert.equal(lireSauvegarde(texteSauvegarde(complet)).donnees.avions[0].photo, PHOTO_A);
});

test('restauration depuis le NAS : les photos du téléphone sont gardées', () => {
  const copie = lireSauvegarde(texteSauvegarde(sansPhotos(creerSauvegarde(contenu())))).donnees;
  // téléphone : photo A sur a1 ; photo B sur un avion F-XZZB recréé avec un autre identifiant ; un avion absent de la copie
  const telephone = [{ id: 'a1', immat: 'F-XZZA', photo: PHOTO_A }, { id: 'autre', immat: 'f-xzzb', photo: PHOTO_B },
    { id: 'a9', immat: 'F-XZZZ', photo: PHOTO_B }];
  const { donnees, gardees } = garderPhotos(copie, telephone);
  assert.equal(donnees.avions.find(a => a.id === 'a1').photo, PHOTO_A, 'même avion (même identifiant) : photo gardée');
  assert.equal(donnees.avions.find(a => a.id === 'a2').photo, PHOTO_B, 'même immatriculation : photo gardée');
  assert.equal(gardees, 2);
  assert.equal(donnees.avions.length, 2, 'aucun avion ajouté');
  assert.deepEqual(donnees.vols, copie.vols);
  // une ancienne copie qui contient encore une photo : c'est celle de la copie qui compte
  const ancienne = lireSauvegarde(texteSauvegarde(creerSauvegarde(contenu()))).donnees;
  assert.equal(garderPhotos(ancienne, [{ id: 'a1', immat: 'F-XZZA', photo: PHOTO_B }]).donnees.avions[0].photo, PHOTO_A);
  // un avion sans photo nulle part reste sans photo
  assert.ok(!garderPhotos(copie, []).donnees.avions[1].photo);
});

const J = chargerJsPDF();
async function dessiner(n) {
  const { vols, avions } = volsPDF(n);
  const e = enregistreur(J);
  const doc = await dessinerPDF(e.jsPDF, paginer(vols, avions), avions, { titulaire: 'PILOTE TEST' });
  return { doc, traces: e.traces, vols };
}

test('PDF : même nombre de pages et de lignes par page', async () => {
  assert.equal(LIGNES_PAR_PAGE, 18);
  const { doc, traces } = await dessiner(40);
  assert.equal(doc.getNumberOfPages(), 3); // 40 vols = 18 + 18 + 4
  // lignes de vol : cases de 7 mm de haut, 24 colonnes ; 18 lignes par page
  const lignes = p => new Set(traces.filter(t => t.type === 'rect' && t.page === p && t.h === 7).map(t => t.y)).size;
  assert.deepEqual([lignes(1), lignes(2), lignes(3)], [18, 18, 18]);
});

test('PDF : polices plus grandes qu\'en v0.13', () => {
  assert.ok(TAILLES.titre > 5.4 && TAILLES.sousTitre > 5.4 && TAILLES.saisie > 6.4 && TAILLES.remarque > 5.6);
  assert.ok(MINI.saisie >= 6.4 && MINI.remarque >= 5.6, 'jamais plus petit qu\'avant');
});

test('PDF : aucun texte ne sort de sa case, tout est centré (heures ≥ 10:00, noms longs, mission longue)', async () => {
  const { traces } = await dessiner(18);
  const cellules = textesDansCases(traces);
  assert.ok(cellules.length > 300);
  const T = 0.05;
  for (const { t, b, c } of cellules) {
    const ou = `« ${t.texte} » (${t.taille} pt) dans la case x=${c.x.toFixed(1)} l=${c.l}`;
    assert.ok(b.g >= c.x - T && b.d <= c.x + c.l + T, 'sort à gauche ou à droite : ' + ou);
    assert.ok(b.haut >= c.y - T && b.bas <= c.y + c.h + T, 'sort en haut ou en bas : ' + ou);
    if (t.align === 'center') {
      assert.ok(Math.abs(b.cx - (c.x + c.l / 2)) < 0.01, 'pas centré horizontalement : ' + ou);
      assert.ok(Math.abs(t.y - (c.y + c.h / 2)) < 0.01 && t.baseline === 'middle', 'pas centré verticalement : ' + ou);
    }
  }
  const textes = cellules.map(x => x.t);
  // heures ≥ 10:00, départ 23:59, dates : en entier, à la taille des saisies
  for (const h of ['10:45', '12:30', '23:59', '10:44', '10:15', '10:40', '10/01/20', 'WMKK', 'F-XZZB', 'DH8D', 'DR40']) {
    const l = textes.filter(t => t.texte === h);
    assert.ok(l.length, `« ${h} » écrit en entier`);
    assert.ok(l.every(t => t.taille === TAILLES.saisie), `« ${h} » à ${TAILLES.saisie} pt`);
  }
  assert.ok(!textes.some(t => /^\d|^[A-Z]{4}$/.test(t.texte) && t.texte.includes('...')), 'aucune heure ni code coupé');
  // nom très long : réduit puis coupé proprement par « ... », dans sa case ; mission longue : 2 lignes alignées à gauche
  assert.ok(textes.some(t => t.texte.startsWith('DUPONT') && t.texte.endsWith('...')));
  const longues = textes.filter(t => t.texte.startsWith('ESSAI MISSION LONGUE'));
  assert.ok(longues.length && longues.every(t => t.align === 'left'), 'remarque longue alignée à gauche');
  assert.ok(textes.some(t => t.texte === 'ENT. TEST' && t.align === 'center'), 'remarque courte centrée');
});

test('PDF : la colonne Modèle affiche le code type OACI (sinon le modèle)', async () => {
  const { vols, avions } = volsPDF(4);
  const sans = [...avions.values()][0];
  const avions2 = new Map([...avions].map(([id, a]) => [id, a === sans ? { ...a, typeOACI: '', modele: 'Modele essai' } : a]));
  const e = enregistreur(J);
  await dessinerPDF(e.jsPDF, paginer(vols, avions2), avions2, { titulaire: 'PILOTE TEST' });
  const modeles = textesDansCases(e.traces).filter(x => x.c.l === 16 && x.c.h === 7).map(x => x.t.texte);
  const attendus = vols.map(v => avions2.get(v.avionId)).map(a => a.typeOACI || a.modele);
  assert.deepEqual(modeles, attendus);
  assert.ok(modeles.includes('DH8D') && modeles.includes('Modele essai'), modeles.join(', '));
  assert.ok(!modeles.some(m => m.startsWith('Dash')), 'plus le nom complet « Dash 8 Q400 »');
});
