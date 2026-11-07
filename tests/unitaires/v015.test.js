// v0.15 : vols envoyés par NPF-Q400 (format « carnet-vol-npf » version 1). Vols et avions INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volNpfValide, avionPourImmat, dureeBloc, feuxNpf, brouillonNpf, volDejaEnregistre, dejaAJour,
  differencesNpf, resumeNpf } from '../../js/npf.js';

export const volNpf = (change = {}) => {
  const v = { format: 'carnet-vol-npf', version: 1, id: 'npf-essai-1', exporteLe: '2026-11-06T10:00:00Z', date: '2025-08-14',
    blocDepart: '13:05', blocArrivee: '15:40', immat: 'F-XZZB', nomAvion: 'ZX2', depart: 'LFMN', arrivee: 'LFKJ', ...change };
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return v;
};
const AVIONS = [{ id: 'a1', immat: 'F-XZZA', nom: 'ZX1' }, { id: 'a2', immat: 'F-XZZB', nom: 'ZX2' }, { id: 's1', immat: 'SIM-1', sim: true }];
const VOLS = [{ id: 'v1', missions: ['FEU n°41 VILLAGE-A'] }, { id: 'v2', missions: ['FEU n°42 VILLAGE-B', 'GAAR'] }];

test('format : champs obligatoires', () => {
  assert.equal(volNpfValide(volNpf()), true);
  for (const k of ['format', 'version', 'id', 'date', 'blocDepart', 'blocArrivee', 'immat']) assert.equal(volNpfValide(volNpf({ [k]: undefined })), false, k);
  assert.equal(volNpfValide(volNpf({ version: 3 })), false);
  assert.equal(volNpfValide(volNpf({ blocDepart: '24:00' })), false);
  assert.equal(volNpfValide(volNpf({ depart: undefined, arrivee: undefined, inconnu: 'ignoré' })), true, 'départ / arrivée facultatifs, champs inconnus ignorés');
});

test('avion retrouvé par son immatriculation (sans tiret ni majuscules)', () => {
  assert.equal(avionPourImmat(AVIONS, 'f-xzzb').id, 'a2');
  assert.equal(avionPourImmat(AVIONS, 'FXZZA').id, 'a1');
  assert.equal(avionPourImmat(AVIONS, 'F-XZZZ'), null);
  assert.equal(avionPourImmat(AVIONS, 'SIM-1'), null, 'jamais un simulateur');
});

test('heures bloc : durée, vol passant minuit UTC', () => {
  assert.equal(dureeBloc(volNpf()), 155);
  assert.equal(dureeBloc(volNpf({ blocDepart: '23:30', blocArrivee: '01:10', blocArriveeJ1: true })), 100);
  assert.equal(dureeBloc(volNpf({ blocDepart: '23:30', blocArrivee: '01:10' })), 100, 'arrivée avant le départ : lendemain même sans le drapeau');
});

test('brouillon : 0, 1 ou 3 feux, numéros suivants, positions gardées', () => {
  const b0 = brouillonNpf(volNpf(), { avions: AVIONS, vols: VOLS });
  assert.deepEqual(b0.lignes, []); assert.equal(b0.npf.nbFeux, 0);
  assert.equal(b0.avion.id, 'a2'); assert.equal(b0.dep, 'LFMN'); assert.equal(b0.arr, 'LFKJ');
  assert.equal(b0.hDep, '13:05'); assert.equal(b0.hArr, '15:40'); assert.equal(b0.date, '2025-08-14'); assert.equal(b0.bloc, 155);
  const b1 = brouillonNpf(volNpf({ feux: [{ heure: '13:50', lat: 43.9, lon: 7.1, commune: 'Village-Essai' }] }), { avions: AVIONS, vols: VOLS });
  assert.deepEqual(b1.lignes, [{ t: 'FEU n°43 VILLAGE-ESSAI', nouveauFeu: 43 }]);
  assert.deepEqual(b1.npf.feux, [{ heure: '13:50', lat: 43.9, lon: 7.1, commune: 'Village-Essai', nom: '' }]);
  const b3 = brouillonNpf(volNpf({ feux: [
    { heure: '13:50', lat: 43.9, lon: 7.1, commune: 'VILLAGE-A' },
    { heure: '14:20', lat: -21.1, lon: 55.5, nom: 'FEU DES HAUTS' },
    { heure: '14:40', lat: 'x', lon: 7, commune: 'SANS-POSITION' }] }), { avions: AVIONS, vols: VOLS });
  assert.deepEqual(b3.lignes.map(l => l.t), ['FEU n°43 VILLAGE-A', 'FEU n°44 FEU DES HAUTS', 'FEU n°45 SANS-POSITION']);
  assert.equal(b3.npf.nbFeux, 3);
  assert.equal(b3.npf.feux.length, 2, 'une position invalide n\'est pas gardée (la ligne de feu, si)');
});

