// v0.20 (R58) : arrivée par défaut FMEP quand le départ est FMEP (La Réunion) ; terrains de La Réunion ; nuit à FMEP ;
// vol NPF-Q400 format 2 FMEP -> FMEE -> FMEP. Vols et avions INVENTÉS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arriveeParDefaut, BASE } from '../../js/modele.js';
import { definirTerrains, terrain } from '../../js/terrains.js';
import { versUTC } from '../../js/fuseaux.js';
import { minutesDeNuit, estNuit } from '../../js/nuit.js';
import { brouillonNpf, escalesNpf, volNpfValide } from '../../js/npf.js';

definirTerrains(JSON.parse(readFileSync(new URL('../../ressources/terrains.json', import.meta.url))));

test('R58 : arrivée par défaut FMEP si le départ est FMEP, sinon LFTW', () => {
  assert.equal(BASE, 'LFTW');
  assert.equal(arriveeParDefaut('FMEP'), 'FMEP');
  assert.equal(arriveeParDefaut('fmep'), 'FMEP');
  for (const d of ['LFTW', 'FMEE', 'LFMN', 'FME', 'LF', '', null, undefined]) assert.equal(arriveeParDefaut(d), 'LFTW', String(d));
});

test('terrains de La Réunion : FMEP et FMEE connus (nom, coordonnées publiques, fuseau UTC+4)', () => {
  // Coordonnées publiques (AIP France, point de référence) : FMEP 21°19′S 55°25′E, FMEE 20°53′S 55°31′E
  for (const [code, lat, lon, nom] of [['FMEP', -21.32, 55.424, 'Pierrefonds'], ['FMEE', -20.887, 55.51, 'Roland Garros']]) {
    const t = terrain(code);
    assert.ok(t, code);
    assert.match(t.nom, new RegExp(nom));
    assert.equal(t.pays, 'RE');
    assert.equal(t.tz, 'Indian/Reunion');
    assert.ok(Math.abs(t.lat - lat) < 0.02 && Math.abs(t.lon - lon) < 0.02, `${code} : ${t.lat}, ${t.lon}`);
  }
  assert.deepEqual(versUTC('2026-11-20', '18:30', 'Indian/Reunion'), { date: '2026-11-20', heure: '14:30' }, 'La Réunion = UTC+4');
  assert.deepEqual(versUTC('2026-06-21', '02:00', 'Indian/Reunion'), { date: '2026-06-20', heure: '22:00' }, 'pas d\'heure d\'été, veille UTC');
});

test('nuit EASA à FMEP : vol inventé FMEP -> FMEP de fin d\'après-midi', () => {
  const p = terrain('FMEP');
  // Fin du crépuscule civil (soleil à -6°) le 20/11/2026 à FMEP : 15h05 UTC = 19h05 locale (calcul NOAA indépendant)
  const fin = Date.parse('2026-11-20T15:05:00Z');
  assert.equal(estNuit(fin - 60000, p.lat, p.lon), false);
  assert.equal(estNuit(fin + 60000, p.lat, p.lon), true);
  // 18h30 -> 19h45 locale (14h30 -> 15h45 UTC) : 1 h 15 de bloc, ~40 min de nuit, atterrissage de nuit
  const dep = Date.parse('2026-11-20T14:30:00Z');
  const nuit = minutesDeNuit(dep, 75, [p, p]);
  assert.ok(nuit >= 39 && nuit <= 41, `nuit ${nuit} min`);
  assert.equal(estNuit(dep + 75 * 60000, p.lat, p.lon), true);
  // Même vol 2 heures plus tôt : tout de jour
  assert.equal(minutesDeNuit(dep - 2 * 3600000, 75, [p, p]), 0);
  // Hiver austral (21/06/2026) : nuit dès 14h10 UTC = 18h10 locale
  assert.equal(estNuit(Date.parse('2026-06-21T14:09:00Z'), p.lat, p.lon), false);
  assert.equal(estNuit(Date.parse('2026-06-21T14:11:00Z'), p.lat, p.lon), true);
});

test('NPF-Q400 format 2 : FMEP -> escale FMEE -> FMEP lu correctement (terrains, Att. Jour / Nuit)', () => {
  const n = { format: 'carnet-vol-npf', version: 2, id: 'npf-re1', exporteLe: '2026-11-20T16:00:00Z', date: '2026-11-20',
    blocDepart: '13:30', blocArrivee: '15:45', nomAvion: 'M91', depart: 'FMEP', arrivee: 'FMEP',
    escales: [{ oaci: 'FMEE', nom: 'Roland Garros', atterrissages: ['2026-11-20T14:10:00Z', '2026-11-20T15:15:00Z'] }],
    atterrissagesJour: 0, atterrissagesNuit: 1 };
  assert.equal(volNpfValide(n), true);
  const b = brouillonNpf(n, { terrain });
  assert.equal(b.dep, 'FMEP'); assert.equal(b.arr, 'FMEP');
  assert.equal(b.escales.length, 1);
  const e = b.escales[0];
  assert.equal(e.code, 'FMEE');
  assert.equal(e.attJour, 1, '14h10 UTC à FMEE : jour');
  assert.equal(e.attNuit, 1, '15h15 UTC à FMEE : nuit');
  assert.equal(e.lat, undefined, 'position prise dans la table des terrains');
  assert.equal(b.attJour, 0); assert.equal(b.attNuit, 1, 'atterrissage final à FMEP de nuit');
  // Sans la table des terrains (escale inconnue sans coordonnées) : compté de jour et signalé
  assert.equal(escalesNpf(n)[0].aVerifier, true);
});
