// v0.23 (R50 étape 3) : synchro téléphone -> NAS -> PC (consultation). Carnet INVENTÉ ; un faux NAS en mémoire suit
// les règles de carnet.php v5 (numéros, version de départ, conflits, suppressions) ; aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementsDuCarnet, preparerEnvoi, majCarte, forcer, carteDepuisNas, trierRecus, lots, resumeSynchro, empreinteTexte,
  REGLAGES_PARTAGES, ELEMENT_MAX } from '../../js/synchro.js';
import { REGLAGES_PRIVES } from '../../js/sauvegarde.js';

// Faux NAS : même logique que carnet.php v5 (synchro-envoyer / synchro-recevoir)
function fauxNas() {
  const n = { rev: 0, el: new Map() };
  n.envoyer = mods => {
    const acceptees = [], deja = [], conflits = [];
    for (const m of mods) {
      const cle = `${m.magasin}/${m.id}`, a = n.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : m.donnees;
      if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
      if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA, supprime: !!(a && a.supprime), donnees: a && a.donnees }); continue; }
      n.rev++; n.el.set(cle, { rev: n.rev, supprime: !!m.supprime, donnees });
      acceptees.push({ magasin: m.magasin, id: m.id, rev: n.rev });
    }
    return { ok: true, rev: n.rev, acceptees, deja, conflits };
  };
  n.recevoir = depuis => [...n.el.entries()].filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev)
    .map(([cle, e]) => ({ magasin: cle.split('/')[0], id: cle.slice(cle.indexOf('/') + 1), rev: e.rev, supprime: e.supprime, donnees: e.donnees }));
  return n;
}
const carnet = () => ({
  vols: [{ id: 'v1', date: '2026-01-02', dep: 'LFMN', arr: 'LFMD', compteurs: {} }, { id: 'v2', date: '2026-01-03', dep: 'LFTW', arr: 'LFTW' }],
  avions: [{ id: 'a1', immat: 'F-XZZA', photo: 'data:image/jpeg;base64,AAAA', photoCredit: { auteur: 'Jean Essai' } }],
  personnes: [{ id: 'p1', tri: 'ZZZ' }],
  reglages: [{ cle: 'etiquettes', valeur: ['BOMBING'] }, { cle: 'titulaire', valeur: 'Pilote Essai' }, { cle: 'nasMotDePasse', valeur: 'secret-essai' },
    { cle: 'prefixeLF', valeur: true }, { cle: 'synchroEtat', valeur: { rev: 3 } }],
});
// Un tour de synchro côté téléphone (avec forçage des conflits, comme js/ui/synchro.js)
function envoyer(nas, contenu, carte) {
  const { modifications, empreintes } = preparerEnvoi(elementsDuCarnet(contenu), carte);
  let c = carte;
  for (const lot of lots(modifications, 2)) {
    const r = nas.envoyer(lot);
    c = majCarte(c, empreintes, r);
    if (r.conflits.length) c = majCarte(c, empreintes, nas.envoyer(forcer(lot, r.conflits)));
  }
  return { carte: c, envoyees: modifications.length };
}

test('éléments du carnet : vols, avions SANS photo (crédit gardé), personnes, réglages du carnet seulement', () => {
  const l = elementsDuCarnet(carnet());
  assert.deepEqual(l.map(e => `${e.magasin}/${e.id}`), ['vols/v1', 'vols/v2', 'avions/a1', 'personnes/p1', 'reglages/etiquettes', 'reglages/titulaire']);
  const a = l.find(e => e.magasin === 'avions').donnees;
  assert.equal(a.photo, undefined); assert.deepEqual(a.photoCredit, { auteur: 'Jean Essai' });
  assert.ok(!JSON.stringify(l).includes('secret-essai'), 'jamais le mot de passe du NAS');
  for (const k of REGLAGES_PARTAGES) assert.ok(!REGLAGES_PRIVES.includes(k), k + ' : partagé, pas privé');
  for (const k of ['synchroRole', 'synchroEtat', 'synchroAppareil']) assert.ok(REGLAGES_PRIVES.includes(k), k + ' : propre à l\'appareil (hors sauvegarde)');
});

test('téléphone : premier envoi complet, puis seulement ce qui change ; suppressions envoyées', () => {
  const nas = fauxNas(), c = carnet();
  let r = envoyer(nas, c, {});
  assert.equal(r.envoyees, 6); assert.equal(nas.rev, 6); assert.equal(Object.keys(r.carte).length, 6);
  assert.equal(envoyer(nas, c, r.carte).envoyees, 0, 'rien de changé : rien envoyé');
  c.vols[0] = { ...c.vols[0], remarques: 'modifié' };
  c.vols.push({ id: 'v3', date: '2026-01-04' });
  c.vols = c.vols.filter(v => v.id !== 'v2');
  r = envoyer(nas, c, r.carte);
  assert.equal(r.envoyees, 3, 'modifié + ajouté + supprimé');
  assert.equal(nas.el.get('vols/v2').supprime, true);
  assert.ok(!('vols/v2' in r.carte) && 'vols/v3' in r.carte);
  c.avions[0] = { ...c.avions[0], photo: 'data:image/jpeg;base64,BBBB' };
  assert.equal(envoyer(nas, c, r.carte).envoyees, 0, 'seule la photo a changé : rien n\'est envoyé (elle reste sur le téléphone)');
});

