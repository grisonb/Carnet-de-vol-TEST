// v0.5 : suggestions de missions masquées (missions INVENTÉES)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missionsConnues, masquerSuggestion, remettreSuggestion, estMasquee } from '../../js/missions.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde } from '../../js/sauvegarde.js';

const vols = [
  { id: 'v2', missions: ['ENT. ESSAI', 'FEU n°3 COLLINE'] },
  { id: 'v1', missions: ['ENT. ESSAI', 'ENT. AUTRE'] },
];

test('une suggestion masquée n\'est plus proposée, même recalculée à partir des vols', () => {
  const masquees = masquerSuggestion([], 'ENT. ESSAI');
  assert.deepEqual(missionsConnues(vols, [], masquees), ['FEU n°3 COLLINE', 'ENT. AUTRE']);
  // recalcul : un nouveau vol contenant le même texte ne la fait pas revenir
  const plus = [{ id: 'v3', missions: ['ent. essai'] }, ...vols];
  assert.ok(!missionsConnues(plus, ['ENT. ESSAI'], masquees).some(m => m.toUpperCase() === 'ENT. ESSAI'));
});

test('masquer ne modifie jamais le texte des vols', () => {
  const avant = structuredClone(vols);
  missionsConnues(vols, [], masquerSuggestion([], 'ENT. AUTRE'));
  assert.deepEqual(vols, avant);
});

test('Annuler / Remettre : la suggestion revient', () => {
  let m = masquerSuggestion([], 'ENT. ESSAI');
  m = masquerSuggestion(m, 'ent. essai');
  assert.deepEqual(m, ['ENT. ESSAI'], 'pas de doublon (majuscules ignorées)');
  assert.ok(estMasquee(m, ' Ent. Essai '));
  m = remettreSuggestion(m, 'ENT. ESSAI');
  assert.deepEqual(m, []);
  assert.deepEqual(missionsConnues(vols, [], m), ['ENT. ESSAI', 'FEU n°3 COLLINE', 'ENT. AUTRE']);
});

test('sauvegarde de secours puis réimport : la liste des suggestions masquées est conservée', () => {
  const reglages = [{ cle: 'missionsMasquees', valeur: ['ENT. ESSAI', 'ENT. AUTRE'] }];
  const s = creerSauvegarde({ vols: [], avions: [], personnes: [], suppressions: [], reglages });
  const r = lireSauvegarde(texteSauvegarde(s));
  assert.ok(r.ok);
  assert.deepEqual(r.donnees.reglages.find(x => x.cle === 'missionsMasquees').valeur, ['ENT. ESSAI', 'ENT. AUTRE']);
});
