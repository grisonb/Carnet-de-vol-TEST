// v0.8 : traces ADS-B (avions, codes et traces INVENTÉS ; aucun appel au vrai serveur)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantsVol, joursTrace, decouper, alleger, etatCarte, signatureTrace, codeAvion, estReunion, volsRecents,
  TEXTES, MARGE_MS } from '../../js/traces.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde } from '../../js/sauvegarde.js';

const avion = { id: 'a1', immat: 'F-XQAA', sim: false, hexAdsb: 'abc123' };
const vol = { id: 'v1', avionId: 'a1', date: '2025-08-20', hDep: '23:30', hArr: '00:50', dep: 'LFMN', arr: 'LFMD', escales: [] };
const index = { derniereArchive: '2026-11-01', avions: { 'F-XQAA': 'abc123', 'F-XQBB': 'abc456' },
  traces: { abc123: ['2025-08-20', '2025-08-21'] }, joursTraites: ['2025-08-20', '2025-08-21', '2025-09-01'] };
const base = { vol, avion, motDePasse: 'x', index, stockee: null, aujourdhui: '2026-11-05' };
// fichier inventé : un point par minute de 22h00 à 23h59 (jour 1) et de 00h00 à 02h00 (jour 2)
const fichier = (jour, h0, h1) => ({ jour, points: Array.from({ length: (h1 - h0) * 60 }, (_, k) => [h0 * 3600 + k * 60, 43 + k / 1000, 7 - k / 1000, 3000]) });

test('heures bloc en UTC, vol qui passe minuit : deux jours d\'archive', () => {
  const i = instantsVol(vol);
  assert.equal(new Date(i.debut).toISOString(), '2025-08-20T23:30:00.000Z');
  assert.equal(new Date(i.fin).toISOString(), '2025-08-21T00:50:00.000Z');
  assert.deepEqual(joursTrace(vol), ['2025-08-20', '2025-08-21']);
  assert.deepEqual(joursTrace({ ...vol, hDep: '09:00', hArr: '10:18' }), ['2025-08-20']);
  assert.deepEqual(joursTrace({ ...vol, hDep: '00:05', hArr: '01:00' }), ['2025-08-19', '2025-08-20'], 'marge de 10 min avant le bloc');
});

test('découpe aux heures bloc (marge 10 min), y compris par-dessus minuit UTC', () => {
  const pts = decouper([fichier('2025-08-20', 22, 24), fichier('2025-08-21', 0, 2)], vol);
  const i = instantsVol(vol);
  assert.ok(pts.length > 0);
  assert.ok(pts.every(p => p[0] >= i.debut - MARGE_MS && p[0] <= i.fin + MARGE_MS));
  assert.equal(new Date(pts[0][0]).toISOString(), '2025-08-20T23:20:00.000Z');
  assert.equal(new Date(pts.at(-1)[0]).toISOString(), '2025-08-21T01:00:00.000Z');
  assert.equal(pts.length, 101, '23h20 -> 01h00 = 101 minutes');
  assert.ok(pts.every((p, k) => k === 0 || p[0] > pts[k - 1][0]), 'points dans l\'ordre');
});

test('trace allégée au-delà de 800 points (premier et dernier gardés)', () => {
  const p = Array.from({ length: 5000 }, (_, k) => [k, 0, 0, 0]);
  const a = alleger(p);
  assert.equal(a.length, 800); assert.equal(a[0][0], 0); assert.equal(a.at(-1)[0], 4999);
});

