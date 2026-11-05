// Glisser une ligne vers la gauche pour faire apparaître un bouton (ex. « Supprimer »).
// - glissé horizontal vers la gauche au-delà de la moitié du bouton : la ligne reste ouverte ;
//   moins loin, ou vers la droite : elle revient en place ; une seule ligne ouverte à la fois ;
// - un glissé ne déclenche jamais le « toucher » de la ligne ; le défilement vertical reste normal
//   (touch-action: pan-y : le navigateur garde les mouvements verticaux) ;
// - toucher une ligne ouverte la referme (sans la choisir).
// Structure attendue : <div class="swrow"><button class="swdel">…</button><button class="swfront">…</button></div>

const LARGEUR = 96;   // largeur du bouton qui apparaît
const SEUIL = 10;     // px avant de décider horizontal / vertical

export function activerGlisser(conteneur) {
  let g = null;              // geste en cours
  let vientDeGlisser = false; // un glissé vient de finir : on ignore le clic qu'il pourrait produire
  let minuterie = null;

  const fermerTout = (sauf = null) => {
    for (const r of conteneur.querySelectorAll('.swrow.ouvert')) if (r !== sauf) r.classList.remove('ouvert');
  };

  conteneur.addEventListener('pointerdown', e => {
    const front = e.target.closest('.swfront');
    if (!front || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = front.closest('.swrow');
    vientDeGlisser = false;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, row, front, base: row.classList.contains('ouvert') ? -LARGEUR : 0, horizontal: false, dx: 0 };
  });

  conteneur.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dy) > SEUIL && Math.abs(dy) >= Math.abs(dx)) { g = null; return; } // défilement vertical
      if (Math.abs(dx) <= SEUIL || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.horizontal = true;
      fermerTout(g.row);
      g.row.classList.add('glisse');
      try { g.front.setPointerCapture(e.pointerId); } catch { /* rien */ }
    }
    g.dx = dx;
    // la ligne se décale vers la gauche (elle se rétrécit : son texte reste lisible)
    const x = Math.max(-LARGEUR - 40, Math.min(0, g.base + dx));
    g.front.style.setProperty('--d', `${-x}px`);
    e.preventDefault();
  });

  const fin = e => {
    if (!g || e.pointerId !== g.id) return;
    if (g.horizontal) {
      const ouvert = g.base + g.dx < -LARGEUR / 2;
      g.row.classList.remove('glisse');
      g.front.style.removeProperty('--d');
      g.row.classList.toggle('ouvert', ouvert);
      vientDeGlisser = true;
      clearTimeout(minuterie);
      minuterie = setTimeout(() => { vientDeGlisser = false; }, 600);
    }
    g = null;
  };
  conteneur.addEventListener('pointerup', fin);
  conteneur.addEventListener('pointercancel', e => {
    if (g && g.horizontal) fin(e);
    else g = null;
  });

  // Phase de capture : passe avant les gestionnaires « choisir la suggestion »
  conteneur.addEventListener('click', e => {
    const front = e.target.closest('.swfront');
    if (!front) return;
    const row = front.closest('.swrow');
    if (vientDeGlisser || row.classList.contains('ouvert')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!vientDeGlisser) row.classList.remove('ouvert'); // toucher une ligne ouverte la referme
      vientDeGlisser = false;
      return;
    }
    fermerTout();
  }, true);

  return { fermerTout };
}
