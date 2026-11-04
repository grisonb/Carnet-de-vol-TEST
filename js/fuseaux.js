// Heure locale (LOC) d'un terrain <-> UTC. Le stockage est toujours en UTC ;
// LOC = fuseau horaire du terrain (ex. FMEP / FMEE = Indian/Reunion).

import { minutesDuJour, ajouterJours } from './temps.js';

const formats = new Map();
function format(tz) {
  if (!formats.has(tz)) {
    formats.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }));
  }
  return formats.get(tz);
}

// Écart (minutes) entre l'heure locale du fuseau et UTC à un instant donné
export function decalage(ms, tz) {
  if (!tz || tz === 'UTC') return 0;
  const p = Object.fromEntries(format(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - Math.floor(ms / 60000) * 60000) / 60000);
}

// UTC (date + "HH:MM") -> { date, heure } en local
export function versLocal(date, heureUTC, tz) {
  const [y, m, j] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, j) + minutesDuJour(heureUTC) * 60000;
  const loc = new Date(ms + decalage(ms, tz) * 60000);
  return {
    date: loc.toISOString().slice(0, 10),
    heure: loc.toISOString().slice(11, 16),
  };
}

// Local (date + "HH:MM") -> { date, heure } en UTC (on cherche le décalage valable à cet instant)
export function versUTC(dateLoc, heureLoc, tz) {
  const [y, m, j] = dateLoc.split('-').map(Number);
  const naif = Date.UTC(y, m - 1, j) + minutesDuJour(heureLoc) * 60000;
  let ms = naif - decalage(naif, tz) * 60000;
  ms = naif - decalage(ms, tz) * 60000; // seconde passe : changement d'heure
  const d = new Date(ms);
  return { date: d.toISOString().slice(0, 10), heure: d.toISOString().slice(11, 16) };
}

// Heures d'un vol en UTC (date de départ UTC + heures) -> affichage local
// Renvoie { dep, arr, jPlus } ; jPlus = nombre de jours entre date locale d'arrivée et de départ
export function heuresLocales(date, hDep, hArr, tzDep, tzArr) {
  const d = versLocal(date, hDep, tzDep);
  const dateArrUTC = minutesDuJour(hArr) < minutesDuJour(hDep) ? ajouterJours(date, 1) : date;
  const a = versLocal(dateArrUTC, hArr, tzArr);
  const jPlus = Math.round((Date.parse(a.date) - Date.parse(d.date)) / 864e5);
  return { dep: d.heure, arr: a.heure, jPlus, dateLocDep: d.date };
}
