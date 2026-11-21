/* Source2Pay – bootstrap */
(function () {
  function start() { try { PH.App.boot(); } catch (e) { console.error(e); document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif"><h2>Source2Pay could not start</h2><p>' + String(e.message) + '</p><p>Try clearing site data for this page and reloading.</p></div>'; } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
