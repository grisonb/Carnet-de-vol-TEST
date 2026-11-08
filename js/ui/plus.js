// Écran Plus : exports, sauvegarde, import FlyLog, contrôle import, types, avions, personnes, stockage.

import { $, esc, toast, proposerFichier, lireFichierTexte, ouvrirOutil, fermerOutil, pause } from './commun.js';
import { etat, reglage, enregistrerReglage, enregistrerImport, contenuComplet, restaurer, enregistrerAvions } from '../etat.js';
import { lireFichesAvions, changementsFiches, appliquerFiches } from '../fiches-avions.js';
import { analyserFlyLog } from '../flylog.js';
import { calculerTotaux, filtrerPeriode, bornesPeriode } from '../totaux.js';
import { comparerReference } from '../controle.js';
import { creerSauvegarde, texteSauvegarde, lireSauvegarde, nomFichier, texteTableur, etatSauvegarde } from '../sauvegarde.js';
import { paginer, dessinerPDF, totauxVides, totauxPDF } from '../pdf.js';
import { hm, aujourdhui, dateFr } from '../temps.js';
import { TYPES, MOTEUR, SURFACE, typesAffiches } from '../types-avion.js';
import { nomPersonne } from '../modele.js';
import { VERSION } from '../version.js';
import { ouvrirRegles } from './regles.js';
import { ouvrirFlotte, typesConnus, definirTypes } from './avions.js';
import { ouvrirPersonne, ouvrirLibelles } from './saisie.js';
import { ouvrirChoixBande } from './carnet.js';
import { resumeCartes } from './carte.js';
import { ecranNas, ecranRestaurerNas, resumeCopieNas, configNas, etatNas } from './nas.js';
import { ecranSynchro, resumeSynchroActuel } from './synchro.js';
import { copieNasAJour, depuis } from '../copieur.js';

const nombre = n => n.toLocaleString('fr-FR');
const chrono = vols => [...vols].reverse(); // etat.vols est du plus récent au plus ancien

// ---------- Choix de période (PDF) ----------
function htmlPeriode() {
  const annees = [...new Set(etat.vols.map(v => v.date.slice(0, 4)))].sort().reverse();
  return `<div class="seg" id="xp-per" role="group" aria-label="Période">
      <button type="button" data-p="tout" aria-pressed="true">Tout</button><button type="button" data-p="annee" aria-pressed="false">Année</button><button type="button" data-p="dates" aria-pressed="false">Dates</button></div>
    <div class="row2" id="xp-a" hidden><div class="field"><label for="xp-annee">Année</label><select id="xp-annee">${annees.map(a => `<option>${a}</option>`).join('')}</select></div></div>
    <div class="row2" id="xp-d" hidden><div class="field"><label for="xp-du">Du</label><input id="xp-du" type="date"></div><div class="field"><label for="xp-au">Au</label><input id="xp-au" type="date"></div></div>`;
}
function lirePeriode() {
  const b = document.querySelector('#xp-per [aria-pressed="true"]').dataset.p;
  if (b === 'annee') return { genre: 'annee', annee: $('#xp-annee').value };
  if (b === 'dates') return { genre: 'dates', du: $('#xp-du').value, au: $('#xp-au').value };
  return { genre: 'tout' };
}
function brancherPeriode() {
  $('#xp-per').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#xp-per button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#xp-a').hidden = b.dataset.p !== 'annee'; $('#xp-d').hidden = b.dataset.p !== 'dates';
    if (b.dataset.p === 'dates' && !$('#xp-du').value) { $('#xp-du').value = `${aujourdhui().slice(0, 4)}-01-01`; $('#xp-au').value = aujourdhui(); }
  });
}