test('téléphone réinstallé ou réactivé : carte refaite depuis le NAS, rien d\'identique n\'est renvoyé', () => {
  const nas = fauxNas(), c = carnet();
  envoyer(nas, c, {});
  const revAvant = nas.rev;
  c.personnes = [];                                            // supprimée depuis
  const carte = carteDepuisNas(nas.recevoir(0));
  const r = envoyer(nas, c, carte);
  assert.equal(r.envoyees, 1); assert.equal(nas.rev, revAvant + 1); assert.equal(nas.el.get('personnes/p1').supprime, true);
});

test('changé sur le NAS sans passer par ce téléphone : le téléphone fait foi (sens unique)', () => {
  const nas = fauxNas(), c = carnet();
  let r = envoyer(nas, c, {});
  nas.envoyer([{ magasin: 'vols', id: 'v1', base: 1, donnees: { id: 'v1', autre: 'appareil' } }]);
  c.vols[0] = { ...c.vols[0], remarques: 'téléphone' };
  r = envoyer(nas, c, r.carte);
  assert.equal(nas.el.get('vols/v1').donnees.remarques, 'téléphone');
  assert.equal(r.carte['vols/v1'][0], nas.el.get('vols/v1').rev);
});

test('élément trop gros : pas envoyé (signalé), le reste part', () => {
  const c = carnet();
  c.vols.push({ id: 'gros', remarques: 'x'.repeat(ELEMENT_MAX + 10) });
  const p = preparerEnvoi(elementsDuCarnet(c), {});
  assert.deepEqual(p.tropGros, ['vols/gros']);
  assert.equal(p.modifications.length, 6);
});

test('PC : éléments reçus rangés ; suppressions ; jamais un réglage propre à l\'appareil', () => {
  const t = trierRecus([
    { magasin: 'vols', id: 'v1', rev: 1, donnees: { id: 'v1' } }, { magasin: 'vols', id: 'v2', rev: 2, supprime: true, donnees: null },
    { magasin: 'avions', id: 'a1', rev: 3, donnees: { id: 'a1' } }, { magasin: 'reglages', id: 'titulaire', rev: 4, donnees: { cle: 'titulaire', valeur: 'X' } },
    { magasin: 'reglages', id: 'nasMotDePasse', rev: 5, donnees: { cle: 'nasMotDePasse', valeur: 'pirate' } },
    { magasin: 'traces', id: 'z', rev: 6, donnees: {} }, { magasin: 'vols', id: 'v9', rev: 7, donnees: { id: 'autre' } }]);
  assert.deepEqual(t.mettre.vols, [{ id: 'v1' }]);
  assert.deepEqual(t.enlever.vols, ['v2']);
  assert.deepEqual(t.mettre.reglages, [{ cle: 'titulaire', valeur: 'X' }]);
  assert.ok(!JSON.stringify(t).includes('pirate') && !JSON.stringify(t).includes('autre'), 'réglage privé et élément incohérent ignorés');
});

test('bout à bout : le PC a exactement le carnet du téléphone (sans photos ni réglages privés)', () => {
  const nas = fauxNas(), c = carnet();
  envoyer(nas, c, {});
  const pc = { vols: new Map(), avions: new Map(), personnes: new Map(), reglages: new Map() };
  let rev = 0;
  const recevoir = () => {
    const el = nas.recevoir(rev); const t = trierRecus(el);
    for (const m of ['vols', 'avions', 'personnes']) { for (const o of t.mettre[m]) pc[m].set(o.id, o); for (const id of t.enlever[m]) pc[m].delete(id); }
    for (const r of t.mettre.reglages) pc.reglages.set(r.cle, r.valeur);
    rev = el.length ? el.at(-1).rev : rev;
  };
  recevoir();
  c.vols = c.vols.slice(1); c.vols.push({ id: 'v4' });
  envoyer(nas, c, carteDepuisNas(nas.recevoir(0)));
  recevoir();
  assert.deepEqual([...pc.vols.keys()].sort(), c.vols.map(v => v.id).sort());
  assert.equal(pc.avions.get('a1').photo, undefined);
  assert.deepEqual(Object.fromEntries(pc.reglages), { etiquettes: ['BOMBING'], titulaire: 'Pilote Essai' });
});

test('outils : lots, empreinte, résumé dans Plus', () => {
  assert.deepEqual(lots([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(empreinteTexte('abc'), empreinteTexte('abc'));
  assert.notEqual(empreinteTexte('abc'), empreinteTexte('abd'));
  const t = Date.parse('2026-11-08T12:00:00Z');
  assert.equal(resumeSynchro(undefined), 'Arrêtée');
  assert.equal(resumeSynchro('reference', { derniere: '2026-11-08T11:58:00Z' }, t), 'Ce téléphone envoie le carnet · à jour il y a 2 min');
  assert.equal(resumeSynchro('reference', { attente: true, statut: 'horsLigne' }, t), 'Envoi en attente (pas de réseau)');
  assert.equal(resumeSynchro('consultation', { derniere: '2026-11-08T11:30:00Z' }, t), 'Consultation · à jour il y a 30 min');
  assert.equal(resumeSynchro('consultation', { derniere: '2026-11-08T11:30:00Z', statut: 'injoignable' }, t), 'Consultation · NAS injoignable · reçu il y a 30 min');
  assert.equal(resumeSynchro('consultation', { statut: 'refuse' }, t), 'Mot de passe refusé : à corriger');
});
