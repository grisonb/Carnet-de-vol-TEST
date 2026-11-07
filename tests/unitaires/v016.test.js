// v0.16 : vols NPF au format 2 (avion par nom, escales ordonnées avec atterrissages jour / nuit, copilote).
// Vols, avions, personnes et pélicandromes INVENTÉS ; terrains génériques (table OACI) remplacés par une petite table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volNpfValide, avionsPourNom, avionDuVolNpf, escalesNpf, copiloteNpf, brouillonNpf, differencesNpf,
  resumeNpf, libelleEscale } from '../../js/npf.js';

const TERRAINS = { LFHO: { lat: 44.54, lon: 4.37 }, LFLU: { lat: 44.92, lon: 4.97 }, LFMN: { lat: 43.66, lon: 7.22 } };
const terrain = c => TERRAINS[c] || null;
const v2 = (change = {}) => {
  const v = { format: 'carnet-vol-npf', version: 2, id: 'npf-v2-1', exporteLe: '2026-11-07T10:00:00Z', date: '2025-08-14',
    blocDepart: '12:00', blocArrivee: '15:30', nomAvion: 'M73', depart: 'LFMN', arrivee: 'LFMN', ...change };
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return v;
};
const AVIONS = [{ id: 'a1', immat: 'F-XZZA', nom: 'M73' }, { id: 'a2', immat: 'F-XZZB', nom: 'm 74' }, { id: 'a3', immat: 'F-XZZC', nom: 'M75' },
  { id: 'a4', immat: 'F-XZZD', nom: 'M75' }, { id: 's1', immat: 'SIM-1', nom: 'M73', sim: true }];
const PERSONNES = [{ id: 'p1', tri: 'ZZY', nom: 'ESSAI' }, { id: 'p2', prenom: 'Pilote', nom: 'Inventé' }];
// LFHO ×2 → LFLU → LFHO, dernier atterrissage (arrivée) pas dans les escales
const ESCALES = [
  { oaci: 'LFHO', nom: 'PELICANDROME-ESSAI-1', atterrissages: ['2025-08-14T12:40Z', '2025-08-14T13:20Z'] },
  { oaci: 'LFLU', atterrissages: ['2025-08-14T14:00Z'] },
  { oaci: 'LFHO', atterrissages: ['2025-08-14T14:40Z'] }];

test('format 2 : nom seul, immat seule, ni l\'un ni l\'autre ; format 1 toujours lu', () => {
  assert.equal(volNpfValide(v2()), true);
  assert.equal(volNpfValide(v2({ nomAvion: undefined, immat: 'F-XZZA' })), true);
  assert.equal(volNpfValide(v2({ nomAvion: undefined })), false);
  assert.equal(volNpfValide(v2({ nomAvion: 'X73' })), false);
  assert.equal(volNpfValide({ ...v2({ nomAvion: undefined, immat: 'F-XZZA' }), version: 1 }), true);
  assert.equal(volNpfValide({ ...v2(), version: 1 }), false, 'format 1 : immatriculation obligatoire');
});

test('avion par son nom : trouvé, inconnu, deux avions du même nom ; l\'immatriculation prime', () => {
  assert.deepEqual(avionsPourNom(AVIONS, 'm73').map(a => a.id), ['a1'], 'jamais un simulateur');
  assert.deepEqual(avionsPourNom(AVIONS, 'M74').map(a => a.id), ['a2'], 'espaces et majuscules ignorés');
  assert.equal(avionDuVolNpf(v2(), AVIONS).avion.id, 'a1');
  assert.deepEqual(avionDuVolNpf(v2({ nomAvion: 'M99' }), AVIONS), { avion: null, recherche: 'M99', plusieurs: 0 });
  assert.deepEqual(avionDuVolNpf(v2({ nomAvion: 'M75' }), AVIONS), { avion: null, recherche: 'M75', plusieurs: 2 });
  assert.equal(avionDuVolNpf(v2({ nomAvion: 'M75', immat: 'f-xzzd' }), AVIONS).avion.id, 'a4', 'immat fournie : elle prime');
  assert.equal(avionDuVolNpf(v2({ nomAvion: 'M73', immat: 'F-XZZB' }), AVIONS).avion.id, 'a2');
  assert.equal(avionDuVolNpf(v2({ nomAvion: 'M73', immat: 'F-XZZZ' }), AVIONS).avion.id, 'a1', 'immat inconnue : le nom sert');
  assert.equal(avionDuVolNpf({ ...v2({ immat: 'F-XZZZ' }), version: 1 }, AVIONS).avion, null, 'format 1 : seulement l\'immatriculation, comme en v0.15');
});

