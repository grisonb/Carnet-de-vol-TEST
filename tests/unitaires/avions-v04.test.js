// v0.4 : ligne avion, étiquettes par avion, monopilote, terrains, migration (avions et vols INVENTÉS)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ligneAvion, etiquettesParDefaut, etiquettesDeLAvion, basculerEtiquette, etiquettesPourAvion,
  etiquettesPourTrain, fonctionsPossibles, champPersonneVisible, completerNomIndicatif, migrerAvionsV04,
  avionVide } from '../../js/modele.js';
import { definirTerrains, definirTerrainsPerso, terrain, nombreTerrains } from '../../js/terrains.js';
import { lireTerrainSaisi } from '../../js/ui/terrain-perso.js';
import { analyserFlyLog } from '../../js/flylog.js';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const avion = o => Object.assign(avionVide(), o);
const dash = avion({ immat: 'F-XQAA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', equipage: 'MP', moteurs: 'ME', nom: 'Q1', indicatif: 'QUEBEC 1' });
const cessna = avion({ immat: 'F-XQBB', typeOACI: 'C177', modele: 'Cardinal', equipage: 'SP', moteurs: 'SE' });
const piper = avion({ immat: 'F-XQCC', typeOACI: 'PA18', modele: 'Super Cub', equipage: 'SP', moteurs: 'SE', train: 'classique' });

test('ligne avion : NOM · modèle · IMMAT, sans nom : IMMAT · modèle (jamais deux fois)', () => {
  assert.deepEqual(ligneAvion(dash), { debut: 'Q1', modele: 'Dash 8 Q400', fin: 'F-XQAA' });
  assert.deepEqual(ligneAvion(cessna), { debut: 'F-XQBB', modele: 'Cardinal', fin: '' });
  assert.deepEqual(ligneAvion({ ...cessna, nom: 'f-xqbb' }), { debut: 'F-XQBB', modele: 'Cardinal', fin: '' });
  const l = ligneAvion(dash);
  assert.ok(![l.debut, l.modele, l.fin].join(' ').includes('QUEBEC'), "l'indicatif radio n'est pas affiché");
});

test('étiquettes par défaut : BOMBING + TRANSPORT seulement pour DH8D, TAILWHEEL pour train classique', () => {
  assert.deepEqual(etiquettesParDefaut(dash), ['BOMBING', 'TRANSPORT']);
  assert.deepEqual(etiquettesParDefaut(cessna), []);
  assert.deepEqual(etiquettesParDefaut(piper), ['TAILWHEEL']);
  assert.deepEqual(etiquettesParDefaut(avion({ sim: true, typeOACI: 'DH8D' })), []);
});

test('la saisie ne propose que les étiquettes cochées dans la fiche de l\'avion', () => {
  assert.deepEqual(etiquettesDeLAvion({ ...dash, etiquettes: ['BOMBING', 'TRANSPORT'] }), ['BOMBING', 'TRANSPORT']);
  assert.deepEqual(etiquettesDeLAvion(cessna), [], 'avion sans étiquette : rien (juste le +)');
  assert.deepEqual(etiquettesDeLAvion({ ...piper, etiquettes: [] }), ['TAILWHEEL']);
});

test('BOMBING et TRANSPORT exclusives, TAILWHEEL cumulable', () => {
  let t = basculerEtiquette([], 'BOMBING');
  t = basculerEtiquette(t, 'TRANSPORT');
  assert.deepEqual(t, ['TRANSPORT']);
  t = basculerEtiquette(t, 'TAILWHEEL');
  assert.deepEqual(t, ['TRANSPORT', 'TAILWHEEL']);
  t = basculerEtiquette(t, 'BOMBING');
  assert.deepEqual(t, ['TAILWHEEL', 'BOMBING']);
  t = basculerEtiquette(t, 'BOMBING');
  assert.deepEqual(t, ['TAILWHEEL']);
});

test('changer d\'avion : étiquettes filtrées, TAILWHEEL cochée d\'office si train classique', () => {
  const d = { ...dash, etiquettes: ['BOMBING', 'TRANSPORT'] };
  assert.deepEqual(etiquettesPourAvion(['BOMBING', 'TRANSPORT', 'AUTRE'], d), ['BOMBING']);
  assert.deepEqual(etiquettesPourAvion(['BOMBING'], { ...piper, etiquettes: ['TAILWHEEL'] }), ['TAILWHEEL']);
  assert.deepEqual(etiquettesPourAvion(['BOMBING'], cessna), []);
});

test('fiche : train classique coche TAILWHEEL, tricycle la décoche', () => {
  assert.deepEqual(etiquettesPourTrain(['G1000'], 'classique'), ['G1000', 'TAILWHEEL']);
  assert.deepEqual(etiquettesPourTrain(['G1000', 'TAILWHEEL'], 'tricycle'), ['G1000']);
});

