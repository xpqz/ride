// early set up of environment properties
console.log('RIDE: pre_init.js loading');
var D = typeof D === "undefined" ? {} : D;

D.commands = {};
D.keyMap = { dyalog: {}, dyalogDefault: {} };
D.versionInfo = D.versionInfo || {};

// all elements by id, eg I.lb_tip_text is document.getElementById('lb_tip_text')
const I = {};

// grouped by id prefix using '_' as a separator; J[x][y] is the element with id x+'_'+y
// e.g. J.lb.tip_text is document.getElementById('lb_tip_text')
const J = {};

(function preInit() {
  console.log('RIDE: preInit() function executing');
  toastr.options.timeOut = 5000;
  toastr.options.preventDuplicates = true;
  // build up I by iterating over all elements with IDs
  const a = document.querySelectorAll('[id]');
  for (let i = 0; i < a.length; i += 1) {
    const e = a[i];
    const s = e.id;
    const j = s.indexOf('_');
    I[s] = e;
    if (j >= 0) {
      const u = s.slice(0, j);
      const v = s.slice(j + 1);
      (J[u] = J[u] || {})[v] = e;
    }
  }
  D.mop = new Promise((resolve, reject) => {
    // Ensure amdRequire is available and properly configured
    if (typeof amdRequire === 'undefined') {
      reject(new Error('AMD loader not found. Monaco Editor loader may not be properly initialized.'));
      return;
    }
    
    // Load Monaco Editor
    amdRequire(['vs/editor/editor.main'], () => {
      console.log('Monaco Editor loaded successfully');
      
      // Apply pending Monaco theme if one exists
      if (D.pendingMonacoTheme) {
        console.log('RIDE: Applying pending Monaco theme');
        try {
          // Need to check if setMonacoTheme is available
          if (typeof D.setMonacoTheme === 'function') {
            D.setMonacoTheme(D.pendingMonacoTheme);
          } else {
            console.log('RIDE: setMonacoTheme not yet available, keeping theme pending');
          }
        } catch (e) {
          console.error('RIDE: Error applying pending Monaco theme:', e);
        }
      }
      
      resolve();
    }, (err) => {
      console.error('Failed to load Monaco Editor:', err);
      reject(err);
    });
  });
  D.zoom2fs = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 22, 24, 26, 28, 32, 36, 42, 48];
  if (typeof nodeRequire !== 'undefined') {
    D.el = nodeRequire('@electron/remote');
    D.elm = D.el.require('@electron/remote/main');
    D.elw = D.el.getGlobal('elw');
    // IPC system removed - no longer needed
    D = $.extend(D, nodeRequire('@electron/remote').getGlobal('D'));
    const plt = process.platform;
    D.win = /^win/i.test(plt);
    D.mac = plt === 'darwin';
  } else {
    const plt = navigator.platform;
    D.win = /^win/i.test(plt);
    D.mac = /^mac/i.test(plt);
  }
}());
