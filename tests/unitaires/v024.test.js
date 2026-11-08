// v0.24 (R50 étape 4) : synchro dans les DEUX sens. Deux appareils simulés (téléphone, PC) autour d'un faux NAS en mémoire
// qui suit les règles de carnet.php v5. Carnet INVENTÉ ; aucun appel réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementsDuCarnet, preparerEnvoi, majCarte, analyserRecus, fusionReglage, differences, doublons, nomAppareil, compterSuppressions,
  cleElement, empreinteTexte } from '../../js/synchro.js';

function fauxNas() {
  const n = { rev: 0, el: new Map() };
  n.envoyer = (mods, appareil) => {
    const acceptees = [], deja = [], conflits = [];
    for (const m of mods) {
      const cle = `${m.magasin}/${m.id}`, a = n.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : structuredClone(m.donnees); // copie, comme un vrai NAS
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
// Un appareil : son carnet, sa carte, son dernier numéro reçu, ses conflits (comme js/ui/synchro.js)
function appareil(nom, contenu) {
  return { nom, contenu, carte: {}, rev: 0, conflits: new Map(), ouvert: null };
}
const locaux = a => new Map(elementsDuCarnet(a.contenu).map(e => [cleElement(e.magasin, e.id), { ...e, h: empreinteTexte(JSON.stringify(e.donnees)) }]));
function ecrire(a, x) {
  if (x.magasin === 'reglages') { a.contenu.reglages = a.contenu.reglages.filter(r => r.cle !== x.id); if (x.donnees) a.contenu.reglages.push({ ...x.donnees }); return; }
  a.contenu[x.magasin] = a.contenu[x.magasin].filter(o => o.id !== x.id);
  if (x.donnees) a.contenu[x.magasin].push(structuredClone(x.donnees));
}
function synchro(nas, a) {
  const r = analyserRecus(nas.recevoir(a.rev), locaux(a), a.carte, a.ouvert);
  for (const x of r.appliquer) ecrire(a, x);
  for (const c of r.conflits) a.conflits.set(c.cle, c);
  a.carte = r.carte; a.rev = nas.rev;
  const p = preparerEnvoi(elementsDuCarnet(a.contenu), a.carte, new Set(a.conflits.keys()));
  if (p.modifications.length) a.carte = majCarte(a.carte, p.empreintes, nas.envoyer(p.modifications, a.nom));
  return { recus: r.appliquer.length, envoyes: p.modifications.length, fusions: r.fusions, suppressions: compterSuppressions(p.modifications) };
}
// Le choix du pilote (comme resoudre() de js/ui/synchro.js)
function choisir(a, cle, choix) {
  const c = a.conflits.get(cle);
  a.carte[cle] = [c.rev, c.distant === null ? null : empreinteTexte(JSON.stringify(c.distant))];
  if (choix === 'autre') ecrire(a, { magasin: c.magasin, id: c.id, donnees: c.distant });
  if (choix === 'deux') {
    const l = a.contenu.vols.find(v => v.id === c.id);
    ecrire(a, { magasin: 'vols', id: c.id, donnees: c.distant });
    a.contenu.vols.push({ ...l, id: l.id + '-copie' });
  }
  a.conflits.delete(cle);
}
const depart = () => ({
  vols: [{ id: 'v1', date: '2026-01-02', dep: 'LFMN', arr: 'LFMD', remarques: '' }, { id: 'v2', date: '2026-01-03', dep: 'LFTW', arr: 'LFTW' }],
  avions: [{ id: 'a1', immat: 'F-XZZA' }], personnes: [{ id: 'p1', tri: 'ZZZ' }],
  reglages: [{ cle: 'etiquettes', valeur: ['BOMBING'] }, { cle: 'titulaire', valeur: 'Pilote Essai' }],
});
function deuxAppareils() {
  const nas = fauxNas(), tel = appareil('tel-1', depart()), pc = appareil('pc-1', { vols: [], avions: [], personnes: [], reglages: [] });
  synchro(nas, tel); synchro(nas, pc);
  return { nas, tel, pc };
}
const vol = (a, id) => a.contenu.vols.find(v => v.id === id);

test('deux sens : ajout, modification, suppression de chaque côté arrivent de l\'autre', () => {
  const { nas, tel, pc } = deuxAppareils();
  assert.equal(pc.contenu.vols.length, 2, 'le PC a reçu le carnet');
  pc.contenu.vols.push({ id: 'v3', date: '2026-01-04' });
  vol(pc, 'v1').remarques = 'modifié sur le PC';
  tel.contenu.vols = tel.contenu.vols.filter(v => v.id !== 'v2');
  tel.contenu.personnes.push({ id: 'p2', tri: 'ZZY' });
  synchro(nas, pc); synchro(nas, tel); synchro(nas, pc);
  assert.deepEqual(tel.contenu.vols.map(v => v.id).sort(), ['v1', 'v3']);
  assert.deepEqual(pc.contenu.vols.map(v => v.id).sort(), ['v1', 'v3']);
  assert.equal(vol(tel, 'v1').remarques, 'modifié sur le PC');
  assert.ok(pc.contenu.personnes.some(p => p.id === 'p2'));
  assert.equal(tel.conflits.size + pc.conflits.size, 0, 'aucun conflit');
  const r = synchro(nas, tel);
  assert.equal(r.recus + r.envoyes, 0, 'ensuite, plus rien ne bouge (ses propres envois ne reviennent pas)');
});

test('conflit modification / modification : rien n\'est écrasé ; les 3 choix', () => {
  for (const choix of ['ici', 'autre', 'deux']) {
    const { nas, tel, pc } = deuxAppareils();
    vol(tel, 'v1').remarques = 'TELEPHONE';
    vol(pc, 'v1').remarques = 'PC';
    synchro(nas, tel);
    const r = synchro(nas, pc);
    assert.equal(pc.conflits.size, 1, choix + ' : conflit sur le PC');
    assert.equal(vol(pc, 'v1').remarques, 'PC', '  la version du PC n\'est pas écrasée');
    assert.equal(r.envoyes, 0, '  et rien n\'est envoyé pour cet élément tant que le pilote n\'a pas choisi');
    const c = pc.conflits.get('vols/v1');
    assert.equal(c.distant.remarques, 'TELEPHONE'); assert.equal(nomAppareil(c.appareil), 'téléphone');
    choisir(pc, 'vols/v1', choix);
    synchro(nas, pc); synchro(nas, tel);
    const attendu = { ici: 'PC', autre: 'TELEPHONE', deux: 'TELEPHONE' }[choix];
    assert.equal(vol(pc, 'v1').remarques, attendu, choix + ' : PC');
    assert.equal(vol(tel, 'v1').remarques, attendu, choix + ' : téléphone (a reçu le choix)');
    if (choix === 'deux') {
      assert.equal(vol(tel, 'v1-copie').remarques, 'PC', '  les deux : la version du PC devient un 2e vol, sur les deux appareils');
      assert.equal(pc.contenu.vols.length, 3); assert.equal(tel.contenu.vols.length, 3);
    }
    assert.equal(tel.conflits.size + pc.conflits.size, 0);
  }
});

test('conflit suppression / modification : rien n\'est effacé avant le choix', () => {
  const { nas, tel, pc } = deuxAppareils();
  tel.contenu.vols = tel.contenu.vols.filter(v => v.id !== 'v2');
  vol(pc, 'v2').arr = 'LFMD';
  synchro(nas, tel); synchro(nas, pc);
  const c = pc.conflits.get('vols/v2');
  assert.equal(c.distant, null, 'supprimé sur le téléphone');
  assert.equal(vol(pc, 'v2').arr, 'LFMD', 'toujours là sur le PC');
  choisir(pc, 'vols/v2', 'ici'); // garder la version du PC
  synchro(nas, pc); synchro(nas, tel);
  assert.equal(vol(tel, 'v2').arr, 'LFMD', 'le téléphone le retrouve');
  // L'inverse : modifié sur le téléphone, supprimé sur le PC, on garde la suppression (version du PC)
  vol(tel, 'v1').remarques = 'X';
  pc.contenu.vols = pc.contenu.vols.filter(v => v.id !== 'v1');
  synchro(nas, tel); synchro(nas, pc);
  assert.ok(pc.conflits.has('vols/v1') && !vol(pc, 'v1'), 'supprimé ici, modifié là-bas : conflit, rien ne revient tout seul');
  choisir(pc, 'vols/v1', 'ici');
  synchro(nas, pc); synchro(nas, tel);
  assert.ok(!vol(tel, 'v1') && !vol(pc, 'v1'), 'suppression gardée des deux côtés');
});

test('« Annuler » 4 s après une suppression, même si la synchro est passée entre-temps : pas de faux conflit', () => {
  const { nas, tel, pc } = deuxAppareils();
  const copie = structuredClone(vol(tel, 'v1'));
  tel.contenu.vols = tel.contenu.vols.filter(v => v.id !== 'v1');
  synchro(nas, tel);                       // la suppression est partie
  tel.contenu.vols.push(copie);            // « Annuler »
  synchro(nas, tel); synchro(nas, pc);
  assert.equal(tel.conflits.size + pc.conflits.size, 0);
  assert.ok(vol(pc, 'v1'), 'le vol est revenu partout');
});

test('réglages : listes et terrains fusionnés sans conflit ; titulaire en conflit', () => {
  const { nas, tel, pc } = deuxAppareils();
  tel.contenu.reglages.find(r => r.cle === 'etiquettes').valeur = ['BOMBING', 'TRANSPORT'];
  pc.contenu.reglages.find(r => r.cle === 'etiquettes').valeur = ['BOMBING', 'TAILWHEEL'];
  synchro(nas, tel);
  const r = synchro(nas, pc);
  assert.equal(r.fusions, 1); assert.equal(pc.conflits.size, 0);
  synchro(nas, tel);
  assert.deepEqual(tel.contenu.reglages.find(x => x.cle === 'etiquettes').valeur, ['BOMBING', 'TAILWHEEL', 'TRANSPORT']);
  assert.deepEqual(fusionReglage('terrainsPerso', { ZZZA: { nom: 'Ici' } }, { ZZZB: { nom: 'Là' } }), { ZZZB: { nom: 'Là' }, ZZZA: { nom: 'Ici' } });
  assert.equal(fusionReglage('titulaire', 'A', 'B'), null);
  tel.contenu.reglages.find(x => x.cle === 'titulaire').valeur = 'Tel';
  pc.contenu.reglages.find(x => x.cle === 'titulaire').valeur = 'Pc';
  synchro(nas, tel); synchro(nas, pc);
  assert.ok(pc.conflits.has('reglages/titulaire'));
});

test('vol ouvert dans la saisie : jamais changé sous les yeux du pilote (conflit à la place)', () => {
  const { nas, tel, pc } = deuxAppareils();
  vol(tel, 'v1').remarques = 'TEL';
  synchro(nas, tel);
  pc.ouvert = 'vols/v1';
  synchro(nas, pc);
  assert.equal(vol(pc, 'v1').remarques, '', 'pas changé pendant qu\'il est ouvert');
  assert.ok(pc.conflits.has('vols/v1'));
});

test('plus de 20 suppressions d\'un coup : comptées (confirmation avant envoi)', () => {
  const nas = fauxNas(), tel = appareil('tel-1', { vols: Array.from({ length: 30 }, (_, i) => ({ id: 'v' + i })), avions: [], personnes: [], reglages: [] });
  synchro(nas, tel);
  tel.contenu.vols = tel.contenu.vols.slice(0, 5);
  const p = preparerEnvoi(elementsDuCarnet(tel.contenu), tel.carte);
  assert.equal(compterSuppressions(p.modifications), 25);
});

test('doublons possibles : seulement parmi les vols récents ; même vol NPF ; paires gardées', () => {
  const v = (id, creeLe, extra = {}) => ({ id, date: '2026-01-02', dep: 'LFMN', arr: 'LFMD', hDep: '10:00', tempsTotal: 60, creeLe, ...extra });
  const cle = x => [x.date, x.dep, x.arr, x.hDep, x.tempsTotal].join('|');
  const vols = [v('ancien1', '2020-01-01'), v('ancien2', '2020-01-01'), v('a', '2026-11-08T10:00:00Z', { date: '2026-11-08' }), v('b', '2026-11-08T10:05:00Z', { date: '2026-11-08' }),
    v('n1', '2026-11-08T11:00:00Z', { date: '2026-11-07', npfId: 'npf-1' }), v('n2', '2026-11-08T11:01:00Z', { date: '2026-11-07', hDep: '10:05', npfId: 'npf-1' })];
  const p = doublons(vols, cle, '2026-11-08T00:00:00Z');
  assert.deepEqual(p.map(x => x.cle).sort(), ['a|b', 'n1|n2'], 'les doublons anciens du carnet ne sont pas signalés');
  assert.deepEqual(doublons(vols, cle, '2026-11-08T00:00:00Z', ['a|b']).map(x => x.cle), ['n1|n2'], '« Garder les deux » : plus signalé');
});

test('écran de choix : différences lisibles', () => {
  const d = differences({ id: 'v1', remarques: 'A', tempsTotal: 65, avionId: 'a1', modifieLe: 'x' }, { id: 'v1', remarques: 'B', tempsTotal: 65, avionId: 'a2', modifieLe: 'y' },
    new Map([['a1', { immat: 'F-XZZA' }], ['a2', { immat: 'F-XZZB' }]]));
  assert.deepEqual(d, [{ champ: 'Remarques', ici: 'A', autre: 'B' }, { champ: 'Avion', ici: 'F-XZZA', autre: 'F-XZZB' }]);
  assert.equal(nomAppareil('pc-abc'), 'PC'); assert.equal(nomAppareil('tel-abc'), 'téléphone');
});
