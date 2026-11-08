// Copie automatique du carnet sur le NAS (v0.10) : envoi discret en arrière-plan, Plus › Copie sur le NAS,
// Plus › Restaurer depuis le NAS. Aucune fenêtre ni message d'erreur intrusif : l'état se lit dans Plus.
// L'adresse et le mot de passe du NAS sont tapés sur le téléphone (jamais dans le code, le dépôt, le CSV
// ni la sauvegarde de secours). Les tests remplacent le NAS par un faux serveur local.

import { $, esc, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, reglage, ecrireReglageDiscret, contenuComplet, restaurer } from '../etat.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde, sansPhotos, garderPhotos } from '../sauvegarde.js';
import { creerCopieur, urlApi, resumeNas, compresser, decompresser, empreinteSha256, taillePropre, depuis, problemeNouveauMotDePasse, texteAttente, MDP_MIN } from '../copieur.js';

const nombre = n => n.toLocaleString('fr-FR');
const enLigne = () => navigator.onLine !== false;
export const configNas = () => ({
  url: urlApi(reglage('nasAdresse')), motDePasse: reglage('nasMotDePasse') || '',
  configuree: !!(urlApi(reglage('nasAdresse')) && reglage('nasMotDePasse')), auto: reglage('nasAuto') !== false,
});
export const etatNas = () => reglage('nasEtat') || {};
export const resumeCopieNas = () => resumeNas(configNas(), etatNas(), Date.now(), enLigne());

// ---------- Réseau ----------
const STATUTS = { 401: 'refuse', 413: 'trop-gros', 400: 'abimee', 500: 'stockage', 403: 'origine', 404: 'introuvable', 429: 'bloque' };
// Protocole 2 (v0.12) : « &v=2 » demande au NAS de répondre aux erreurs avec le code HTTP 200 et {"erreur", "code"}.
// Le serveur web du Synology remplace sinon toute réponse d'erreur par sa propre page, sans en-têtes CORS : le
// navigateur ne la laisse pas lire et l'app ne voyait qu'un « NAS injoignable ». Les vrais codes HTTP restent compris.
export async function erreurDansReponse(r) {
  if (!/json/i.test(r.headers.get('content-type') || '')) return null;
  let j = null;
  try { j = await r.clone().json(); } catch { return null; }
  if (!j || typeof j !== 'object' || !j.erreur) return null;
  const code = Number(j.code) || 400;
  return { statut: STATUTS[code] || 'injoignable', code, erreur: String(j.erreur), attente: Number(j.attente) || 0, minimum: Number(j.minimum) || 0 };
}
export async function requete(action, { url = configNas().url, motDePasse = configNas().motDePasse, corps = null, entetes = {}, extra = '', delai = 30000 } = {}) {
  if (!url) return { statut: 'adresse' };
  if (!enLigne()) return { statut: 'horsLigne' };
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), delai);
  try {
    const r = await fetch(`${url}?action=${action}&v=2${extra}`, {
      method: 'POST', body: corps, signal: arret.signal, cache: 'no-store',
      headers: { 'X-Carnet-Cle': motDePasse, ...entetes },
    });
    if (!r.ok) return { statut: STATUTS[r.status] || 'injoignable', code: r.status };
    const err = await erreurDansReponse(r);
    if (err) return err;
    return { statut: 'ok', reponse: r };
  } catch { return { statut: 'injoignable' }; } finally { clearTimeout(minuterie); }
}

// La sauvegarde de secours SANS les photos d'avion (v0.14), compressée, avec son empreinte
async function envoyerCopie() {
  const s = sansPhotos(creerSauvegarde(await contenuComplet()));
  const octets = await compresser(texteSauvegarde(s));
  const r = await requete('envoyer', { corps: octets, delai: 120000, extra: `&vols=${s.nombres.vols}`,
    entetes: { 'Content-Type': 'application/octet-stream', 'X-Carnet-Empreinte': await empreinteSha256(octets) } });
  if (r.statut !== 'ok') return r;
  return { statut: 'ok', taille: octets.length, vols: s.nombres.vols };
}

// ---------- État enregistré sur le téléphone (sans déclencher de copie) ----------
async function noterEtat(ev) {
  const avant = etatNas();
  const e = { ...avant, enAttente: ev.enAttente, statut: ev.statut, dernierEssai: new Date().toISOString() };
  if (ev.statut === 'ok') { e.derniereCopie = new Date().toISOString(); e.taille = ev.taille; e.vols = ev.vols; }
  if (ev.statut === 'attente' && avant.enAttente && avant.statut === 'attente') return; // rien de neuf à écrire
  await ecrireReglageDiscret('nasEtat', e);
  document.dispatchEvent(new CustomEvent('nas-etat'));
}

