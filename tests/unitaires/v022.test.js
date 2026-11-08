// v0.22 (R51) : mot de passe du NAS changé depuis l'app. Mots de passe INVENTÉS ; aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemeNouveauMotDePasse, texteAttente, resumeNas, MDP_MIN } from '../../js/copieur.js';

test('nouveau mot de passe : 12 caractères au moins, sans accent ni espace, tapé deux fois, différent de l\'actuel', () => {
  const ok = 'Essai-Nouveau-2026!';
  assert.equal(MDP_MIN, 12);
  assert.equal(problemeNouveauMotDePasse(ok, ok, 'ancien-essai-1'), '');
  assert.equal(problemeNouveauMotDePasse('', '', 'x'), 'Tape le nouveau mot de passe.');
  assert.equal(problemeNouveauMotDePasse('court-1', 'court-1', 'x'), 'Au moins 12 caractères (7 pour l\'instant).');
  for (const mauvais of ['mot-de-passe-éssai', 'mot de passe essai', 'tabulation\tessai1', 'emoji-essai-✈-12']) {
    assert.match(problemeNouveauMotDePasse(mauvais, mauvais, 'x'), /sans accent/, mauvais);
  }
  assert.equal(problemeNouveauMotDePasse(ok, ok + 'x', 'x'), 'Les deux mots de passe tapés ne sont pas identiques.');
  assert.equal(problemeNouveauMotDePasse(ok, ok, ok), 'C\'est déjà le mot de passe actuel.');
  assert.equal(problemeNouveauMotDePasse('x'.repeat(201), 'x'.repeat(201), ''), 'Trop long (200 caractères au plus).');
  assert.equal(problemeNouveauMotDePasse('Ab1!'.repeat(3), 'Ab1!'.repeat(3), ''), '', 'signes acceptés');
});

test('trop d\'essais : attente lisible', () => {
  assert.equal(texteAttente(840), '14 min');
  assert.equal(texteAttente(1), '1 min');
  assert.equal(texteAttente(0), '1 min');
  assert.equal(texteAttente(3900), '1 h 05');
  assert.equal(texteAttente('x'), '1 min');
});

test('Plus : copie en attente à cause du blocage des essais', () => {
  const conf = { configuree: true, auto: true };
  assert.equal(resumeNas(conf, { enAttente: true, statut: 'bloque' }, Date.now()), 'En attente (trop d\'essais de mot de passe sur le NAS)');
  assert.equal(resumeNas(conf, { enAttente: true, statut: 'refuse' }, Date.now()), 'Mot de passe refusé : à corriger');
});