test('avion monopilote : pas de Copi., pas de champ de personne en CdB', () => {
  assert.deepEqual(fonctionsPossibles(cessna), ['cdb', 'dc', 'inst']);
  assert.deepEqual(fonctionsPossibles(dash), ['cdb', 'copi', 'dc', 'inst']);
  assert.equal(champPersonneVisible(cessna, 'cdb'), false);
  assert.equal(champPersonneVisible(cessna, 'dc'), true);
  assert.equal(champPersonneVisible(cessna, 'inst'), true);
  assert.equal(champPersonneVisible(dash, 'cdb'), true);
});

test('import FlyLog : nom court -> Nom, indicatif avec espace -> Indicatif radio (sans écraser)', () => {
  const a = avion({ immat: 'F-XQDD' });
  assert.ok(completerNomIndicatif(a, 'q7'));
  assert.ok(completerNomIndicatif(a, 'quebec 7'));
  assert.equal(a.nom, 'Q7'); assert.equal(a.indicatif, 'QUEBEC 7');
  assert.equal(completerNomIndicatif(a, 'Q8'), false, 'déjà rempli : on ne remplace pas');
  assert.equal(a.nom, 'Q7');
  assert.equal(completerNomIndicatif(avion({ immat: 'F-XQDD' }), 'FXQDD'), false, "l'immatriculation n'est pas un nom");
});

test('import FlyLog : étiquettes par défaut des avions créés (DH8D, train classique)', () => {
  const r = analyserFlyLog(fauxFlyLog(VOLS_INVENTES));
  for (const a of r.avions) {
    if (a.typeOACI === 'DH8D') assert.deepEqual(a.etiquettes, ['BOMBING', 'TRANSPORT'], a.immat);
    else if (a.train === 'classique') assert.deepEqual(a.etiquettes, ['TAILWHEEL'], a.immat);
    else assert.deepEqual(a.etiquettes, [], a.immat);
  }
  assert.ok(r.avions.some(a => a.typeOACI === 'DH8D'), 'le fichier inventé contient un Dash');
});

test('migration v0.3 -> v0.4 : rien n\'est perdu, défauts ajoutés une fois', () => {
  const anciens = [
    { ...dash, nom: undefined, indicatif: 'QUEBEC 1', etiquettes: ['PERSO'] },
    { ...piper, etiquettes: [] },
    { ...cessna, nom: 'C1', etiquettes: ['TRANSPORT'] },
  ];
  const copie = structuredClone(anciens);
  const modifies = migrerAvionsV04(copie);
  assert.deepEqual(copie[0].etiquettes, ['PERSO', 'BOMBING', 'TRANSPORT']);
  assert.equal(copie[0].indicatif, 'QUEBEC 1'); assert.equal(copie[0].nom, '');
  assert.deepEqual(copie[1].etiquettes, ['TAILWHEEL']);
  assert.deepEqual(copie[2].etiquettes, ['TRANSPORT'], 'étiquette déjà choisie gardée');
  assert.equal(copie[2].nom, 'C1');
  assert.equal(modifies.length, 2);
  assert.equal(migrerAvionsV04(copie).length, 0, 'une deuxième migration ne change rien');
});

test('table mondiale des terrains : LFBD (Bordeaux) connu, avec coordonnées et fuseau', () => {
  definirTerrains(JSON.parse(readFileSync(new URL('../../ressources/terrains.json', import.meta.url), 'utf8')));
  const t = terrain('lfbd');
  assert.ok(t && /Bordeaux/.test(t.nom));
  assert.equal(t.pays, 'FR'); assert.equal(t.tz, 'Europe/Paris');
  assert.ok(Math.abs(t.lat - 44.83) < 0.01 && Math.abs(t.lon + 0.72) < 0.01);
  for (const c of ['EGLL', 'KJFK', 'FMEE', 'LFPG', 'NZAA']) assert.ok(terrain(c), c);
  assert.ok(nombreTerrains() > 15000);
});

test('terrain inconnu : ajout à la main (code, nom, coordonnées, fuseau)', () => {
  assert.equal(terrain('ZZQ1'), null);
  const r = lireTerrainSaisi({ code: 'zzq1', nom: 'Piste inventée', lat: '45,5', lon: '-1.25', tz: 'Europe/Paris', pays: 'fr' });
  assert.ok(!r.erreur, r.erreur);
  definirTerrainsPerso({ [r.code]: r.terrain });
  const t = terrain('ZZQ1');
  assert.equal(t.nom, 'Piste inventée'); assert.equal(t.lat, 45.5); assert.equal(t.lon, -1.25);
  assert.equal(t.tz, 'Europe/Paris'); assert.equal(t.pays, 'FR'); assert.ok(t.perso);
  assert.ok(lireTerrainSaisi({ code: 'ZZ', nom: 'x' }).erreur);
  assert.ok(lireTerrainSaisi({ code: 'ZZQ2', nom: 'x', lat: '95', lon: '0' }).erreur);
  assert.ok(lireTerrainSaisi({ code: 'ZZQ2', nom: 'x', lat: '45', lon: '' }).erreur);
  assert.ok(lireTerrainSaisi({ code: 'ZZQ2', nom: 'x', tz: 'Mars/Olympus' }).erreur);
  definirTerrainsPerso({});
});