const copieur = creerCopieur({
  envoyer: envoyerCopie,
  pret: forcer => configNas().configuree && (forcer || configNas().auto),
  enLigne,
  surEtat: ev => { noterEtat(ev); },
});

// Appelé à chaque modification du carnet (vol, avion, personne, réglage…)
export function carnetModifie() {
  if (configNas().configuree) copieur.modification();
}

// v0.22 : mot de passe refusé -> plus AUCUN appel automatique au NAS (copie, vols NPF) tant qu'il n'est pas corrigé.
// Sinon chaque ouverture de l'app ajouterait un essai raté et finirait par bloquer l'adresse de la maison (iPad compris).
export const nasRefuse = () => etatNas().statut === 'refuse';
export async function noterRefus() {
  if (nasRefuse()) return;
  await ecrireReglageDiscret('nasEtat', { ...etatNas(), statut: 'refuse', dernierEssai: new Date().toISOString() });
  document.dispatchEvent(new CustomEvent('nas-etat'));
}

export function initNas() {
  copieur.restaurerAttente(!!etatNas().enAttente);
  if (!nasRefuse()) copieur.reprendre(3000); // copie restée en attente lors d'une session précédente
  addEventListener('online', () => { if (!nasRefuse()) copieur.reprendre(1500); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !nasRefuse()) copieur.reprendre(2000); });
}

// ---------- Plus › Copie sur le NAS ----------
const TEXTES = {
  ok: 'OK : le NAS répond.', refuse: 'Mot de passe refusé.', injoignable: 'NAS injoignable (éteint, pas de réseau ou mauvaise adresse).',
  horsLigne: 'Pas de réseau.', adresse: 'Adresse invalide : elle doit commencer par https://', stockage: 'Le NAS répond, mais le dossier des copies est inaccessible.',
  origine: 'Le NAS refuse l\'app (origine).', introuvable: 'Cette copie n\'est plus sur le NAS.', 'trop-gros': 'Copie trop grosse pour le NAS.', abimee: 'Copie refusée par le NAS (arrivée incomplète).',
  bloque: 'Trop d\'essais de mot de passe : le NAS attend avant d\'accepter un nouvel essai.',
};
// Texte d'un résultat (avec l'attente pour « trop d'essais »)
const texteResultat = r => (r.statut === 'bloque' && r.attente ? `Trop d'essais de mot de passe : réessaie dans ${texteAttente(r.attente)}.` : TEXTES[r.statut] || TEXTES.injoignable);

function majEcranNas() {
  const el = $('#nas-etat');
  if (!el) return;
  el.textContent = resumeCopieNas();
  const e = etatNas();
  $('#nas-detail').textContent = e.derniereCopie ? `Dernière copie réussie ${depuis(e.derniereCopie)}${e.taille ? ` · ${taillePropre(e.taille)}` : ''}${e.vols !== undefined ? ` · ${nombre(e.vols)} vols` : ''}` : '';
}
document.addEventListener('nas-etat', majEcranNas);

