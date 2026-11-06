// Vols INVENTÉS pour tester le PDF dans les cas difficiles : heures ≥ 10:00, départ 23:59, noms longs, mission longue,
// simulateur, vol de nuit / IFR, plusieurs atterrissages. Aucune donnée réelle.
import { fauxFlyLog } from './faux-flylog.js';
import { analyserFlyLog } from '../../js/flylog.js';

export function volsPDF(n = 20) {
  const lignes = [];
  for (let i = 0; i < n; i++) {
    const j = `${2020 + Math.floor(i / 18)}-0${1 + (i % 9)}-${String(10 + (i % 18)).padStart(2, "0")}`;
    const long = i % 4 === 1;
    const d = i % 3 === 0 ? '10:45' : i % 3 === 1 ? '1:05' : '12:30';
    lignes.push({
      DATE: j, DEPARTURE_AIRPORT: i % 5 === 2 ? 'WMKK' : 'LFMN', ARRIVAL_AIRPORT: i % 5 === 3 ? 'FMEE' : 'LFMD',
      AIRCRAFT_TYPE: i % 2 ? 'DH8D' : 'DR40', AIRCRAFT_REGISTRATION: i % 2 ? 'FXZZB' : 'FXZZA',
      DURATION_BLOCK: d, DURATION_PIC: i % 2 ? '' : d, DURATION_SIC: i % 2 ? d : '', DURATION_NIGHT: i % 4 === 0 ? '10:15' : '',
      DURATION_IFR: i % 3 === 0 ? '10:40' : '', LDGS_DAY: String(1 + (i % 3)), LDGS_NIGHT: i % 4 === 0 ? '12' : '',
      TIME_BLOCK_START: '23:59', TIME_BLOCK_END: '10:44',
      NAME_PIC: i % 2 ? (long ? 'DUPONT-MARTINEZ DE LA ROCHEFOUCAULD' : 'ZZY') : 'SELF', NAME_COPILOT: i % 2 ? 'SELF' : 'ZZX',
      REMARKS: long ? 'ESSAI MISSION LONGUE : LIGNE VOLONTAIREMENT TRÈS LONGUE POUR VOIR LE RETOUR À LA LIGNE ET LA COUPURE PROPRE EN FIN DE CASE' : (i % 4 === 3 ? 'ESSAI' : 'ENT. TEST'),
      FEU: '0', LARGAGES_CDB_DASH: '0', TAGS: '',
    });
  }
  const r = analyserFlyLog(fauxFlyLog(lignes));
  return { vols: [...r.aCreer].sort((a, b) => (a.date < b.date ? -1 : 1)), avions: new Map(r.avions.map(a => [a.id, a])) };
}