test('brouillon : avion inconnu, escales, champs facultatifs', () => {
  const b = brouillonNpf(volNpf({ immat: 'f-xzzz', depart: undefined, arrivee: 'lfkj', escales: ['LFKB', 'xx', 'LFKC'],
    atterrissages: 3, copilote: 'ZZY', remarques: 'ESSAI' }), { avions: AVIONS, vols: VOLS });
  assert.equal(b.avion, null); assert.equal(b.immat, 'F-XZZZ');
  assert.equal(b.dep, ''); assert.equal(b.arr, 'LFKJ');
  assert.deepEqual(b.escales.map(e => e.code), ['LFKB', 'LFKC']);
  assert.equal(b.attJour, 3); assert.equal(b.copilote, 'ZZY'); assert.equal(b.remarques, 'ESSAI');
  assert.equal(brouillonNpf(volNpf({ atterrissages: 'beaucoup' }), { avions: AVIONS }).attJour, null, 'valeur douteuse ignorée');
});

test('même id déjà enregistré : à jour (retrait discret) ou mise à jour avec ce qui change', () => {
  const vol = { id: 'v9', npfId: 'npf-essai-1', npfExporteLe: '2026-11-06T10:00:00Z', date: '2025-08-14', hDep: '13:05', hArr: '15:40',
    tempsTotal: 155, avionId: 'a2', dep: 'LFMN', arr: 'LFKJ', escales: [], feux: 0, feuxPositions: [] };
  assert.equal(volDejaEnregistre([...VOLS, vol], 'npf-essai-1'), vol);
  assert.equal(volDejaEnregistre(VOLS, 'npf-essai-1'), null);
  assert.equal(dejaAJour(vol, volNpf()), true);
  const n2 = volNpf({ exporteLe: '2026-11-06T12:00:00Z', blocArrivee: '16:10', feux: [{ heure: '14:00', lat: 44, lon: 7, commune: 'VILLAGE-A' }] });
  assert.equal(dejaAJour(vol, n2), false, 'ré-exporté depuis : proposé en mise à jour');
  const d = differencesNpf(vol, brouillonNpf(n2, { avions: AVIONS, vols: VOLS }), AVIONS[1]);
  assert.deepEqual(d.map(x => x.champ), ['Bloc arrivée (UTC)', 'Temps bloc', 'Feux', 'Positions des feux']);
  assert.deepEqual(d[0], { champ: 'Bloc arrivée (UTC)', avant: '15:40', apres: '16:10' });
});

test('ligne de la liste : date, avion, trajet, bloc', () => {
  const r = resumeNpf(volNpf({ blocDepart: '23:30', blocArrivee: '01:10', escales: ['LFKB'], feux: [{ heure: '23:50', lat: 1, lon: 1 }] }), AVIONS);
  assert.deepEqual(r, { date: '14/08/2025', avion: 'ZX2 F-XZZB', trajet: 'LFMN → LFKB → LFKJ', bloc: '23:30 → 01:10 UTC (J+1) · 1h40', feux: 1, avionConnu: true, avionsMemeNom: 0 });
  assert.equal(resumeNpf(volNpf({ depart: undefined, arrivee: undefined, nomAvion: undefined, immat: 'F-XZZZ' }), AVIONS).trajet, 'Terrains à compléter');
});
