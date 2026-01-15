// Electron's entry point (web-based Ride doesn't load it)
const rq = require;
const fs = rq('fs');
const ps = process;
const el = rq('electron');
const elm = rq('@electron/remote/main');
const windowManager = rq('./src/window-manager');
const D = {};
global.D = D;
global.windowManager = windowManager;

elm.initialize();
// Detect platform: https://nodejs.org/api/process.html#process_process_platform
// https://stackoverflow.com/questions/19877924/what-is-the-list-of-possible-values-for-navigator-platform-as-of-today
D.win = /^win/i.test(ps.platform);
D.mac = ps.platform === 'darwin';

if (ps.env.spectron_temp_dir) {
  el.app.setPath('userData', ps.env.spectron_temp_dir);
}

el.app.on('ready', () => {
  console.log('RIDE MAIN: App ready, setting up IPC handlers');
  
  // Set up dock menu for macOS
  windowManager.setupDockMenu();
  
  // Set up IPC handlers FIRST before creating window
  el.ipcMain.on('create-session-window', (evt) => {
    console.log('RIDE: ===== CREATING NEW SESSION WINDOW =====');
    console.log('RIDE: Event sender:', evt.sender.id);
    
    
    // Create the actual session window
    const sessionId = `session_${Date.now()}`;
    
    // Get current window position for offsetting
    const currentWindow = el.BrowserWindow.fromWebContents(evt.sender);
    const [x, y] = currentWindow ? currentWindow.getPosition() : [100, 100];
    console.log('RIDE: Current window position:', x, y);
    
    // Create a new window with a reasonable default size
    const newWindow = new el.BrowserWindow({
      x: x + 50,
      y: y + 50,
      width: 600,  // Larger initial size that works for both connection dialog and sessions
      height: 500,
      show: false, // Show when ready
      title: `New Session - Ride`,
      webPreferences: {
        contextIsolation: false,
        enableRemoteModule: true,
        nodeIntegration: true,
        enableDeprecatedPaste: true
      }
    });
    
    // Show when ready
    newWindow.once('ready-to-show', () => {
      newWindow.show();
    });
    
    console.log('RIDE: New window created with id:', newWindow.id);
    
    // Enable remote module
    elm.enable(newWindow.webContents);
    
    // Add error handling
    newWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('RIDE: Failed to load window:', errorCode, errorDescription);
    });
    
    // Debug window visibility
    newWindow.once('show', () => {
      console.log('RIDE: New window shown');
    });
    
    newWindow.once('ready-to-show', () => {
      console.log('RIDE: New window ready to show');
    });
    
    // Load index.html with newSession flag - new window will start with connection dialog
    console.log('RIDE: Loading index.html for new session window');
    newWindow.loadURL(`file://${__dirname}/index.html?newSession=true`);
    
    // When loaded, the window will naturally show connection dialog
    newWindow.webContents.once('did-finish-load', () => {
      console.log('RIDE: New window finished loading');
      // Send a message to the renderer to initialize as a new session
      newWindow.webContents.send('init-new-session', { sessionId });
    });
    
    // Track this window in the window manager
    windowManager.windows.set(newWindow.id, {
      window: newWindow,
      type: 'session',
      sessionId: sessionId,
      isNewSession: true,  // Track that this is a new session window
      hasConnection: false // Track connection state
    });
    
    // Update window menu
    windowManager.updateWindowMenu();
    
    console.log('RIDE: ===== NEW SESSION WINDOW COMPLETE =====');
  });
  
  // Add a simple test IPC handler
  el.ipcMain.on('test-ipc', (evt) => {
    console.log('RIDE: TEST IPC RECEIVED!');
    evt.reply('test-ipc-reply', 'IPC is working!');
  });
  
  // Handle window menu updates
  el.ipcMain.on('update-window-menu', () => {
    windowManager.updateWindowMenu();
  });
  
  // Handle window state changes
  el.ipcMain.on('window-state-change', (evt, state) => {
    const window = el.BrowserWindow.fromWebContents(evt.sender);
    if (window) {
      const winInfo = windowManager.windows.get(window.id);
      if (winInfo && state) {
        if (state.hasConnection !== undefined) {
          winInfo.hasConnection = state.hasConnection;
          console.log('RIDE: Window', window.id, 'hasConnection:', state.hasConnection);
          
          // If this is a new session window that just got a connection, resize it
          if (state.hasConnection && winInfo.isNewSession) {
            const bounds = window.getBounds();
            if (bounds.width < 800 || bounds.height < 600) {
              console.log('RIDE: Resizing new session window to session size');
              window.setSize(800, 600);
            }
            winInfo.isNewSession = false; // No longer a "new" session window
          }
          
          // Update menu immediately
          windowManager.updateWindowMenu();
        }
      }
    }
  });
  
  // Handle window state changes from renderer
  el.ipcMain.on('save-win', (evt, onLaunch) => {
    // This is handled by window manager now
  });
  
  console.log('RIDE MAIN: IPC handlers registered');
  
  // NOW create the main window
  const w = windowManager.createMainWindow();
  global.elw = w;
  elm.enable(w.webContents);
  el.Menu.setApplicationMenu(null);
  
  // Load the initial page
  w.loadURL(`file://${__dirname}/index.html`);
  
  // Open dev tools if previously opened
  if (windowManager.winstate.devTools) {
    w.webContents.openDevTools();
  }
  
  // Development mode support
  if (process.argv.constructor === Array && process.argv.includes('DEV_STYLE')) {
    const { client } = rq('electron-connect');
    const c = client.create(w, { sendBounds: false });
    c.on('reboot', () => {
      windowManager.closeAllSessionWindows();
      w.close();
      el.app.relaunch();
    });
    c.on('css_update', () => {
      // define the reload function that hacks in the new styles
      const reloadFn = `() => {
        [...document.getElementsByClassName('theme')].forEach(t => t.replaceWith(t));
      }`;
      // Update all windows
      windowManager.getAllWindows().forEach(win => {
        win.webContents.executeJavaScript(`(${reloadFn})()`);
      });
    });
  }
});

// Handle window-all-closed event
el.app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  // On other platforms, quit the app
  if (process.platform !== 'darwin') {
    el.app.quit();
  }
});
el.app.on('will-finish-launching', () => {
  el.app.on('open-file', (event, path) => {
    global.open_file = path;
  });
});

// Handle app activation (clicking dock icon on macOS)
el.app.on('activate', () => {
  // If no windows are open, create a new one
  if (windowManager.getAllWindows().length === 0) {
    const w = windowManager.createMainWindow();
    global.elw = w;
    elm.enable(w.webContents);
    w.loadURL(`file://${__dirname}/index.html`);
  }
});
global.js = (i, x) => el.BrowserWindow.fromId(i).webContents.executeJavaScript(x);