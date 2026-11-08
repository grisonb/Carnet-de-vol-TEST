// v0.25 : l'iPad, 3e appareil du carnet (en modification, comme le PC). Trois appareils simulés autour d'un faux NAS en
// mémoire qui suit les règles de carnet.php v5. Carnet INVENTÉ ; aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementsDuCarnet, preparerEnvoi, majCarte, analyserRecus, cleElement, empreinteTexte, nomAppareil, duNom, ceNom, ceNomMin, leNom, estIPad,
  compterSuppressions, SUPPRESSIONS_A_CONFIRMER } from '../../js/synchro.js';

function fauxNas() {
  const n = { rev: 0, el: new Map(), envois: [] };
  n.envoyer = (mods, appareil) => {
    n.envois.push({ appareil, n: mods.length });
    const acceptees = [], deja = [], conflits = [];
    for (const m of mods) {
      const cle = `${m.magasin}/${m.id}`, a = n.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : structuredClone(m.donnees);
      if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
      if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
      n.rev++; n.el.set(cle, { rev: n.rev, supprime: !!m.supprime, donnees, appareil });
      acceptees.push({ magasin: m.magasin, id: m.id, rev: n.rev });
    }
    return { rev: n.rev, acceptees, deja, conflits };
  };
  n.recevoir = depuis => [...n.el.entries()].filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev)
    .map(([cle, e]) => ({ magasin: cle.split('/')[0], id: cle.slice(cle.indexOf('/') + 1), ...structuredClone(e) }));
  return n;
}
const appareil = (nom, contenu) => ({ nom, contenu, carte: {}, rev: 0, conflits: new Map() });
const locaux = a => new Map(elementsDuCarnet(a.contenu).map(e => [cleElement(e.magasin, e.id), { ...e, h: empreinteTexte(JSON.stringify(e.donnees)) }]));
function ecrire(a, x) {
  a.contenu[x.magasin] = a.contenu[x.magasin].filter(o => o.id !== x.id);
  if (x.donnees) a.contenu[x.magasin].push(structuredClone(x.donnees));
}
function synchro(nas, a) {
  const r = analyserRecus(nas.recevoir(a.rev), locaux(a), a.carte);
  for (const x of r.appliquer) ecrire(a, x);
  for (const c of r.conflits) a.conflits.set(c.cle, c);
  a.carte = r.carte; a.rev = nas.rev;
  const p = preparerEnvoi(elementsDuCarnet(a.contenu), a.carte, new Set(a.conflits.keys()));
  const aConfirmer = compterSuppressions(p.modifications) > SUPPRESSIONS_A_CONFIRMER;
  const mods = aConfirmer ? p.modifications.filter(m => !m.supprime) : p.modifications;
  if (mods.length) a.carte = majCarte(a.carte, p.empreintes, nas.envoyer(mods, a.nom));
  return { envoyes: mods.length, aConfirmer };
}
const vide = () => ({ vols: [], avions: [], personnes: [], reglages: [] });
const vol = (a, id) => a.contenu.vols.find(v => v.id === id);

test('iPad reconnu (iPadOS se présente souvent comme un Mac tactile) ; noms dans les textes', () => {
  assert.equal(estIPad('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), true);
  assert.equal(estIPad('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5), true, 'iPadOS en « version ordinateur »');
  assert.equal(estIPad('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0), false, 'un vrai Mac');
  assert.equal(estIPad('Mozilla/5.0 (Linux; Android 14; Mobile) Chrome/130', 5), false);
  assert.equal(nomAppareil('ipad-abc'), 'iPad');
  assert.deepEqual([duNom('iPad'), duNom('PC'), duNom('téléphone'), duNom('?')], ['de l\'iPad', 'du PC', 'du téléphone', 'de l\'autre appareil']);
  assert.deepEqual([ceNom('iPad'), ceNomMin('PC'), leNom('téléphone'), leNom('iPad')], ['Cet iPad', 'ce PC', 'le téléphone', 'l\'iPad']);
});

test('trois appareils : ce que l\'iPad change arrive au téléphone et au PC (et l\'inverse)', () => {
  const nas = fauxNas();
  const tel = appareil('tel-1', { ...vide(), vols: [{ id: 'v1', remarques: '' }, { id: 'v2' }], avions: [{ id: 'a1', immat: 'F-XZZA' }] });
  const pc = appareil('pc-1', vide()), ipad = appareil('ipad-1', vide());
  synchro(nas, tel); synchro(nas, pc); synchro(nas, ipad);
  assert.equal(ipad.contenu.vols.length, 2);
  vol(ipad, 'v1').remarques = 'IPAD';
  ipad.contenu.vols.push({ id: 'v3' });
  pc.contenu.vols = pc.contenu.vols.filter(v => v.id !== 'v2');
  synchro(nas, ipad); synchro(nas, pc); synchro(nas, tel); synchro(nas, ipad); synchro(nas, pc);
  for (const a of [tel, pc, ipad]) {
    assert.deepEqual(a.contenu.vols.map(v => v.id).sort(), ['v1', 'v3'], a.nom);
    assert.equal(vol(a, 'v1').remarques, 'IPAD', a.nom);
    assert.equal(a.conflits.size, 0, a.nom);
  }
});

test('conflit iPad / téléphone : rien n\'est écrasé ; le choix fait sur l\'iPad arrive partout', () => {
  const nas = fauxNas();
  const tel = appareil('tel-1', { ...vide(), vols: [{ id: 'v1', remarques: '' }] }), pc = appareil('pc-1', vide()), ipad = appareil('ipad-1', vide());
  synchro(nas, tel); synchro(nas, pc); synchro(nas, ipad);
  vol(tel, 'v1').remarques = 'TELEPHONE'; vol(ipad, 'v1').remarques = 'IPAD';
  synchro(nas, tel); synchro(nas, ipad);
  const c = ipad.conflits.get('vols/v1');
  assert.ok(c && nomAppareil(c.appareil) === 'téléphone' && vol(ipad, 'v1').remarques === 'IPAD');
  ipad.carte['vols/v1'] = [c.rev, empreinteTexte(JSON.stringify(c.distant))]; ipad.conflits.delete('vols/v1'); // « Garder la version de l'iPad »
  synchro(nas, ipad); synchro(nas, tel); synchro(nas, pc);
  for (const a of [tel, pc, ipad]) assert.equal(vol(a, 'v1').remarques, 'IPAD', a.nom);
});

test('iPad qui perd son carnet : rien de vide n\'est envoyé', () => {
  const nas = fauxNas();
  const tel = appareil('tel-1', { ...vide(), vols: Array.from({ length: 30 }, (_, i) => ({ id: 'v' + i })) }), ipad = appareil('ipad-1', vide());
  synchro(nas, tel); synchro(nas, ipad);
  // Safari a effacé le carnet mais pas l'état de la synchro (cas partiel) : 30 suppressions -> confirmation, rien ne part
  ipad.contenu.vols = [];
  const r = synchro(nas, ipad);
  assert.equal(r.aConfirmer, true); assert.equal(r.envoyes, 0);
  synchro(nas, tel);
  assert.equal(tel.contenu.vols.length, 30, 'le téléphone garde tout');
  // Tout effacé (cas habituel : Safari efface toute la base, état de synchro compris) : l'iPad repart de zéro et reçoit
  const neuf = appareil('ipad-1', vide());
  assert.equal(synchro(nas, neuf).envoyes, 0);
  assert.equal(neuf.contenu.vols.length, 30);
});