test('escales ordonnées LFHO ×2 → LFLU → LFHO, jour / nuit atterrissage par atterrissage', () => {
  const e = escalesNpf(v2({ escales: ESCALES }), terrain);
  assert.deepEqual(e.map(x => [x.code, x.attJour, x.attNuit]), [['LFHO', 2, 0], ['LFLU', 1, 0], ['LFHO', 1, 0]]);
  assert.equal(e[0].nom, 'PELICANDROME-ESSAI-1');
  assert.deepEqual(e[0].atterrissages, ['2025-08-14T12:40Z', '2025-08-14T13:20Z']);
  assert.deepEqual(e.map(libelleEscale), ['LFHO ×2', 'LFLU', 'LFHO']);
  // Atterrissage intermédiaire de nuit (soleil bien sous l'horizon à 20h30 UTC en août dans la vallée du Rhône)
  const n = escalesNpf(v2({ escales: [{ oaci: 'LFHO', atterrissages: ['2025-08-14T17:00Z', '2025-08-14T20:30Z'] }] }), terrain);
  assert.deepEqual([n[0].attJour, n[0].attNuit], [1, 1]);
  assert.equal(libelleEscale(n[0]), 'LFHO ×2 (1 nuit)');
});

test('pélicandrome sans code OACI : nom, position envoyée, sans blocage', () => {
  const e = escalesNpf(v2({ escales: [{ nom: 'PELICANDROME-SANS-CODE', lat: 44.6, lon: 4.4, atterrissages: ['2025-08-14T20:30Z'] },
    { nom: 'SANS-POSITION', atterrissages: ['2025-08-14T20:30Z'] }, { oaci: 'ZZZZ', lat: 44.6, lon: 4.4, atterrissages: ['2025-08-14T13:00Z'] }] }), terrain);
  assert.deepEqual(e[0], { code: '', nom: 'PELICANDROME-SANS-CODE', lat: 44.6, lon: 4.4, attJour: 0, attNuit: 1, atterrissages: ['2025-08-14T20:30Z'] });
  assert.equal(libelleEscale(e[0]), 'PELICANDROME-SANS-CODE (1 nuit)');
  assert.deepEqual([e[1].attJour, e[1].attNuit, e[1].aVerifier], [1, 0, true], 'sans position : compté de jour, signalé');
  assert.deepEqual([e[2].code, e[2].lat, e[2].attJour], ['ZZZZ', 44.6, 1], 'code inconnu de la table : la position envoyée sert');
  assert.equal(escalesNpf(v2({ escales: [{ oaci: 'LFHO', atterrissages: ['13:00'] }] }), terrain).length, 0, 'heure mal formée ignorée');
});

test('vol passant minuit UTC : atterrissages intermédiaires du lendemain', () => {
  const b = brouillonNpf(v2({ blocDepart: '23:30', blocArrivee: '01:30', blocArriveeJ1: true,
    escales: [{ oaci: 'LFHO', atterrissages: ['2025-08-14T23:50Z', '2025-08-15T00:40Z'] }] }), { avions: AVIONS, terrain });
  assert.equal(b.bloc, 120);
  assert.deepEqual([b.escales[0].attJour, b.escales[0].attNuit], [0, 2]);
});

test('copilote : trouvé par son trigramme, inconnu (rien créé), format 1', () => {
  assert.deepEqual(copiloteNpf(v2({ copilote: 'ZZY' }), PERSONNES), { tri: 'ZZY', personne: PERSONNES[0] });
  assert.deepEqual(copiloteNpf(v2({ copilote: 'ZZX' }), PERSONNES), { tri: 'ZZX', personne: null });
  assert.deepEqual(copiloteNpf(v2({ copilote: 'zz1' }), PERSONNES), { tri: '', personne: null }, 'trigramme mal formé ignoré');
  assert.equal(PERSONNES.length, 2, 'aucune personne créée');
  const b = brouillonNpf(v2({ copilote: 'ZZX', escales: ESCALES }), { avions: AVIONS, personnes: PERSONNES, terrain });
  assert.equal(b.copilote, 'ZZX'); assert.equal(b.copilotePersonne, null); assert.equal(b.avion.id, 'a1');
});