// ---------- PDF ----------
function ecranPDF() {
  const c = ouvrirOutil('Carnet officiel (PDF EASA)', `
    <p class="hint" style="font-size:15px">A4 paysage, ${18} vols par page, heures en UTC. Chaque page porte ses totaux, le report des pages précédentes, le total général et une case signature. Les colonnes métier (feux, largages…) n'y figurent pas.</p>
    <div class="sec">${htmlPeriode()}
      <div class="field"><label for="xp-tit">Titulaire (imprimé en haut de chaque page)</label><input id="xp-tit" value="${esc(reglage('titulaire'))}" autocomplete="off"></div></div>
    <button type="button" class="bigbtn" id="xp-go">Créer le PDF</button>
    <p class="prog" id="xp-prog"></p>
    <div id="xp-fin" hidden><button type="button" class="bigbtn" id="xp-dl">Enregistrer dans Téléchargements</button><button type="button" class="bigbtn second" id="xp-sh">Partager (Drive, e-mail…)</button></div>`);
  brancherPeriode();
  let blob = null, nom = '';
  c.querySelector('#xp-go').addEventListener('click', async () => {
    if (!window.jspdf) { toast('Module PDF pas encore chargé, réessaie.'); return; }
    const tit = $('#xp-tit').value.trim();
    if (tit !== reglage('titulaire')) await enregistrerReglage('titulaire', tit);
    const p = lirePeriode(), auj = aujourdhui();
    const tous = chrono(etat.vols);
    const vols = filtrerPeriode(tous, p, auj);
    const { du, au } = bornesPeriode(p, auj);
    const avant = du ? tous.filter(v => v.date < du) : [];
    const report = avant.length ? totauxPDF(avant, etat.avions) : totauxVides();
    $('#xp-go').disabled = true; $('#xp-fin').hidden = true;
    $('#xp-prog').textContent = `Création du PDF (${nombre(vols.length)} vols)…`;
    await pause();
    try {
      const pages = paginer(vols, etat.avions, undefined, report);
      const texteP = p.genre === 'tout' ? '' : `${du ? dateFr(du) : 'début'} - ${au ? dateFr(au) : dateFr(auj)}`;
      const doc = await dessinerPDF(window.jspdf.jsPDF, pages, etat.avions, { titulaire: tit, periode: texteP, pause });
      blob = doc.output('blob');
      nom = nomFichier('carnet-de-vol-EASA', 'pdf');
      $('#xp-prog').textContent = `${pages.length} page${pages.length > 1 ? 's' : ''} prête${pages.length > 1 ? 's' : ''}.`;
      $('#xp-fin').hidden = false;
    } catch (e) { $('#xp-prog').textContent = 'Erreur : ' + e.message; }
    $('#xp-go').disabled = false;
  });
  c.querySelector('#xp-dl').addEventListener('click', () => proposerFichier(blob, nom));
  c.querySelector('#xp-sh').addEventListener('click', () => proposerFichier(blob, nom, { partager: true }));
}

// ---------- CSV ----------
function ecranCSV() {
  const c = ouvrirOutil('Tableur (CSV)', `
    <p class="hint" style="font-size:15px">Un fichier avec toutes les colonnes (mission et compteurs compris), une seule ligne d'en-tête, séparateur « ; ». S'ouvre dans LibreOffice Calc et Excel.</p>
    <button type="button" class="bigbtn" id="cs-dl">Enregistrer dans Téléchargements</button>
    <button type="button" class="bigbtn second" id="cs-sh">Partager (Drive, e-mail…)</button>`);
  const fabriquer = () => new Blob([texteTableur(chrono(etat.vols), etat.avions)], { type: 'text/csv;charset=utf-8' });
  c.querySelector('#cs-dl').addEventListener('click', () => proposerFichier(fabriquer(), nomFichier('carnet-de-vol', 'csv')));
  c.querySelector('#cs-sh').addEventListener('click', () => proposerFichier(fabriquer(), nomFichier('carnet-de-vol', 'csv'), { partager: true }));
}

