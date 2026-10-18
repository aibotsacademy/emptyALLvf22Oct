/* =========================================================
   AERO — Entry point (ES module, no build step)
   Loaded by every page:  <script type="module" src="[root]/assets/js/app.js">
   Reads <body data-page> and boots the matching module.
   ========================================================= */
import { store } from './data.js';
import { PAGE, href } from './router.js';
import { renderShell, errorState, $ } from './layout.js';
import { initMotion } from './motion.js';
import { initHome, PAGES } from './modules.js';

function boot() {
  store.load();
  if (PAGE === 'home') {
    initHome();
    initMotion();
    return;
  }
  if (PAGE === 'aeroflow') {
    import('./aeroflow.js').then((m) => { m.initAeroflow(); initMotion(); }).catch((err) => {
      console.error(err);
      document.querySelector('#af-grid')?.insertAdjacentHTML('afterbegin', errorState('AeroFlow could not load. Serve the folder over HTTP (see README).'));
    });
    return;
  }
  renderShell();
  const init = PAGES[PAGE];
  try {
    if (!init) throw new Error(`No module registered for page "${PAGE}"`);
    init();
  } catch (err) {
    console.error(err);
    const main = $('#main');
    if (main) main.insertAdjacentHTML('afterbegin', errorState(`Something went wrong loading this module (${String(err.message).replace(/[<>&]/g, '')}). Try <a href="${href('platform/settings.html')}#reset">resetting demo data</a>.`));
  }
  initMotion();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