export function ecranNas() {
  const c = configNas();
  const o = ouvrirOutil('Copie sur le NAS', `
    <p class="hint" style="font-size:15px">Après chaque modification, une copie de ton carnet (toutes les données, sans les photos d'avion, compressée) part toute seule sur ton NAS, en arrière-plan. NAS éteint ou pas de réseau : elle attend et repart d'elle-même. Le NAS garde les 20 dernières copies et une par jour sur 30 jours.</p>
    <div class="sec">
      <div class="field"><label for="nas-adr">Adresse de la copie</label><input id="nas-adr" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/carnet-api/" value="${esc(reglage('nasAdresse') || '')}"></div>
      <div class="field"><label for="nas-mdp">Mot de passe du NAS</label><input id="nas-mdp" type="password" autocomplete="off" value="${esc(c.motDePasse)}"></div>
      <div class="row2"><button type="button" class="ghost" id="nas-test">Tester</button><button type="button" class="ghost primary" id="nas-ok">Enregistrer</button></div>
      <p id="nas-res" class="hint" role="status"></p>
      <button type="button" class="linkbtn" id="nas-chg">Changer le mot de passe ›</button>
      <p class="hint">Gardés seulement sur ce téléphone : ni dans le tableur CSV, ni dans la sauvegarde de secours (à retaper sur un nouveau téléphone).</p>
    </div>
    <div class="sec"><h3>Copie</h3>
      <div class="tline"><span>Copie automatique</span><button type="button" class="sw" id="nas-auto" role="switch" aria-checked="${c.auto}" aria-label="Copie automatique"><span></span></button></div>
      <p id="nas-etat" role="status"></p>
      <p class="hint" id="nas-detail"></p>
      <button type="button" class="bigbtn" id="nas-go">Copier maintenant</button>
      <p class="hint" id="nas-go-res" role="status"></p>
      <button type="button" class="bigbtn second" id="nas-rest">Restaurer depuis le NAS ›</button>
    </div>`);
  majEcranNas();
  const res = (sel, statut, texte) => { const p = o.querySelector(sel); p.textContent = texte || TEXTES[statut] || TEXTES.injoignable; p.className = statut === 'ok' ? 'okc' : 'koc'; };
  o.querySelector('#nas-test').addEventListener('click', async () => {
    const url = urlApi($('#nas-adr').value);
    if (!url) return res('#nas-res', 'adresse');
    o.querySelector('#nas-res').textContent = 'Test en cours…'; o.querySelector('#nas-res').className = 'hint';
    const r = await requete('test', { url, motDePasse: $('#nas-mdp').value, delai: 20000 });
    if (r.statut !== 'ok') return res('#nas-res', r.statut, texteResultat(r));
    let j = {}; try { j = await r.reponse.json(); } catch { /* réponse sans détail */ }
    // v0.22 : l'ancien mot de passe n'est plus que la clé de NPF-Q400 (dépôt de vols seulement)
    if (j.cle === 'npf') return res('#nas-res', 'x', 'Ce mot de passe n\'est plus que la clé de NPF-Q400 (iPad) : tape le mot de passe actuel du carnet.');
    const n = typeof j.copies === 'number' ? j.copies : null;
    res('#nas-res', 'ok', `OK : le NAS répond${n !== null ? ` (${n} copie${n > 1 ? 's' : ''} gardée${n > 1 ? 's' : ''})` : ''}.`);
  });
  o.querySelector('#nas-ok').addEventListener('click', async () => {
    const adr = $('#nas-adr').value.trim(), mdp = $('#nas-mdp').value;
    if (adr && !urlApi(adr)) return res('#nas-res', 'adresse');
    await ecrireReglageDiscret('nasAdresse', adr);
    await ecrireReglageDiscret('nasMotDePasse', mdp);
    if (reglage('nasAuto') === undefined) await ecrireReglageDiscret('nasAuto', true);
    await ecrireReglageDiscret('nasEtat', { ...etatNas(), statut: adr && mdp ? 'attente' : undefined, enAttente: !!(adr && mdp) });
    toast('Enregistré');
    if (adr && mdp) { copieur.restaurerAttente(true); copieur.reprendre(1000); }
    majEcranNas();
    document.dispatchEvent(new CustomEvent('nas-etat'));
  });
  o.querySelector('#nas-auto').addEventListener('click', async e => {
    const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', String(on));
    await ecrireReglageDiscret('nasAuto', on);
    if (on) copieur.reprendre(1000);
    majEcranNas();
    document.dispatchEvent(new CustomEvent('nas-etat'));
  });
  o.querySelector('#nas-go').addEventListener('click', async () => {
    const b = o.querySelector('#nas-go'), p = o.querySelector('#nas-go-res');
    b.disabled = true; p.className = 'hint'; p.textContent = 'Copie en cours…';
    const r = await copieur.maintenant();
    b.disabled = false;
    if (r.statut === 'ok') res('#nas-go-res', 'ok', `Copie faite : ${nombre(r.vols)} vols, ${taillePropre(r.taille)}.`);
    else if (r.statut === 'pasConfiguree') res('#nas-go-res', 'x', 'Enregistre d\'abord l\'adresse et le mot de passe.');
    else if (r.statut === 'enCours') res('#nas-go-res', 'x', 'Une copie est déjà en cours…');
    else res('#nas-go-res', r.statut, texteResultat(r) + (r.statut === 'refuse' ? '' : ' La copie repartira toute seule plus tard.'));
    majEcranNas();
  });
  o.querySelector('#nas-rest').addEventListener('click', ecranRestaurerNas);
  o.querySelector('#nas-chg').addEventListener('click', ecranChangerMotDePasse);
}