// ---------- Sauvegarde ----------
async function fichierSauvegarde() {
  const s = creerSauvegarde(await contenuComplet());
  return new Blob([texteSauvegarde(s)], { type: 'application/json' });
}
async function sauvegardeFaite() {
  await enregistrerReglage('derniereSauvegarde', new Date().toISOString());
  majPlus(); verifierRappel();
}
function ecranSauvegarde() {
  const d = reglage('derniereSauvegarde');
  const c = ouvrirOutil('Sauvegarde de secours', `
    <p class="hint" style="font-size:15px">Un seul fichier avec tout : vols, avions (photos comprises), personnes, missions, étiquettes, règles et réglages. (La copie automatique sur le NAS, elle, ne contient pas les photos.) L'app sait le réimporter à l'identique (Plus › Restaurer une sauvegarde).</p>
    <p>Dernière sauvegarde : <b>${d ? dateFr(d.slice(0, 10)) : 'jamais'}</b></p>
    <button type="button" class="bigbtn" id="sv-dl">Enregistrer dans Téléchargements</button>
    <button type="button" class="bigbtn second" id="sv-sh">Partager (Google Drive…)</button>
    <p class="hint" style="margin-top:12px">Conseil : garde une copie hors du téléphone (Drive, ordinateur).</p>`);
  c.querySelector('#sv-dl').addEventListener('click', async () => {
    const r = await proposerFichier(await fichierSauvegarde(), nomFichier('sauvegarde-carnet-de-vol', 'json'));
    if (r !== 'annule') { await sauvegardeFaite(); toast('Sauvegarde enregistrée'); }
  });
  c.querySelector('#sv-sh').addEventListener('click', async () => {
    const r = await proposerFichier(await fichierSauvegarde(), nomFichier('sauvegarde-carnet-de-vol', 'json'), { partager: true });
    if (r !== 'annule') { await sauvegardeFaite(); toast('Sauvegarde partagée'); }
  });
}

async function restaurerFichier() {
  const f = await lireFichierTexte($('#file-restore'));
  $('#file-restore').value = '';
  if (!f) return;
  const r = lireSauvegarde(f.texte);
  if (!r.ok) { toast(r.message, 3000); return; }
  const d = r.donnees;
  const c = ouvrirOutil('Restaurer une sauvegarde', `
    <div class="sec resume"><p>Fichier : <b>${esc(f.nom)}</b></p><p>Créé le ${esc(r.exporteLe ? dateFr(r.exporteLe.slice(0, 10)) : '?')}</p>
      <p>${nombre(d.vols.length)} vols · ${nombre(d.avions.length)} avions · ${nombre(d.personnes.length)} personnes</p></div>
    <p class="koc">Attention : tout le carnet actuel (${nombre(etat.vols.length)} vols) sera remplacé par ce fichier.</p>
    <button type="button" class="bigbtn" id="rs-ok" style="background:var(--feu)">Remplacer mon carnet</button>
    <button type="button" class="bigbtn second annuler" id="rs-no">Annuler</button>`);
  c.querySelector('#rs-no').addEventListener('click', fermerOutil);
  c.querySelector('#rs-ok').addEventListener('click', async () => {
    await restaurer(d);
    fermerOutil(); toast('Carnet restauré');
  });
}

