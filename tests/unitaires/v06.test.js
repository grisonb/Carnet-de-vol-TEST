// v0.6 : bande d'heures, compteurs par type, prochain n° de feu (vols INVENTÉS)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserFlyLog } from '../../js/flylog.js';
import { calculerTotaux } from '../../js/totaux.js';
import { hm } from '../../js/temps.js';
import { BANDE_DEFAUT, BANDE_GENERAL, choixParType, valeurBande, basculerChoix } from '../../js/bande.js';
import { compteursAffiches, avionVide } from '../../js/modele.js';
import { plusGrandFeu } from '../../js/missions.js';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const r = analyserFlyLog(fauxFlyLog(VOLS_INVENTES));
const avions = new Map(r.avions.map(a => [a.id, a]));
const t = calculerTotaux(r.aCreer, avions);

test('bande : par défaut CdB, Copi, DC, Instructeur, IFR, Nuit', () => {
  assert.deepEqual(BANDE_DEFAUT, ['tempsCdB', 'tempsCopi', 'tempsDC', 'tempsInst', 'tempsIFR', 'tempsNuit']);
  assert.deepEqual(BANDE_DEFAUT.map(c => valeurBande(c, t).lib), ['CdB', 'Copi', 'DC', 'Instructeur', 'IFR', 'Nuit']);
});

test('bande : valeurs identiques à l\'écran Totaux (mêmes calculs)', () => {
  for (const g of BANDE_GENERAL) {
    const v = valeurBande(g.cle, t);
    assert.equal(v.texte, g.nombre ? t[g.cle].toLocaleString('fr-FR') : hm(t[g.cle]), g.lib);
  }
  assert.equal(valeurBande('vols', t).texte, String(r.aCreer.length));
});

test('bande : un choix par type d\'appareil, du plus d\'heures au moins ; DH8D total / CdB / Copi', () => {
  const ch = choixParType(t, r.avions);
  const types = ch.filter(c => c.cle.startsWith('type:')).map(c => c.cle.slice(5));
  const minutes = types.map(ty => t.parType[ty]);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => b - a), 'rangés du plus d\'heures au moins');
  assert.ok(!types.includes('SIMULATEURS'));
  const i = ch.findIndex(c => c.cle === 'type:DH8D');
  assert.deepEqual(ch.slice(i, i + 3).map(c => c.lib), ['DH8D total', 'DH8D CdB', 'DH8D Copi']);
  // valeurs DH8D recalculées à la main
  const dash = r.aCreer.filter(v => avions.get(v.avionId)?.typeOACI === 'DH8D');
  const somme = k => dash.reduce((s, v) => s + (v[k] || 0), 0);
  assert.equal(valeurBande('type:DH8D', t).texte, hm(somme('tempsTotal')));
  assert.equal(valeurBande('typeCdB:DH8D', t).texte, hm(somme('tempsCdB')));
  assert.equal(valeurBande('typeCopi:DH8D', t).texte, hm(somme('tempsCopi')));
  assert.equal(valeurBande('type:DR40', t).lib, 'DR40');
});

test('bande : l\'ordre d\'affichage est l\'ordre dans lequel on coche', () => {
  let c = [];
  for (const k of ['tempsNuit', 'type:DH8D', 'tempsCdB']) c = basculerChoix(c, k);
  assert.deepEqual(c, ['tempsNuit', 'type:DH8D', 'tempsCdB']);
  c = basculerChoix(c, 'tempsNuit');
  assert.deepEqual(c, ['type:DH8D', 'tempsCdB']);
  c = basculerChoix(c, 'tempsNuit');
  assert.deepEqual(c, ['type:DH8D', 'tempsCdB', 'tempsNuit'], 'recoché : il passe à la fin');
});

test('compteurs (Feux, largages…) seulement pour un DH8D ; un ancien vol non nul les garde', () => {
  const dash = Object.assign(avionVide(), { typeOACI: 'DH8D' });
  const dr = Object.assign(avionVide(), { typeOACI: 'DR40' });
  const a = compteursAffiches(dash);
  assert.ok(a.feux && a.reglable && a.compteurs.has('largCdbDash') && a.compteurs.has('largInstrCdbDash'));
  const b = compteursAffiches(dr);
  assert.ok(!b.feux && !b.reglable && b.compteurs.size === 0);
  const c = compteursAffiches(dr, { feux: 1, compteurs: { largCdbDash: 2, largPara: 0 } });
  assert.ok(c.feux && c.compteurs.has('largCdbDash') && !c.compteurs.has('largPara') && !c.reglable);
  assert.ok(!compteursAffiches(Object.assign(avionVide(), { typeOACI: 'DH8D', sim: true })).feux, 'simulateur : rien');
});

test('prochain n° de feu = plus grand « FEU n°NN » de tous les vols + 1 (importés compris)', () => {
  assert.equal(plusGrandFeu(r.aCreer) + 1, 8);
  const vols = [{ id: 'a', missions: ['FEU n°12 COLLINE'] }, { id: 'b', missions: ['ENT. ESSAI'], remarques: 'LFMN-LFMD • FEU n°40 VALLON' },
    { id: 'c', missions: ['FEU VILLAGE n°20'] }, { id: 'd', missions: ['FEU (n°33) CRÊTE'] }];
  assert.equal(plusGrandFeu(vols) + 1, 41);
  assert.equal(plusGrandFeu(vols, 'b') + 1, 34, 'le vol modifié est exclu');
});
