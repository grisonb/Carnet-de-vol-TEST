// Supprimer un vol (carnet officiel) : toujours après confirmation, puis « Vol supprimé — Annuler » 4 s.
// Même fonction pour le glissé sur une carte du Carnet et pour le bouton « Supprimer ce vol » de la saisie.

import { $, esc, toastAction } from './commun.js';
import { supprimerVol, restaurerVol } from '../etat.js';
import { hm } from '../temps.js';

let volDemande = null;
let resume = () => '';

export async function supprimerVolAvecAnnuler(vol) {
  const copie = structuredClone(vol); // pour le remettre exactement à l'identique
  await supprimerVol(vol.id);
  toastAction('Vol supprimé', 'Annuler', () => restaurerVol(copie), 4000);
}

// Fenêtre « Supprimer ce vol ? » avec la date, le trajet et la durée
export function demanderSuppression(vol, date) {
  volDemande = vol;
  const trajet = [vol.dep, ...(vol.escales || []).map(e => e.code), vol.arr].filter(Boolean).join(' → ');
  $('#fd-txt').innerHTML = `<b>${esc(date)}</b> · ${esc(trajet)} · <b>${esc(hm(vol.tempsTotal || vol.simTemps || 0))}</b>${resume(vol) ? `<br><span class="hint">${esc(resume(vol))}</span>` : ''}`;
  $('#fd-modal').hidden = false;
  $('#fd-no').focus();
}

export function initSuppression({ details } = {}) {
  if (details) resume = details;
  $('#fd-no').addEventListener('click', () => { $('#fd-modal').hidden = true; volDemande = null; });
  $('#fd-yes').addEventListener('click', async () => {
    const v = volDemande;
    $('#fd-modal').hidden = true; volDemande = null;
    if (v) await supprimerVolAvecAnnuler(v);
  });
}