// ---------- Import FlyLog ----------
async function importer() {
  const f = await lireFichierTexte($('#file-flylog'));
  $('#file-flylog').value = '';
  if (!f) return;
  const c = ouvrirOutil('Importer FlyLog', '<p class="prog">Lecture du fichier…</p>');
  await pause();
  const r = analyserFlyLog(f.texte, { vols: etat.vols, avions: [...etat.avions.values()], personnes: etat.personnes, etiquettes: reglage('etiquettes') }, typesConnus());
  if (!r.ok) { c.innerHTML = `<p class="koc">${esc(r.message)}</p>`; return; }
  const t = calculerTotaux(r.aCreer, new Map([...etat.avions, ...r.avions.map(a => [a.id, a])]));
  c.innerHTML = `
    <div class="sec resume"><h3>Résumé avant d'enregistrer</h3>
      <p>Fichier : <b>${esc(f.nom)}</b> · ${nombre(r.lues)} lignes</p>
      <p><b>${nombre(r.aCreer.length)}</b> vols à ajouter (dont ${nombre(t.sessionsSim)} simulateur)</p>
      <p><b>${nombre(r.doublons.length)}</b> doublons refusés (déjà dans le carnet)</p>
      <p>${nombre(r.avions.length)} avions · ${nombre(r.personnes.length)} personnes · étiquettes : ${esc(r.etiquettes.join(', ') || 'aucune nouvelle')}</p>
      ${r.typesInconnus.length ? `<p class="koc">Types inconnus (à compléter dans la fiche avion) : ${esc(r.typesInconnus.join(', '))}</p>` : ''}
      ${r.erreurs.length ? `<p class="koc">${r.erreurs.length} ligne(s) illisible(s), non importée(s) :</p><div class="err-list">${r.erreurs.map(esc).join('<br>')}</div>` : ''}
      <div class="tline"><span>Temps bloc</span><b>${hm(t.tempsTotal)}</b></div>
      <div class="tline"><span>Atterrissages</span><b>${nombre(t.atterrissages)}</b></div></div>
    <button type="button" class="bigbtn" id="im-ok" ${r.aCreer.length ? '' : 'disabled'}>Enregistrer ${nombre(r.aCreer.length)} vols</button>
    <button type="button" class="bigbtn second annuler" id="im-no">Annuler</button>`;
  c.querySelector('#im-no').addEventListener('click', fermerOutil);
  c.querySelector('#im-ok').addEventListener('click', async () => {
    c.querySelector('#im-ok').disabled = true;
    await enregistrerImport(r);
    toast(`${nombre(r.aCreer.length)} vols importés`);
    ecranControle();
  });
}

// ---------- Contrôle import ----------
function ecranControle() {
  const vols = etat.vols.filter(v => v.source === 'flylog');
  const t = calculerTotaux(vols, etat.avions);
  const ref = reglage('reference');
  const lignes = comparerReference(t, ref || {});
  const c = ouvrirOutil('Contrôle import', `
    <p class="hint" style="font-size:15px">Totaux des ${nombre(vols.length)} vols venus de FlyLog, à comparer avec ceux de FlyLog. Tu peux charger un fichier de valeurs de référence (JSON) pour une vérification automatique.</p>
    <table class="ctab"><thead><tr><th>Rubrique</th><th>App</th>${ref ? '<th>FlyLog</th><th></th>' : ''}</tr></thead><tbody>
    ${lignes.map(l => `<tr><td>${esc(l.titre)}</td><td class="num">${esc(l.obtenu)}</td>${ref ? `<td class="num">${esc(l.attendu ?? '')}</td><td>${l.ok === null ? '' : l.ok ? '<span class="okc">✓</span>' : '<span class="koc">✗</span>'}</td>` : ''}</tr>`).join('')}
    </tbody></table>
    <button type="button" class="bigbtn second" id="ct-ref">Charger des valeurs de référence</button>`);
  c.querySelector('#ct-ref').addEventListener('click', () => $('#file-ref').click());
}
async function chargerReference() {
  const f = await lireFichierTexte($('#file-ref'));
  $('#file-ref').value = '';
  if (!f) return;
  try {
    const d = JSON.parse(f.texte);
    if (!d.valeurs) throw new Error();
    await enregistrerReglage('reference', d.valeurs);
    ecranControle();
  } catch { toast('Fichier de référence illisible', 2500); }
}