// ---------- Plus › Copie sur le NAS › Changer le mot de passe (v0.22, R51) ----------
// Le NAS (carnet.php version 5) vérifie le mot de passe actuel, garde l'EMPREINTE du nouveau (jamais le mot de passe),
// et l'app garde le nouveau. NPF-Q400 (iPad) garde sa clé d'origine : rien à changer sur l'iPad.
export function ecranChangerMotDePasse() {
  const c = configNas();
  if (!c.configuree) {
    const o = ouvrirOutil('Changer le mot de passe', `<p class="hint" style="font-size:15px">Enregistre d'abord l'adresse et le mot de passe actuel du NAS.</p>
      <button type="button" class="bigbtn" id="cm-conf">Copie sur le NAS ›</button>`);
    o.querySelector('#cm-conf').addEventListener('click', ecranNas);
    return;
  }
  const o = ouvrirOutil('Changer le mot de passe', `
    <p class="hint" style="font-size:15px">Le NAS ne garde que l'empreinte du nouveau mot de passe. Il est gardé sur ce téléphone ; sur un autre appareil, tu le retaperas une fois. <b>L'iPad (NPF-Q400) n'a rien à changer.</b></p>
    <div class="sec">
      <div class="field"><label for="cm-n1">Nouveau mot de passe</label><input id="cm-n1" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label for="cm-n2">Encore une fois</label><input id="cm-n2" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false"></div>
      <div class="tline"><span>Afficher</span><button type="button" class="sw" id="cm-voir" role="switch" aria-checked="false" aria-label="Afficher le mot de passe"><span></span></button></div>
      <p class="hint">Au moins ${MDP_MIN} caractères : lettres sans accent, chiffres et signes, sans espace. Note-le à l'abri.</p>
    </div>
    <button type="button" class="bigbtn vert" id="cm-ok">Changer le mot de passe</button>
    <button type="button" class="bigbtn second annuler" id="cm-no">Annuler</button>
    <p class="prog" id="cm-res" role="status"></p>`);
  const msg = (t, ok = false) => { const p = o.querySelector('#cm-res'); p.textContent = t; p.className = ok ? 'okc' : t ? 'koc' : 'prog'; };
  o.querySelector('#cm-voir').addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', String(on));
    for (const id of ['#cm-n1', '#cm-n2']) o.querySelector(id).type = on ? 'text' : 'password';
  });
  for (const id of ['#cm-n1', '#cm-n2']) o.querySelector(id).addEventListener('input', () => msg(''));
  o.querySelector('#cm-no').addEventListener('click', ecranNas);
  o.querySelector('#cm-ok').addEventListener('click', async () => {
    const nouveau = o.querySelector('#cm-n1').value, ok = o.querySelector('#cm-ok');
    const pb = problemeNouveauMotDePasse(nouveau, o.querySelector('#cm-n2').value, configNas().motDePasse);
    if (pb) return msg(pb);
    ok.disabled = true;
    msg('');
    o.querySelector('#cm-res').textContent = 'Changement en cours…';
    const r = await requete('changer-mot-de-passe', { corps: JSON.stringify({ nouveau }), entetes: { 'Content-Type': 'application/json' }, delai: 30000 });
    let fait = r.statut === 'ok';
    if (r.statut === 'injoignable' || r.statut === 'refuse') {
      // Réponse perdue en route : le changement a peut-être été fait (et le navigateur a pu renvoyer la demande toute
      // seule, alors refusée puisque l'ancien mot de passe ne vaut plus). On regarde avec le nouveau mot de passe.
      const t = await requete('test', { motDePasse: nouveau, delai: 20000 });
      if (t.statut === 'ok') { let j = {}; try { j = await t.reponse.json(); } catch { /* */ } fait = j.cle === 'carnet'; }
    }
    if (fait) {
      await ecrireReglageDiscret('nasMotDePasse', nouveau);
      if (nasRefuse()) await ecrireReglageDiscret('nasEtat', { ...etatNas(), statut: 'attente' });
      copieur.reprendre(1000);
      document.dispatchEvent(new CustomEvent('nas-etat'));
      o.querySelector('#cm-n1').value = ''; o.querySelector('#cm-n2').value = ''; ok.disabled = false;
      msg('Mot de passe changé : il est gardé sur ce téléphone. Sur un autre appareil, tape-le dans « Mot de passe du NAS ». L\'iPad n\'a rien à changer.', true);
      toast('Mot de passe changé');
      return;
    }
    ok.disabled = false;
    const textes = {
      'mot-de-passe-trop-court': `Le NAS demande au moins ${r.minimum || MDP_MIN} caractères.`,
      'mot-de-passe-invalide': 'Le NAS refuse ces caractères : lettres sans accent, chiffres et signes, sans espace.',
      'mot-de-passe-identique': 'C\'est déjà le mot de passe actuel.',
      action: 'Ton NAS n\'a pas encore la mise à jour (carnet.php version 5) : installe-la d\'abord (guide, « Mise à jour v5 »).',
    };
    if (r.statut === 'refuse') { await noterRefus(); return msg('Le mot de passe actuel enregistré dans l\'app est refusé par le NAS : corrige-le d\'abord (Copie sur le NAS › Mot de passe du NAS).'); }
    msg(textes[r.erreur] || texteResultat(r));
  });
}