test('« Ce qui change » : avion, escales, copilote', () => {
  const vol = { id: 'v9', npfId: 'npf-v2-1', date: '2025-08-14', hDep: '12:00', hArr: '15:30', tempsTotal: 210, avionId: 'a1', dep: 'LFMN', arr: 'LFMN',
    escales: [{ code: 'LFHO', attJour: 2, attNuit: 0 }], nomCopi: 'ZZY', feux: 0, feuxPositions: [] };
  const b = brouillonNpf(v2({ nomAvion: 'M74', copilote: 'ZZX', escales: ESCALES }), { avions: AVIONS, personnes: PERSONNES, terrain });
  const d = differencesNpf(vol, b, AVIONS[0]);
  assert.deepEqual(d.map(x => x.champ), ['Avion', 'Escales', 'Copilote']);
  assert.deepEqual(d[0], { champ: 'Avion', avant: 'M73 F-XZZA', apres: 'm 74 F-XZZB' });
  assert.deepEqual(d[1], { champ: 'Escales', avant: 'LFHO ×2', apres: 'LFHO ×2 → LFLU → LFHO' });
  assert.deepEqual(d[2], { champ: 'Copilote', avant: 'ZZY', apres: 'ZZX' });
  const same = brouillonNpf(v2({ copilote: 'ZZY', escales: [ESCALES[0]] }), { avions: AVIONS, personnes: PERSONNES, terrain });
  assert.deepEqual(differencesNpf(vol, same, AVIONS[0]), [], 'rien ne change');
});

test('liste : le nom et l\'immatriculation trouvée, les escales dans l\'ordre', () => {
  const r = resumeNpf(v2({ escales: ESCALES }), AVIONS);
  assert.equal(r.avion, 'M73 F-XZZA'); assert.equal(r.trajet, 'LFMN → LFHO → LFLU → LFHO → LFMN'); assert.equal(r.avionConnu, true);
  const r2 = resumeNpf(v2({ nomAvion: 'M75' }), AVIONS);
  assert.deepEqual([r2.avion, r2.avionConnu, r2.avionsMemeNom], ['M75', false, 2]);
});

// ---------- R49 : importer des fiches avions (avions INVENTÉS) ----------
import { lireFichesAvions, changementsFiches, appliquerFiches } from '../../js/fiches-avions.js';

test('fiches avions : lecture (« , » ou « ; », titres, guillemets, lignes vides)', () => {
  const { fiches, erreurs } = lireFichesAvions('﻿immatriculation,nom,indicatif radio,modèle\r\nF-XZZA,M91,ESSAI 91,Modele essai A\n\n# commentaire\nf-xzzb;M92;;\n"F-XZZC","M93","ESSAI, 93",\n,M94,X,Y\n');
  assert.deepEqual(fiches.map(f => [f.immat, f.nom, f.indicatif, f.modele]),
    [['F-XZZA', 'M91', 'ESSAI 91', 'Modele essai A'], ['F-XZZB', 'M92', '', ''], ['F-XZZC', 'M93', 'ESSAI, 93', '']]);
  assert.equal(erreurs.length, 1, 'ligne sans immatriculation signalée');
});

test('fiches avions : aperçu, avion introuvable, rien d\'autre modifié', () => {
  const avions = [{ id: 'a1', immat: 'F-XZZA', nom: '', indicatif: '', modele: 'Modele', typeOACI: 'DH8D', photo: 'x' },
    { id: 'a2', immat: 'F-XZZB', nom: 'M92', indicatif: 'ANCIEN', modele: 'Mod B', typeOACI: 'DR40' },
    { id: 's1', immat: 'F-XZZS', sim: true, nom: '' }];
  const { fiches } = lireFichesAvions('F-XZZA,M91,ESSAI 91,Modele essai A\nF-XZZB,M92,,\nF-XZZZ,M99,X,Y\nF-XZZS,M98,,');
  const c = changementsFiches(fiches, avions);
  assert.deepEqual(c.modifs.map(m => [m.avion.id, m.changements.map(x => `${x.libelle} : ${x.avant || 'vide'} → ${x.apres}`)]),
    [['a1', ['Nom : vide → M91', 'Indicatif radio : vide → ESSAI 91', 'Modèle : Modele → Modele essai A']]]);
  assert.deepEqual(c.identiques, ['F-XZZB'], 'cases vides : rien ne change ; même nom : déjà à jour');
  assert.deepEqual(c.introuvables, ['F-XZZZ', 'F-XZZS'], 'introuvable signalé ; un simulateur n\'est jamais touché');
  const [a] = appliquerFiches(c.modifs);
  assert.deepEqual(a, { ...avions[0], nom: 'M91', indicatif: 'ESSAI 91', modele: 'Modele essai A' }, 'type OACI, photo… inchangés');
  assert.equal(avions[0].nom, '', 'l\'avion d\'origine n\'est pas modifié avant « Appliquer »');
});