// ---------- Types d'avion ----------
function ecranTypes() {
  const perso = reglage('typesPerso') || [];
  const { liste, sim } = typesAffiches([...etat.avions.values()], perso, typesConnus());
  const ligne = t => t.inconnu
    ? `<button type="button" class="typerow" data-ty="${esc(t.code)}"><b>${esc(t.code)}</b><span>Type inconnu de l'app : touche pour le compléter</span></button>`
    : `<button type="button" class="typerow" data-ty="${esc(t.code)}"><b>${esc(t.code)}</b><span>${esc(t.constructeur)} • ${esc(t.modele)}<br>${t.equipage === 'MP' ? 'Multipilote' : 'Monopilote ' + t.moteurs} · ${MOTEUR[t.moteur]} · ${SURFACE[t.surface]}${t.train === 'classique' ? ' · Train classique' : ''}${perso.some(p => p.code === t.code) ? ' · <i>modifié</i>' : ''}</span></button>`;
  const c = ouvrirOutil("Types d'avion", `
    <p class="hint" style="font-size:15px">Les types de tes avions (et ceux que tu as ajoutés). Ils remplissent la fiche d'un avion quand tu tapes son type OACI ; les heures du carnet suivent la fiche de chaque avion (Plus › Mes avions). Touche un type pour le corriger.</p>
    <p class="hint" id="ty-n">${liste.length + (sim ? 1 : 0)} types</p>
    <div class="flist" id="ty-l">${liste.map(ligne).join('')}${sim ? '<div class="typerow" data-sim="1"><b>SIM</b><span>Simulateurs (FFS, FTD, FNPT II) : réglés dans la fiche de chaque simulateur</span></div>' : ''}</div>
    <button type="button" class="bigbtn" id="ty-add">+ Ajouter un type</button>`);
  c.querySelector('#ty-l').addEventListener('click', e => { const b = e.target.closest('[data-ty]'); if (b) editerType(liste.find(t => t.code === b.dataset.ty)); });
  c.querySelector('#ty-add').addEventListener('click', () => editerType(null));
}
function editerType(t) {
  const v = t || { code: '', constructeur: '', modele: '', equipage: 'SP', moteurs: 'SE', moteur: 'P', surface: 'L', train: 'tricycle' };
  const opt = (nom, valeurs, cur) => `<select id="te-${nom}">${valeurs.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const c = ouvrirOutil(t ? `Type ${t.code}` : 'Nouveau type', `<div class="sec">
    <div class="field"><label for="te-code">Code OACI</label><input class="big" id="te-code" maxlength="4" value="${esc(v.code)}" ${t ? 'readonly' : ''} autocapitalize="characters"></div>
    <div class="field"><label for="te-cons">Constructeur</label><input id="te-cons" value="${esc(v.constructeur)}"></div>
    <div class="field"><label for="te-mod">Modèle</label><input id="te-mod" value="${esc(v.modele)}"></div>
    <div class="field"><label>Équipage</label>${opt('eq', [['SP', 'Monopilote'], ['MP', 'Multipilote']], v.equipage)}</div>
    <div class="field"><label>Moteurs</label>${opt('mo', [['SE', 'Monomoteur (SE)'], ['ME', 'Multimoteur (ME)']], v.moteurs)}</div>
    <div class="field"><label>Motorisation</label>${opt('mt', Object.entries(MOTEUR), v.moteur)}</div>
    <div class="field"><label>Surface</label>${opt('su', Object.entries(SURFACE), v.surface)}</div>
    <div class="field"><label>Train</label>${opt('tr', [['tricycle', 'Tricycle'], ['classique', 'Classique']], v.train)}</div></div>
    <p class="hint">Modifier un type ne change pas les avions déjà créés : corrige aussi leur fiche si besoin.</p>
    <button type="button" class="bigbtn" id="te-ok">Enregistrer</button><button type="button" class="bigbtn second" id="te-no">Retour</button>`);
  c.querySelector('#te-no').addEventListener('click', ecranTypes);
  c.querySelector('#te-ok').addEventListener('click', async () => {
    const code = $('#te-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(code)) { toast('Code OACI : 2 à 4 lettres ou chiffres'); return; }
    const n = { code, constructeur: $('#te-cons').value.trim().toUpperCase(), modele: $('#te-mod').value.trim(),
      equipage: $('#te-eq').value, moteurs: $('#te-eq').value === 'MP' ? 'ME' : $('#te-mo').value,
      moteur: $('#te-mt').value, surface: $('#te-su').value, train: $('#te-tr').value };
    const perso = (reglage('typesPerso') || []).filter(p => p.code !== code);
    await enregistrerReglage('typesPerso', [...perso, n]);
    appliquerTypesPerso();
    ecranTypes();
  });
}
export function appliquerTypesPerso() {
  const perso = reglage('typesPerso') || [];
  const m = new Map(TYPES.map(t => [t.code, t]));
  for (const p of perso) m.set(p.code, p);
  definirTypes([...m.values()]);
}

// ---------- Personnes ----------
let rendrePersonnesOuvertes = null;
document.addEventListener('personnes-modifiees', () => { if (rendrePersonnesOuvertes && $('#pe-l')) rendrePersonnesOuvertes(); });
function ecranPersonnes() {
  const c = ouvrirOutil('Personnes', `
    <input class="search" id="pe-q" type="search" placeholder="Rechercher : trigramme, prénom, nom" autocomplete="off" style="margin:0 0 8px">
    <p class="hint" id="pe-n"></p><div class="flist" id="pe-l"></div>
    <button type="button" class="bigbtn" id="pe-add">+ Ajouter une personne</button>`);
  const rendre = () => {
    const q = $('#pe-q').value.trim().toUpperCase();
    const L = etat.personnes.filter(p => !q || `${p.tri} ${p.prenom} ${p.nom}`.toUpperCase().includes(q))
      .sort((a, b) => nomPersonne(a).localeCompare(nomPersonne(b)));
    $('#pe-n').textContent = `${nombre(L.length)} personne${L.length > 1 ? 's' : ''}`;
    $('#pe-l').innerHTML = L.slice(0, 200).map(p => `<button type="button" class="pitem" data-pe="${esc(p.id)}"><b>${esc(nomPersonne(p))}</b><span>${esc(p.tri ? [p.prenom, p.nom].filter(Boolean).join(' ') : '')}</span></button>`).join('')
      + (L.length > 200 ? '<p class="hint">Affine la recherche pour voir les autres.</p>' : '');
  };
  rendre();
  c.querySelector('#pe-q').addEventListener('input', rendre);
  c.querySelector('#pe-l').addEventListener('click', e => { const b = e.target.closest('[data-pe]'); if (b) ouvrirPersonne(etat.personnes.find(p => p.id === b.dataset.pe)); });
  c.querySelector('#pe-add').addEventListener('click', () => ouvrirPersonne(null, 'Ajouter une personne'));
  rendrePersonnesOuvertes = rendre;
}

// ---------- Titulaire ----------
function ecranTitulaire() {
  const c = ouvrirOutil('Titulaire du carnet', `<div class="sec"><div class="field"><label for="ti-v">Nom imprimé en haut de chaque page du PDF</label><input id="ti-v" value="${esc(reglage('titulaire'))}" autocomplete="off"></div></div>
    <button type="button" class="bigbtn" id="ti-ok">Enregistrer</button>`);
  c.querySelector('#ti-ok').addEventListener('click', async () => { await enregistrerReglage('titulaire', $('#ti-v').value.trim()); fermerOutil(); majPlus(); toast('Enregistré'); });
}

// ---------- Stockage, encart sauvegarde ----------
export async function demanderStockagePersistant() {
  if (!navigator.storage) return null;
  let ok = await navigator.storage.persisted?.();
  if (!ok && navigator.storage.persist) ok = await navigator.storage.persist();
  return ok;
}

function texteStockage(persistant) {
  return persistant === null ? 'Stockage persistant : non disponible sur ce navigateur.'
    : persistant ? '<span class="okc">✓</span> Stockage persistant accordé : le téléphone ne videra pas le carnet pour faire de la place.'
      : '<span class="koc">✗</span> Stockage persistant non accordé. Installe l\'app sur l\'écran d\'accueil puis rouvre-la ; en attendant, fais des sauvegardes.';
}
const persiste = async () => (navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : null);
async function ecranStockage() {
  const c = ouvrirOutil('Stockage', `<div class="sec"><p id="st-txt">${texteStockage(await persiste())}</p><p class="hint" id="st-quota"></p></div>`);
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    const q = c.querySelector('#st-quota');
    if (q) q.textContent = `Utilisé : ${(e.usage / 1e6).toFixed(1)} Mo sur ${(e.quota / 1e9).toFixed(1)} Go disponibles.`;
  }
}

export async function majPlus() {
  $('#pl-version').textContent = 'v' + VERSION;
  const d = reglage('derniereSauvegarde');
  $('#pl-save-s').textContent = `Dernière : ${d ? dateFr(d.slice(0, 10)) : 'jamais'} · Téléchargements ou Google Drive`;
  $('#pl-tit-s').textContent = reglage('titulaire') || 'Nom imprimé sur le PDF';
  verifierRappel();
  $('#pl-nas-s').textContent = resumeCopieNas();
  $('#pl-sync-s').textContent = resumeSynchroActuel();
  resumeCartes().then(t => { $('#pl-cartes-s').textContent = t; });
  const p = await persiste();
  $('#pl-stock-s').textContent = p === null ? 'Protection non disponible sur ce navigateur'
    : p ? 'Protégé contre l\'effacement automatique' : 'Non protégé : fais des sauvegardes';
}

// Encart « sauvegarde » en haut de Plus : jaune s'il n'y a jamais eu de sauvegarde ou plus de 7 jours, sinon neutre
const ICONE_SAUVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>';
const ICONE_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
export function verifierRappel() {
  // Copie automatique sur le NAS qui marche : encart vert « Copié sur le NAS il y a X min »
  const nas = etatNas();
  const e = copieNasAJour(configNas(), nas)
    ? { ok: true, titre: `Copié sur le NAS ${depuis(nas.derniereCopie)}`, texte: 'Copie automatique à jour.' }
    : etatSauvegarde(reglage('derniereSauvegarde'));
  $('#pl-bk').classList.toggle('ok', e.ok);
  $('#pl-bk-i').innerHTML = e.ok ? ICONE_OK : ICONE_SAUVE;
  $('#pl-bk-t').textContent = e.titre;
  $('#pl-bk-s').textContent = e.texte;
  $('#pl-bk-go').hidden = e.ok;
}

export function initPlus() {
  $('#pl-pdf').addEventListener('click', ecranPDF);
  $('#pl-csv').addEventListener('click', ecranCSV);
  $('#pl-save').addEventListener('click', ecranSauvegarde);
  $('#pl-restore').addEventListener('click', () => $('#file-restore').click());
  $('#file-restore').addEventListener('change', restaurerFichier);
  $('#pl-import').addEventListener('click', () => $('#file-flylog').click());
  $('#file-flylog').addEventListener('change', importer);
  $('#pl-ctrl').addEventListener('click', ecranControle);
  $('#file-ref').addEventListener('change', chargerReference);
  $('#rules-open').addEventListener('click', ouvrirRegles);
  $('#pl-types').addEventListener('click', ecranTypes);
  $('#pl-fiches').addEventListener('click', ecranFichesAvions);
  $('#pl-avions').addEventListener('click', () => ouvrirFlotte(''));
  $('#pl-pers').addEventListener('click', ecranPersonnes);
  $('#pl-tit').addEventListener('click', ecranTitulaire);
  $('#pl-bk-go').addEventListener('click', ecranSauvegarde);
  $('#pl-heures').addEventListener('click', ouvrirChoixBande);
  $('#pl-libelles').addEventListener('click', ouvrirLibelles);
  $('#pl-stockage').addEventListener('click', ecranStockage);
  $('#pl-nas').addEventListener('click', ecranNas);
  $('#pl-nas-rest').addEventListener('click', ecranRestaurerNas);
  $('#pl-sync').addEventListener('click', ecranSynchro);
  document.addEventListener('synchro-etat', () => { $('#pl-sync-s').textContent = resumeSynchroActuel(); });
  // État de la copie NAS changé (copie faite, NAS injoignable…) : sous-titre et encart à jour
  document.addEventListener('nas-etat', () => { $('#pl-nas-s').textContent = resumeCopieNas(); verifierRappel(); });
  $('#ou-x').addEventListener('click', fermerOutil);
}

// ---------- R49 : Importer des fiches avions (Nom, Indicatif radio, Modèle) ----------
// Fichier choisi sur le téléphone (Téléchargements, Drive…) ; aperçu de ce qui change ; rien n'est modifié avant
// « Appliquer ». Ne crée aucun avion, ne touche à aucun vol ni au type OACI.
function ecranFichesAvions() {
  const c = ouvrirOutil('Importer des fiches avions', `
    <p class="hint" style="font-size:15px">Un petit fichier texte (.csv ou .txt), une ligne par avion :<br><b>immatriculation, nom, indicatif radio, modèle</b><br>Seuls le nom, l'indicatif et le modèle des avions déjà dans ta flotte sont remplis (une case vide ne change rien). Aucun avion n'est créé, aucun vol n'est modifié.</p>
    <label class="bigbtn" for="fa-fichier" style="text-align:center">Choisir le fichier</label>
    <input type="file" id="fa-fichier" accept=".csv,.txt,text/csv,text/plain" hidden>
    <div id="fa-apercu"></div>`);
  c.querySelector('#fa-fichier').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const { fiches, erreurs } = lireFichesAvions(await f.text());
    const { modifs, introuvables, identiques } = changementsFiches(fiches, [...etat.avions.values()]);
    const zone = c.querySelector('#fa-apercu');
    zone.innerHTML = `<div class="sec"><h3>Ce qui va changer</h3>
        ${modifs.length ? modifs.map(m => `<div class="fa-avion"><b>${esc(m.avion.immat)}</b>${m.changements.map(x =>
          `<div class="fa-ch">${esc(x.libelle)} : <s>${esc(x.avant || 'vide')}</s> → <b>${esc(x.apres)}</b></div>`).join('')}</div>`).join('')
          : '<p class="hint">Rien à changer.</p>'}
        ${identiques.length ? `<p class="hint">Déjà à jour : ${esc(identiques.join(', '))}</p>` : ''}
        ${introuvables.length ? `<p class="koc">Introuvable${introuvables.length > 1 ? 's' : ''} dans ta flotte (ignoré${introuvables.length > 1 ? 's' : ''}) : ${esc(introuvables.join(', '))}</p>` : ''}
        ${erreurs.map(x => `<p class="koc">${esc(x)}</p>`).join('')}
      </div>
      ${modifs.length ? `<button type="button" class="bigbtn" id="fa-ok">Appliquer à ${modifs.length} avion${modifs.length > 1 ? 's' : ''}</button>` : ''}
      <button type="button" class="bigbtn second annuler" id="fa-no">Annuler</button>`;
    zone.querySelector('#fa-no').addEventListener('click', fermerOutil);
    const ok = zone.querySelector('#fa-ok');
    if (ok) ok.addEventListener('click', async () => {
      ok.disabled = true;
      await enregistrerAvions(appliquerFiches(modifs));
      fermerOutil();
      toast(`${modifs.length} fiche${modifs.length > 1 ? 's' : ''} avion mise${modifs.length > 1 ? 's' : ''} à jour`);
    });
    e.target.value = '';
  });
}
