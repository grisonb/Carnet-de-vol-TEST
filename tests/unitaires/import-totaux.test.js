import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';
import { analyserFlyLog } from '../../js/flylog.js';
import { calculerTotaux, heuresDerniersJours, filtrerPeriode } from '../../js/totaux.js';
import { formaterImmat, colonnesAvion } from '../../js/modele.js';

const fichier = fauxFlyLog(VOLS_INVENTES);
const r = analyserFlyLog(fichier, {}, undefined, '2026-01-01T00:00:00.000Z');
const avions = new Map(r.avions.map(a => [a.id, a]));

test('import : toutes les lignes, sans erreur', () => {
  assert.equal(r.ok, true);
  assert.equal(r.erreurs.length, 0);
  assert.equal(r.aCreer.length, VOLS_INVENTES.length);
  assert.equal(r.avions.length, 6); // 5 avions + 1 simulateur
});

test('import : heures anciennes 00:00 sans arrivée = heures inconnues (vides)', () => {
  const v = r.aCreer[0];
  assert.equal(v.hDep, null); assert.equal(v.hArr, null);
  assert.equal(v.tempsTotal, 45);
  const nuitAMinuit = r.aCreer.find(x => x.date === '2025-08-20');
  assert.equal(nuitAMinuit.hDep, '23:30'); assert.equal(nuitAMinuit.hArr, '00:50');
});

test('import : doublons refusés au second import, vols identiques du fichier gardés', () => {
  const identiques = r.aCreer.filter(v => v.date === '2001-05-13');
  assert.equal(identiques.length, 2);
  const r2 = analyserFlyLog(fichier, { vols: r.aCreer, avions: r.avions, personnes: r.personnes });
  assert.equal(r2.aCreer.length, 0);
  assert.equal(r2.doublons.length, VOLS_INVENTES.length);
  assert.equal(r2.avions.length, 0); assert.equal(r2.personnes.length, 0);
});

test('import : immatriculations, simulateur, étiquettes, personnes, missions', () => {
  assert.equal(formaterImmat('FXAAA'), 'F-XAAA');
  assert.equal(formaterImmat('HAXYZ'), 'HA-XYZ');
  assert.equal(formaterImmat('N123AB'), 'N123AB');
  const sim = r.avions.find(a => a.sim);
  assert.equal(sim.immat, 'DHC8-400');
  const cl = r.avions.find(a => a.immat === 'F-XZZA');
  assert.equal(cl.surface, 'A'); assert.equal(cl.equipage, 'MP');
  assert.deepEqual(r.etiquettes.sort(), ['BOMBING', 'TAILWHEEL']);
  assert.deepEqual(r.personnes.map(p => p.tri || p.nom).sort(), ['TOTO', 'TUT', 'ZORRO']);
  const feu = r.aCreer.find(v => v.feux === 1);
  assert.deepEqual(feu.missions, ['FEU n°7 VILLAGE-TEST (99)', 'GAAR']);
  assert.deepEqual(feu.escales.map(e => e.code), ['LFMD']);
  const dc = r.aCreer.find(v => v.tempsDC);
  assert.equal(dc.fonction, 'dc');
});

test('totaux exacts sur les vols inventés', () => {
  const t = calculerTotaux(r.aCreer, avions);
  const attendu = { vols: 8, sessionsSim: 1, atterrissages: 10, tempsTotal: 435, simTemps: 240, tempsCdB: 255,
    tempsCopi: 120, tempsDC: 60, tempsNuit: 120, tempsIFR: 70, mp: 220, se: 145, me: 70, piston: 235, turbo: 200,
    multiTurbine: 200, amphibie: 120, feux: 1, largCdbDash: 3, largInstrCdbDash: 1, ecopages: 0 };
  for (const [k, v] of Object.entries(attendu)) assert.equal(t[k], v, k);
  assert.equal(t.parEtiquette.BOMBING, 120);
});

test('monopilote SE = bloc - part multipilote (cas des minutes notées multipilote sur un monomoteur)', () => {
  const v = r.aCreer.find(x => x.tempsMP === 20);
  assert.deepEqual(colonnesAvion(v, avions.get(v.avionId)), { se: 40, me: 0, mp: 20 });
});

test('3 / 7 / 30 jours, aujourd\'hui inclus ; périodes', () => {
  const vols = [{ date: '2026-11-04', tempsTotal: 60 }, { date: '2026-11-02', tempsTotal: 30 },
    { date: '2026-11-01', tempsTotal: 10 }, { date: '2026-10-06', tempsTotal: 5 }, { date: '2026-10-05', tempsTotal: 1 }];
  assert.equal(heuresDerniersJours(vols, 3, '2026-11-04'), 90);
  assert.equal(heuresDerniersJours(vols, 7, '2026-11-04'), 100);
  assert.equal(heuresDerniersJours(vols, 30, '2026-11-04'), 105);
  assert.equal(filtrerPeriode(vols, { genre: 'annee', annee: '2026' }, '2026-11-04').length, 5);
  assert.equal(filtrerPeriode(vols, { genre: 'dates', du: '2026-11-01', au: '2026-11-02' }, '2026-11-04').length, 2);
  assert.equal(filtrerPeriode(vols, { genre: '12m' }, '2026-11-04').length, 5);
});

test('fichier qui n\'est pas un export FlyLog : refusé avec un message', () => {
  const x = analyserFlyLog('a,b,c\n1,2,3\n');
  assert.equal(x.ok, false);
  assert.match(x.message, /pas un export FlyLog/);
});