// ---------- Plus › Restaurer depuis le NAS ----------
const quand = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}h${p(d.getMinutes())}`;
};

export async function ecranRestaurerNas() {
  if (!configNas().configuree) {
    const o = ouvrirOutil('Restaurer depuis le NAS', `<p class="hint" style="font-size:15px">La copie sur le NAS n'est pas configurée : tape d'abord son adresse et son mot de passe.</p>
      <button type="button" class="bigbtn" id="rn-conf">Configurer la copie sur le NAS</button>`);
    o.querySelector('#rn-conf').addEventListener('click', ecranNas);
    return;
  }
  const o = ouvrirOutil('Restaurer depuis le NAS', '<p class="prog" id="rn-prog">Lecture de la liste des copies…</p><div class="flist" id="rn-l"></div>');
  const r = await requete('liste', { delai: 20000 });
  if (!$('#rn-l')) return; // écran fermé entre-temps
  if (r.statut !== 'ok') { $('#rn-prog').textContent = TEXTES[r.statut] || TEXTES.injoignable; $('#rn-prog').className = 'koc'; return; }
  let copies = [];
  try { copies = (await r.reponse.json()).copies || []; } catch { /* liste illisible */ }
  $('#rn-prog').textContent = copies.length ? `${copies.length} version${copies.length > 1 ? 's' : ''} gardée${copies.length > 1 ? 's' : ''} sur le NAS. Touche celle à remettre.` : 'Aucune copie sur le NAS pour l\'instant.';
  $('#rn-prog').className = 'hint';
  $('#rn-l').innerHTML = copies.map(c => `<button type="button" class="pitem nasv" data-id="${esc(c.id)}"><b>${esc(quand(c.date))}</b><span>${nombre(c.vols)} vols · ${taillePropre(c.taille)}</span></button>`).join('');
  $('#rn-l').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) confirmer(copies.find(c => c.id === b.dataset.id));
  });
  function confirmer(c) {
    const o2 = ouvrirOutil('Restaurer depuis le NAS', `
      <div class="sec resume"><h3>Remplacer tout le carnet par cette version ?</h3>
        <p>Copie du <b>${esc(quand(c.date))}</b> · ${nombre(c.vols)} vols</p></div>
      <p class="koc">Tout le carnet actuel (${nombre(etat.vols.length)} vols) sera remplacé par cette version.</p>
      <p class="hint" id="rn-photos">Les photos d'avion du téléphone sont gardées.</p>
      <button type="button" class="bigbtn" id="rn-ok" style="background:var(--feu)">Remplacer mon carnet</button>
      <button type="button" class="bigbtn second annuler" id="rn-no">Annuler</button>
      <p class="prog" id="rn-res" role="status"></p>`);
    o2.querySelector('#rn-no').addEventListener('click', ecranRestaurerNas);
    o2.querySelector('#rn-ok').addEventListener('click', async () => {
      const ok = o2.querySelector('#rn-ok'); ok.disabled = true;
      const p = o2.querySelector('#rn-res'); p.textContent = 'Téléchargement de la copie…';
      const r2 = await requete('lire', { extra: '&id=' + encodeURIComponent(c.id), delai: 120000 });
      if (r2.statut !== 'ok') { p.textContent = TEXTES[r2.statut] || TEXTES.injoignable; ok.disabled = false; return; }
      let lu;
      try { lu = lireSauvegarde(await decompresser(new Uint8Array(await r2.reponse.arrayBuffer()))); } catch { lu = { ok: false, message: 'Copie illisible.' }; }
      if (!lu.ok) { p.textContent = lu.message; ok.disabled = false; return; }
      await restaurer(garderPhotos(lu.donnees, [...etat.avions.values()]).donnees);
      fermerOutil();
      toast('Carnet restauré depuis le NAS');
    });
  }
}
