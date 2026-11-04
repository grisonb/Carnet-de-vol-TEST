import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lignesDepuisRemarque, numeroFeu, plusGrandFeu, ajouterFeu, enleverFeu, pastillesRegles, pastilleFeu,
  remarqueCarnet, REGLES_DEFAUT, lignesPourSaisie } from '../../js/missions.js';

test('remarque -> lignes de mission (après « • », séparées par « + »)', () => {
  assert.deepEqual(lignesDepuisRemarque('ENT. TEST + PAX'), ['ENT. TEST', 'PAX']);
  assert.deepEqual(lignesDepuisRemarque('LFAA-LFBB • GAAR + FEU n°3 X'), ['GAAR', 'FEU n°3 X']);
  assert.deepEqual(lignesDepuisRemarque(''), []);
});

test('numéros de feu', () => {
  assert.equal(numeroFeu('FEU n°52 RODEZ'), 52);
  assert.equal(numeroFeu('Feu n°9 VILLAGE'), 9);
  assert.equal(numeroFeu('FEU (n°46) VILLAGE'), 46);
  assert.equal(numeroFeu('FEU VILLAGE n°20'), 20);
  assert.equal(numeroFeu('FEU VILLAGE'), null);
  assert.equal(plusGrandFeu([{ id: 'a', missions: ['FEU n°51 X'] }, { id: 'b', missions: ['FEU n°12 Y', 'GAAR'] }]), 51);
  assert.equal(plusGrandFeu([{ id: 'a', missions: ['FEU n°51 X'] }, { id: 'b', missions: ['FEU n°12 Y'] }], 'a'), 12);
});

test('FEU +1 : numéro suivant devant le texte tapé ; −1 enlève le dernier', () => {
  let r = ajouterFeu([], 51, 'rodez');
  assert.equal(r.lignes[0].t, 'FEU n°52 RODEZ');
  r = ajouterFeu(r.lignes, 51, '');
  assert.equal(r.lignes[1].t, 'FEU n°53 ');
  assert.equal(r.numero, 53);
  const moins = enleverFeu(r.lignes);
  assert.deepEqual(moins.map(l => l.t), ['FEU n°52 RODEZ']);
  assert.deepEqual(enleverFeu([{ t: 'GAAR', nouveauFeu: null }]).map(l => l.t), ['GAAR']);
});

test('feu repris : pas de +1, pastille contour', () => {
  const lignes = lignesPourSaisie({ missions: ['FEU n°51 X'], feux: 0 });
  assert.equal(lignes[0].nouveauFeu, null);
  assert.deepEqual(pastilleFeu({ missions: ['FEU n°51 X'], feux: 0 }), { texte: 'Feu', plein: false });
  assert.deepEqual(pastilleFeu({ missions: ['GAAR + FEU n°49 X'.split(' + ')[1]], feux: 1 }), { texte: 'Feu n°49', plein: true });
  assert.equal(pastilleFeu({ missions: ['ENT. TEST'], feux: 0 }), null);
});

test('pastilles par règles (ENT. -> Entraînement, GAAR -> GAAR)', () => {
  assert.deepEqual(pastillesRegles({ missions: ['ENT. TEST', 'GAAR'] }, REGLES_DEFAUT), ['Entraînement', 'GAAR']);
  assert.deepEqual(pastillesRegles({ missions: ['CONVOYAGE TEST'] }, REGLES_DEFAUT), []);
  assert.deepEqual(pastillesRegles({ missions: ['dnpaf visite'] }, [{ debut: 'DNPAF', pastille: 'DNPAF' }]), ['DNPAF']);
});

test('remarque du carnet : route avec tirets si escales • missions • remarques', () => {
  const v = { dep: 'LFAA', arr: 'LFCC', escales: [{ code: 'LFBB' }], missions: ['ENT. TEST', 'PAX'], remarques: 'Visa test' };
  assert.equal(remarqueCarnet(v), 'LFAA-LFBB-LFCC • ENT. TEST + PAX • Visa test');
  assert.equal(remarqueCarnet({ dep: 'LFAA', arr: 'LFAA', escales: [], missions: ['GAAR'], remarques: '' }), 'GAAR');
});
