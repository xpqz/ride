// Window Manager for RIDE
// Manages multiple session windows and tracks their state

const { BrowserWindow, Menu, screen, app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

class WindowManager {
  constructor() {
    // Map of windowId -> { window: BrowserWindow, type: 'session'|'main', sessionId: string }
    this.windows = new Map();
    this.mainWindow = null;
    this.focusedWindow = null;
    this.windowCounter = 0;
    this.focusHistory = []; // Track window focus order for MRU
    
    // Window state file paths
    this.dbPath = app.getPath('userData');
    this.winstateFile = path.join(this.dbPath, 'winstate.json');
    this.sessionStatesFile = path.join(this.dbPath, 'session-states.json');
    
    // Load saved window states
    this.loadWindowStates();
    
    // Set up event handlers
    this.setupEventHandlers();
  }
  
  loadWindowStates() {
    // Load main window state
    try {
      if (fs.existsSync(this.winstateFile)) {
        this.winstate = JSON.parse(fs.readFileSync(this.winstateFile, 'utf8'));
      } else {
        this.winstate = this.getDefaultWinstate();
      }
    } catch (e) {
      console.error('Error loading winstate:', e);
      this.winstate = this.getDefaultWinstate();
    }
    
    // Load session window states
    try {
      if (fs.existsSync(this.sessionStatesFile)) {
        this.sessionStates = JSON.parse(fs.readFileSync(this.sessionStatesFile, 'utf8'));
      } else {
        this.sessionStates = {};
      }
    } catch (e) {
      console.error('Error loading session states:', e);
      this.sessionStates = {};
    }
  }
  
  getDefaultWinstate() {
    return {
      theme: 'light',
      launchWin: {
        expandedWidth: 900,
        width: 400,
        height: 400,
        expanded: false
      },
      mainWin: { width: 800, height: 600 }
    };
  }
  
  saveWindowStates() {
    try {
      fs.writeFileSync(this.winstateFile, JSON.stringify(this.winstate, null, 2));
      fs.writeFileSync(this.sessionStatesFile, JSON.stringify(this.sessionStates, null, 2));
    } catch (e) {
      console.error('Error saving window states:', e);
    }
  }
  
  setupEventHandlers() {
    // Track focus changes
    app.on('browser-window-focus', (event, window) => {
      this.focusedWindow = window;
      this.updateWindowMenu();
    });
    
    // Clean up when app quits
    app.on('before-quit', () => {
      this.saveWindowStates();
    });
    
    // Handle window registration from other processes
    ipcMain.on('register-window', (event, winInfo) => {
      // For now, just update the menu when a new window is created
      this.updateWindowMenu();
    });
    
    // Handle window list requests
    ipcMain.handle('get-all-windows', async () => {
      return this.getAllWindows().map(w => ({
        id: w.id,
        title: w.getTitle(),
        focused: w.isFocused()
      }));
    });
  }
  
  createMainWindow() {
    const winData = this.winstate.launchWin;
    const { x, y, width, height } = this.validateWindowBounds(winData);
    
    const D = global.D;
    this.mainWindow = new BrowserWindow({
      show: false,
      x, y, width, height,
      ...(!D.win && !D.mac && { icon: path.join(__dirname, '..', 'D.png') }),
      backgroundColor: '#7688d9',
      webPreferences: {
        contextIsolation: false,
        enableRemoteModule: true,
        nodeIntegration: true,
        enableDeprecatedPaste: true
      }
    });
    
    // Track this window
    this.windows.set(this.mainWindow.id, {
      window: this.mainWindow,
      type: 'main',
      sessionId: null
    });
    
    // Notify that windows changed
    this.emit('windows-changed');
    
    // Set up window events
    this.setupWindowEvents(this.mainWindow, 'main');
    
    return this.mainWindow;
  }
  
  createSessionWindow(sessionId, config = {}) {
    this.windowCounter++;
    const winId = `session_${this.windowCounter}`;
    
    // Get saved state for this session or use defaults
    const savedState = this.sessionStates[sessionId] || this.winstate.mainWin;
    const { x, y, width, height } = this.validateWindowBounds(savedState);
    
    const D = global.D;
    const sessionWindow = new BrowserWindow({
      show: false,
      x, y, width, height,
      title: config.title || `RIDE Session ${this.windowCounter}`,
      ...(!D.win && !D.mac && { icon: path.join(__dirname, '..', 'D.png') }),
      backgroundColor: '#f0f0f0',
      webPreferences: {
        contextIsolation: false,
        enableRemoteModule: true,
        nodeIntegration: true,
        enableDeprecatedPaste: true,
        // Pass session info to renderer
        additionalArguments: [
          `--session-id=${sessionId}`,
          `--session-window=true`
        ]
      }
    });
    
    // Track this window
    this.windows.set(sessionWindow.id, {
      window: sessionWindow,
      type: 'session',
      sessionId: sessionId
    });
    
    // Notify that windows changed
    this.emit('windows-changed');
    
    // Set up window events
    this.setupWindowEvents(sessionWindow, 'session', sessionId);
    
    // Load the session page
    sessionWindow.loadURL(`file://${path.join(__dirname, '..', 'index.html')}?session=${sessionId}`);
    
    // Update window menu
    this.updateWindowMenu();
    
    return sessionWindow;
  }
  
  setupWindowEvents(window, type, sessionId = null) {
    const saveState = () => {
      const bounds = window.getContentBounds();
      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: window.isMaximized(),
        focused: window.isFocused()
      };
      
      if (type === 'main') {
        Object.assign(this.winstate.launchWin, state);
      } else if (type === 'session' && sessionId) {
        this.sessionStates[sessionId] = state;
      }
      
      // Save window focus order
      if (window.isFocused() && this.focusHistory) {
        const idx = this.focusHistory.indexOf(window.id);
        if (idx > -1) this.focusHistory.splice(idx, 1);
        this.focusHistory.unshift(window.id);
      }
      
      // Throttled save
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveWindowStates(), 2000);
    };
    
    window.on('move', saveState);
    window.on('resize', saveState);
    window.on('maximize', saveState);
    window.on('unmaximize', saveState);
    
    window.on('closed', () => {
      this.windows.delete(window.id);
      this.emit('windows-changed');
      this.updateWindowMenu();
      
      // Note: app.quit() is handled by the window-all-closed event in main.js
      // This allows proper platform-specific behavior (e.g., staying open on macOS)
    });
    
    window.on('ready-to-show', () => {
      window.show();
    });
    
    // Update menu when window title changes
    window.on('page-title-updated', () => {
      this.emit('windows-changed');
      this.updateWindowMenu();
    });
  }
  
  validateWindowBounds(winData) {
    let { x, y, width, height } = winData;
    
    // Ensure we have valid dimensions
    width = width || 800;
    height = height || 600;
    
    // If we have a position, validate it's on screen
    if (x !== undefined && y !== undefined) {
      const display = screen.getDisplayMatching({ x, y, width, height });
      const bounds = display.bounds;
      
      // Calculate visible area
      const visibleWidth = Math.max(0, Math.min(x + width, bounds.x + bounds.width) - Math.max(x, bounds.x));
      const visibleHeight = Math.max(0, Math.min(y + height, bounds.y + bounds.height) - Math.max(y, bounds.y));
      
      // If less than 50% visible, center on screen
      if (visibleWidth * visibleHeight < 0.5 * width * height) {
        x = bounds.x + (bounds.width - width) / 2;
        y = bounds.y + (bounds.height - height) / 2;
      }
    }
    
    return { x, y, width, height };
  }
  
  updateWindowMenu() {
    if (!this.focusedWindow) return;
    
    console.log('RIDE: Updating menu for focused window');
    
    // Get window info
    const winInfo = this.windows.get(this.focusedWindow.id);
    if (!winInfo) return;
    
    console.log('RIDE: Window type:', winInfo.type, 'sessionId:', winInfo.sessionId);
    
    // Ask the focused window to report its state and update menu
    if (!this.focusedWindow.isDestroyed()) {
      this.focusedWindow.webContents.send('check-state-and-update-menu');
    }
  }
  
  getAllWindows() {
    return Array.from(this.windows.values())
      .filter(info => !info.window.isDestroyed())
      .map(info => info.window);
  }
  
  getSessionWindows() {
    return Array.from(this.windows.values())
      .filter(info => info.type === 'session' && !info.window.isDestroyed())
      .map(info => ({ window: info.window, sessionId: info.sessionId }));
  }
  
  focusWindow(windowId) {
    const winInfo = this.windows.get(windowId);
    if (winInfo && !winInfo.window.isDestroyed()) {
      winInfo.window.show();
      winInfo.window.focus();
    }
  }
  
  closeAllSessionWindows() {
    this.windows.forEach((winInfo) => {
      if (winInfo.type === 'session' && !winInfo.window.isDestroyed()) {
        winInfo.window.close();
      }
    });
  }
  
  // Get window title for display in Window menu
  getWindowTitle(window) {
    if (!window || window.isDestroyed()) return '';
    const winInfo = this.windows.get(window.id);
    if (!winInfo) return window.getTitle();
    
    // Use the actual window title which should reflect connection state
    return window.getTitle();
  }
  
  // Build Window menu items for all open windows
  buildWindowMenuItems() {
    const { Menu, MenuItem } = require('electron');
    const items = [];
    
    // Add each window to the menu
    this.windows.forEach((winInfo, windowId) => {
      if (!winInfo.window.isDestroyed()) {
        const title = this.getWindowTitle(winInfo.window);
        const item = new MenuItem({
          label: title,
          click: () => this.focusWindow(windowId),
          type: 'checkbox',
          checked: winInfo.window.isFocused()
        });
        items.push(item);
      }
    });
    
    return items;
  }
  
  // Set up the application's dock menu (macOS)
  setupDockMenu() {
    if (process.platform === 'darwin') {
      const { app, Menu, MenuItem } = require('electron');
      const updateDockMenu = () => {
        const dockMenu = Menu.buildFromTemplate([
          {
            label: 'New Session',
            click: () => {
              // Find a window to send the command to
              const firstWindow = this.getAllWindows()[0];
              if (firstWindow) {
                firstWindow.webContents.send('new-session-from-dock');
              }
            }
          },
          { type: 'separator' }
        ]);
        
        // Add all windows to dock menu
        this.windows.forEach((winInfo) => {
          if (!winInfo.window.isDestroyed()) {
            dockMenu.append(new MenuItem({
              label: this.getWindowTitle(winInfo.window),
              click: () => this.focusWindow(winInfo.window.id)
            }));
          }
        });
        
        app.dock.setMenu(dockMenu);
      };
      
      // Update dock menu whenever windows change
      this.on('windows-changed', updateDockMenu);
      updateDockMenu();
    }
  }
  
  // Make WindowManager an EventEmitter for change notifications
  on(event, listener) {
    this.listeners = this.listeners || {};
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(listener);
  }
  
  emit(event, ...args) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }
}

// Export singleton instance
module.exports = new WindowManager();