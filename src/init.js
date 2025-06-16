const Console = console;
console.log('RIDE: init.js file loaded');

{
  console.log('RIDE: init.js block executing');
  const init = () => {
    console.log('RIDE: init() called');
    I.apl_font.hidden = true;

    if (D.el) {
      document.onmousewheel = (e) => {
        const d = e.wheelDelta;
        if (d && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) D.commands[d > 0 ? 'ZMI' : 'ZMO']();
      };
      document.body.className += ` zoom${D.prf.zoom()}`;
    }

    D.createContextMenu = (el, win) => {
      if (!D.el) return;
      el.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        let cmitems;
        if (e.target.classList.contains('breakpointarea')) {
          if (!win.lineClicked) return;
          const l = win.lineClicked - 1;
          cmitems = [
            {
              label: 'Trace',
              click: () => { win.toggleTrace(l); },
              type: 'checkbox',
              checked: win.trace.has(l),
            },
            {
              label: 'Stop',
              click: () => { win.toggleStop(l); },
              type: 'checkbox',
              checked: win.stop.has(l),
            },
            {
              label: 'Monitor',
              click: () => { win.toggleMonitor(l); },
              type: 'checkbox',
              checked: win.monitor.has(l),
            },
          ];
          delete win.lineClicked;
        } else {
          const hasSelection = win
            ? !win.me.getSelection().isEmpty()
            : el.getSelection().type === 'Range';
          const isReadOnly = !!win && win.isReadOnly;
          const tc = !!win && !!win.tc;
          cmitems = [
            { label: 'Cut', role: 'cut', enabled: hasSelection && !isReadOnly },
            { label: 'Copy', role: 'copy', enabled: hasSelection },
            { label: 'Paste', role: 'paste', enabled: !isReadOnly },
            { type: 'separator' },
            {
              label: 'Redo',
              ...win && { click: () => { D.commands.RDO(win.me); } },
              ...!win && { role: 'redo' },
              enabled: !tc,
            },
            {
              label: 'Undo',
              ...win && { click: () => { D.commands.UND(win.me); } },
              ...!win && { role: 'undo' },
              enabled: !tc,
            },
          ];
          if (win && !win.session.get()) {
            const { me } = win;
            if (tc) {
              cmitems.unshift(...[
                {
                  label: 'Skip to line',
                  click: () => { win.STL(me); },
                  visible: tc,
                },
                { type: 'separator' },
              ]);
            }
          }
        }
        const cmenu = D.el.Menu.buildFromTemplate(cmitems);
        cmenu.popup();
      };
    };
    D.createContextMenu(window);

    D.open = D.open || ((url, o) => {
      const {
        height, width, x, y,
      } = o;
      let spec = 'resizable=1';

      if (width != null && height != null) spec += `,width=${width},height=${height}`;
      if (x != null && y != null) spec += `,left=${x},top=${y},screenX=${x},screenY=${y}`;
      return !!window.open(url, '_blank', spec);
    });

    D.openExternal = D.el ? D.el.shell.openExternal : (x) => { window.open(x, '_blank'); };
    if (D.el) {
      window.electronOpen = window.open;
      window.open = (url) => {
        !!url && D.openExternal(url);
        return { location: { set href(u) { D.openExternal(u); } } };
      };
    }

    const loc = window.location;
    if (D.el) {
      const qp = nodeRequire('querystring').parse(loc.search.slice(1));
      if (qp.type === 'prf') {
        document.body.className += ' floating-window';
        console.log('RIDE: Preference window loaded');
        I.splash.hidden = 1;
      } else if (qp.type === 'editor') {
        // Floating mode disabled, close this window
        window.close();
      } else if (qp.newSession) {
        // New session window - skip auxiliary windows and auto-start
        console.log('RIDE: New session window detected, skipping auxiliary windows');
        D.windowType = 'newSession'; // Track that this is a new session window
        
        // Set up IPC handlers for new session window
        const { ipcRenderer } = nodeRequire('electron');
        
        // Handle request to check state and update menu
        ipcRenderer.on('check-state-and-update-menu', () => {
          console.log('RIDE: Checking state and updating menu for focused window');
          
          // Check current state of this window
          const showingConnectionDialog = I.cn && !I.cn.hidden;
          const hasConnectedSession = D.ide && D.ide.connected;
          
          console.log('RIDE: Window state - Connection dialog visible:', showingConnectionDialog);
          console.log('RIDE: Window state - Has connected session:', hasConnectedSession);
          
          // Update menu based on THIS window's current state
          if (showingConnectionDialog) {
            console.log('RIDE: This window is showing connection dialog - using connection menu');
            if (D.setUpMenu) {
              D.setUpMenu();
            }
          } else if (hasConnectedSession) {
            console.log('RIDE: This window has connected session - using session menu');
            if (D.ide && D.ide.updMenu) {
              D.ide.updMenu();
            }
          } else {
            console.log('RIDE: This window has no connection - using connection menu');
            if (D.setUpMenu) {
              D.setUpMenu();
            }
          }
        });
        
        setTimeout(() => {
          I.splash.hidden = 1;
          nodeRequire(`${__dirname}/src/cn`)({ isNewSession: true });
        }, 100);
      } else {
        // Main window startup
        console.log('RIDE: Creating auxiliary windows');
        
        // Create preference window
        let bw = new D.el.BrowserWindow({
          show: false,
          parent: D.elw,
          alwaysOnTop: false,
          fullscreen: false,
          fullscreenable: false,
          minWidth: 790,
          minHeight: 600,
          webPreferences: {
            contextIsolation: false,
            enableRemoteModule: true,
            nodeIntegration: true,
            enableDeprecatedPaste: true,
          },
        });
        D.elm.enable(bw.webContents);
        bw.loadURL(`${loc}?type=prf`);
        D.prf_bw = { id: bw.id };
        
        // Create dialog window
        bw = new D.el.BrowserWindow({
          show: false,
          parent: D.elw,
          alwaysOnTop: false,
          fullscreen: false,
          fullscreenable: false,
          modal: true,
          width: 400,
          height: 350,
          resizable: false,
          minimizable: false,
          maximizable: false,
          webPreferences: {
            contextIsolation: false,
            enableRemoteModule: true,
            nodeIntegration: true,
            enableDeprecatedPaste: true,
          },
        });
        D.elm.enable(bw.webContents);
        bw.loadURL(`file://${__dirname}/dialog.html`);
        D.dlg_bw = { id: bw.id };
        
        // Create status window
        bw = new D.el.BrowserWindow({
          show: false,
          parent: D.elw,
          alwaysOnTop: false,
          fullscreen: false,
          fullscreenable: false,
          modal: false,
          width: 600,
          height: 400,
          resizable: true,
          minimizable: true,
          maximizable: true,
          webPreferences: {
            contextIsolation: false,
            enableRemoteModule: true,
            nodeIntegration: true,
          },
        });
        D.elm.enable(bw.webContents);
        bw.loadURL(`file://${__dirname}/status.html`);
        D.stw_bw = { id: bw.id };
        
        // Only focus the main window if this is not a new session window
        if (!qp.newSession) {
          D.elw.focus();
        }
        
        // Handle init-session message from main process
        const { ipcRenderer } = nodeRequire('electron');
        ipcRenderer.on('init-session', (event, data) => {
          console.log('RIDE: Received init-session:', data);
          D.sessionId = data.sessionId;
          D.isNewSession = data.isNewSession;
          
          // Hide splash and show connection dialog
          I.splash.hidden = 1;
          nodeRequire(`${__dirname}/src/cn`)();
        });
        
        // Handle init-new-session for newly created windows
        ipcRenderer.on('init-new-session', (event, data) => {
          console.log('RIDE: Received init-new-session:', data);
          D.sessionId = data.sessionId;
          D.isNewSession = true;
          
          // For new session windows, skip auto-start
          setTimeout(() => {
            I.splash.hidden = 1;
            nodeRequire(`${__dirname}/src/cn`)({ isNewSession: true });
          }, 100);
        });
        
        // Handle request to check state and update menu (for main window)
        if (D.el) {
          ipcRenderer.on('check-state-and-update-menu', () => {
            console.log('RIDE: Checking state and updating menu for focused window');
            
            // Check current state of this window
            const showingConnectionDialog = I.cn && !I.cn.hidden;
            const hasConnectedSession = D.ide && D.ide.connected;
            
            console.log('RIDE: Window state - Connection dialog visible:', showingConnectionDialog);
            console.log('RIDE: Window state - Has connected session:', hasConnectedSession);
            
            // Update menu based on THIS window's current state
            if (showingConnectionDialog) {
              console.log('RIDE: This window is showing connection dialog - using connection menu');
              if (D.setUpMenu) {
                D.setUpMenu();
              }
            } else if (hasConnectedSession) {
              console.log('RIDE: This window has connected session - using session menu');
              if (D.ide && D.ide.updMenu) {
                D.ide.updMenu();
              }
            } else {
              console.log('RIDE: This window has no connection - using connection menu');
              if (D.setUpMenu) {
                D.setUpMenu();
              }
            }
          });
        }
        
        // Normal initialization - all windows start the same way
        console.log('RIDE: Window initialization');
        
        // Give windows a moment to initialize
        setTimeout(() => {
          console.log('RIDE: Hiding splash screen');
          I.splash.hidden = 1;
          console.log('RIDE: Loading connection dialog');
          try {
            nodeRequire(`${__dirname}/src/cn`)();
          } catch (e) {
            console.error('RIDE: Failed to load connection dialog:', e);
            alert('Failed to load connection dialog: ' + e.message);
          }
        }, 100);
      }
    } else {
      const ws = new WebSocket((loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host);
      const q = [];
      // q:send queue
      const flush = () => { while (ws.readyState === 1 && q.length) ws.send(q.shift()); };
      D.send = (x, y) => { q.push(JSON.stringify([x, y])); flush(); };
      ws.onopen = () => {
        ws.send('SupportedProtocols=2');
        ws.send('UsingProtocol=2');
        ws.send('["Identify",{"apiVersion":1,"identity":1}]');
        ws.send('["Connect",{"remoteId":2}]');
        ws.send('["GetWindowLayout",{}]');
      };
      ws.onmessage = (x) => { if (x.data[0] === '[') { const [c, h] = JSON.parse(x.data); D.recv(c, h); } };
      ws.onerror = (x) => { Console.info('ws error:', x); };
      D.ide2 = new D.IDE();
      I.splash.hidden = 1;
    }
    if (!D.quit) D.quit = window.close;
    window.onbeforeunload = (e) => {
      if (D.ide && D.ide.connected && !D.ide.closing) {
        e.returnValue = false;
        setTimeout(() => {
          let q = true;
          if (D.prf.sqp() && !(D.el && process.env.NODE_ENV === 'test')) {
            const msg = D.spawned ? 'Quit Dyalog APL.' : 'Disconnect from interpreter.';
            $.confirm(`${msg} Are you sure?`, document.title, (x) => { q = x; });
          }
          if (q) {
            D.ide.closing = true;
            D.ide.w3500 && D.ide.w3500.close();
            if (D.spawned) {
              D.send('Exit', { code: 0 });
              // Wait for the disconnect message
            } else {
              D.send('Disconnect', { message: 'User shutdown request' });
              D.ide.connected = 0;
              window.close();
            }
          }
        }, 10);
        return;
      }
      try {
        D.ide && D.prf.connectOnQuit() && D.commands.CNC();
        if (D.ide && !D.ide.connected && D.el) D.wins[0].histWrite();
      } finally {
        window.onbeforeunload = null;
      }
    };

    let platform = '';
    if (D.mac) platform = ' platform-mac';
    else if (D.win) platform = ' platform-windows';

    if (D.el) document.body.className += platform;

    window.focused = true;
    window.onblur = (x) => { window.focused = x.type === 'focus'; };
    window.onfocus = window.onblur;
    // Implement access keys (Alt-X) using <u></u>.
    // HTML's accesskey=X doesn't handle duplicates well -
    // - it doesn't always favour a visible input over a hidden one.
    // Also, browsers like Firefox and Opera use different shortcuts -
    // - (such as Alt-Shift-X or Ctrl-X) for accesskey-s.
    if (!D.mac) {
      $(document).on('keydown', (e) => { // Alt-A...Alt-Z or Alt-Shift-A...Alt-Shift-Z
        if (!e.altKey || e.ctrlKey || e.metaKey || e.which < 65 || e.which > 90) return undefined;
        const c = String.fromCharCode(e.which).toLowerCase();
        const C = c.toUpperCase();
        const $ctx = $('.ui-widget-overlay').length
          ? $('.ui-dialog:visible').last()
          : $('body'); // modal dialogs take priority

        const $a = $('u:visible', $ctx).map((i, n) => {
          const h = n.innerHTML;
          if (h !== c && h !== C) return undefined;
          let $i = $(n).closest(':input,label,a').eq(0);
          if ($i.is('label')) $i = $(`#${$i.attr('for')}`).add($i.find(':input')).not(':disabled').eq(0);
          return $i[0];
        });
        if ($a.length > 1) {
          $a.eq(($a.index(':focus') + 1) % $a.length).focus();
        } else if ($a.is(':checkbox')) {
          $a.focus().prop('checked', !$a.prop('checked')).change();
        } else if ($a.is(':text,:password,textarea,select')) {
          $a.focus();
        } else { $a.click(); }
        return !$a.length;
      });
    }
    if (D.el) {
      // drag and drop
      window.ondrop = (e) => { e.preventDefault(); return !1; };
      window.ondragover = window.ondrop;
      window.ondrop = (e) => {
        const { files } = e.dataTransfer;
        const { path } = (files[0] || {});
        if (!D.ide || !path) {
          // no session or no file dragged
        } else if (!/\.dws$/i.test(path)) {
          toastr.error('Ride supports drag and drop only for .dws files.');
        } else if (files.length !== 1) {
          toastr.error('Ride does not support dropping of multiple files.');
        } else {
          if (!D.isLocalInterpreter) {
            toastr.warning(
              'Drag and drop of workspaces works only for locally started interpreters.',
              'Load may fail',
            );
          }
          $.confirm(
            `Are you sure you want to )load ${path.replace(/^.*[\\/]/, '')}?`,
            'Load workspace',
            (x) => { if (x) D.ide.exec([`      )load ${path}\n`], 0); },
          );
        }
        e.preventDefault();
        return !1;
      };

      // extra css and js
      const path = nodeRequire('path');
      const { env } = process;
      if (env.RIDE_JS) {
        env.RIDE_JS
          .split(path.delimiter)
          .forEach((x) => { if (x) $.getScript(`file://${path.resolve(process.cwd(), x)}`); });
      }
      if (env.RIDE_CSS) {
        $('<style>')
          .text(env.RIDE_CSS.split(path.delimiter).map(x => `@import url("${x}");`))
          .appendTo('head');
      }
    }
  };

  // Wait for Monaco editor to load before initializing
  D.mop.then(() => {
    console.log('RIDE: Monaco loaded, calling init()');
    init();
  }).catch(e => {
    console.error('RIDE: Monaco failed to load:', e);
    // For now, still proceed without Monaco to keep the app functional
    console.warn('RIDE: Proceeding without Monaco Editor');
    init();
  });
}