test('chaque cas a son texte', () => {
  const t = o => etatCarte({ ...base, ...o });
  assert.equal(t({ vol: null }).texte, TEXTES.demain);
  assert.equal(t({ vol: { ...vol, date: '2026-11-05' } }).texte, 'La trace sera disponible demain matin, si l\'avion a été capté.');
  assert.equal(t({ vol: { ...vol, date: '2026-11-04', hDep: '23:30', hArr: '00:30' } }).code, 'demain', 'fini aujourd\'hui (UTC) : demain');
  assert.equal(t({ avion: { ...avion, hexAdsb: '' }, index: { ...index, avions: {} } }).texte, 'Pas de code ADS-B dans la fiche de cet avion.');
  assert.equal(t({ vol: { ...vol, date: '2025-09-01', hDep: '10:00', hArr: '11:00' } }).texte, 'Pas de trace pour ce vol (avion non capté).');
  assert.equal(t({ vol: { ...vol, date: '2025-09-01', hDep: '10:00', hArr: '11:00', dep: 'FMEP', arr: 'FMEP' } }).texte, 'La Réunion n\'est pas couverte par adsb.lol.');
  assert.equal(t({ vol: { ...vol, date: '2022-05-01' } }).texte, 'Pas d\'archive ADS-B avant mars 2023.');
  assert.equal(t({ motDePasse: '' }).texte, 'Saisis le mot de passe des cartes dans Plus.');
  assert.equal(t({}).code, 'aTelecharger');
  assert.equal(t({ vol: { ...vol, date: '2025-09-02', hDep: '10:00', hArr: '11:00' } }).code, 'attente', 'jour pas encore lu par le serveur');
  assert.equal(t({ index: null }).code, 'horsLigne');
  assert.equal(t({ avion: { ...avion, sim: true } }).code, 'simulateur');
  assert.ok(estReunion({ dep: 'FMEE', arr: 'LFPG' }));
});

test('trace rangée sur le téléphone : affichée sans réseau ni mot de passe ; recalculée si le vol change', () => {
  const stockee = { sig: signatureTrace(vol, 'abc123'), etat: 'ok', points: [[1, 2, 3, 4]] };
  assert.equal(etatCarte({ ...base, stockee, index: null, motDePasse: '' }).code, 'ok');
  for (const modif of [{ hDep: '23:00' }, { hArr: '01:10' }, { date: '2025-08-21' }, { avionId: 'a2' }]) {
    assert.notEqual(etatCarte({ ...base, vol: { ...vol, ...modif }, stockee }).code, 'ok', JSON.stringify(modif));
  }
  assert.equal(etatCarte({ ...base, stockee: { ...stockee, etat: 'absente', points: [] } }).code, 'absente');
});

test('code ADS-B : celui de la fiche, sinon celui du serveur', () => {
  assert.equal(codeAvion({ ...avion, hexAdsb: 'ABC999' }, index), 'abc999');
  assert.equal(codeAvion({ immat: 'F-XQBB' }, index), 'abc456');
  assert.equal(codeAvion({ immat: 'F-XQCC' }, index), '');
  assert.equal(codeAvion({ immat: 'F-XQBB', sim: true }, index), '');
});

test('la trace ne modifie jamais le vol (heures, terrains)', () => {
  const avant = JSON.stringify(vol);
  etatCarte(base); decouper([fichier('2025-08-20', 22, 24)], vol); joursTrace(vol); signatureTrace(vol, 'abc123');
  assert.equal(JSON.stringify(vol), avant);
});

test('vols des 30 derniers jours (hors aujourd\'hui) pour la recherche en arrière-plan', () => {
  const v = d => ({ id: d, date: d });
  assert.deepEqual(volsRecents([v('2026-11-05'), v('2026-11-04'), v('2026-10-06'), v('2026-10-05')], '2026-11-05').map(x => x.id), ['2026-11-04', '2026-10-06']);
});

test('mot de passe des cartes : jamais dans la sauvegarde de secours', () => {
  const s = creerSauvegarde({ vols: [], avions: [], personnes: [], reglages: [{ cle: 'cartesMotDePasse', valeur: 'secret-essai' }, { cle: 'titulaire', valeur: 'X' }] });
  const texte = texteSauvegarde(s);
  assert.ok(!texte.includes('secret-essai'));
  assert.deepEqual(lireSauvegarde(texte).donnees.reglages.map(r => r.cle), ['titulaire']);
});
