# Ride Architecture Documentation

## Overview

Ride is a cross-platform IDE for Dyalog APL built with Electron. As of version 4.7+, the application uses a single-process, multi-window architecture where all session windows exist within the same Electron process, similar to VS Code's window management.

## Key Architectural Changes (v4.7+)

### Removal of Floating Window Mode

The application has undergone a major refactoring to remove "floating window mode" entirely. This mode previously allowed editor and tracer windows to float as separate OS windows using IPC (Inter-Process Communication) for coordination.

**What was removed:**
- IPC/RPC communication system (`src/ipc.js` - removed entirely)
- Floating window preferences and UI
- Process-based window spawning
- Complex message passing between windows

**What remains:**
- Docked mode using GoldenLayout for tabs/panes within windows
- Native OS window management for multiple sessions
- Direct object references instead of IPC

### Multi-Session Architecture

Each session runs in its own native OS window within the same Electron process:

```
┌─────────────────────────────┐
│   Main Electron Process     │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │   Session Window 1    │  │
│  │  - IDE instance       │  │
│  │  - TCP connection     │  │
│  │  - GoldenLayout       │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │   Session Window 2    │  │
│  │  - IDE instance       │  │
│  │  - TCP connection     │  │
│  │  - GoldenLayout       │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

## Core Components

### 1. Window Management (`src/window-manager.js`)

The `WindowManager` is a singleton that tracks all session windows:

```javascript
class WindowManager {
  constructor() {
    this.windows = new Map(); // windowId -> windowInfo
  }
  
  addWindow(window, sessionId) {
    this.windows.set(window.id, {
      window,
      sessionId,
      hasConnection: false,
      isNewSession: true
    });
  }
}
```

**Responsibilities:**
- Track all open windows and their state
- Build window menu items dynamically
- Handle dock menu on macOS
- Coordinate window focusing and positioning

### 2. Connection Management (`src/connection.js`)

Each IDE instance has its own Connection object:

```javascript
class Connection {
  constructor(ide) {
    this.ide = ide;        // Back-reference to IDE instance
    this.socket = null;    // TCP socket
    this.connected = false;
  }
  
  connect(host, port) {
    this.socket = net.connect({ host, port });
    this.setupHandlers();
  }
}
```

**Key design decision:** Connection is no longer global but per-IDE instance, enabling true multi-session support.

### 3. IDE Class (`src/ide.js`)

Each window has its own IDE instance:

```javascript
class IDE {
  constructor(opts = {}) {
    this.sessionId = opts.sessionId;
    this.connection = new D.Connection(this);
    this.dead = false;
    this.connected = 0;
    // ... editor management, session state, etc.
  }
}
```

### 4. Main Process (`main.js`)

Handles window lifecycle and IPC:

```javascript
// Window creation for new sessions
el.ipcMain.handle('new-session', async () => {
  const newWindow = createMainWindow();
  newWindow.loadFile('index.html', { 
    search: 'newSession=true' 
  });
  return newWindow.id;
});

// Window state tracking
el.ipcMain.on('window-state-change', (evt, state) => {
  const window = el.BrowserWindow.fromWebContents(evt.sender);
  windowManager.updateWindowState(window, state);
});
```

## Window Lifecycle

### 1. Initial Launch

```
main.js (app.ready)
  ├─> createMainWindow()
  ├─> windowManager.addWindow()
  ├─> window.loadFile('index.html')
  └─> src/init.js
       ├─> Shows connection dialog (src/cn.js)
       └─> User connects/spawns interpreter
```

### 2. Creating New Session Window

```
User: Cmd+N or File > New Session
  ├─> D.commands.CNC()
  ├─> IPC: 'new-session'
  ├─> main.js creates new BrowserWindow
  ├─> New window loads with newSession=true
  └─> Connection dialog shown in new window
```

### 3. Connection Establishment

```
src/cn.js (go function)
  ├─> Creates Connection instance
  ├─> Creates IDE instance
  ├─> Establishes TCP connection
  ├─> IPC: 'window-state-change' {hasConnection: true}
  └─> Window resizes from 600x500 to 800x600
```

## Menu System

### Dynamic Menu Updates

The menu system updates based on window focus:

```javascript
// main.js
windowManager.setupFocusHandlers = () => {
  app.on('browser-window-focus', (evt, window) => {
    // Ask renderer to check its state
    window.webContents.send('check-state-and-update-menu');
  });
};

// src/init.js  
ipcRenderer.on('check-state-and-update-menu', () => {
  if (showingConnectionDialog) {
    D.setUpMenu();  // Connection menu
  } else if (hasConnectedSession) {
    D.ide.updMenu(); // IDE menu
  }
});
```

### Window Menu

The Window menu is built dynamically:

```javascript
// src/menu.js
if (y[''] === 'Window' && y.items) {
  const windowItems = windowManager.buildWindowMenuItems();
  // Inject window list after separator
  submenu.insert(insertIndex, ...windowItems);
}
```

## Platform-Specific Features

### macOS
- Dock menu with window list
- Window positioning commands (left/right of screen)
- "Bring All to Front" functionality
- App stays open when all windows closed

### Windows
- Standard minimize/close operations
- Taskbar integration
- No dock menu (uses taskbar instead)

### Linux
- Standard window operations
- Window manager integration varies by desktop environment

## Data Flow

### 1. APL Protocol Messages

```
Interpreter ─TCP─> Connection.socket
                    └─> Connection.handleData()
                         └─> Parse RIDE protocol
                              └─> IDE.recv(cmd, args)
                                   └─> Update UI
```

### 2. User Input

```
User types in session
  └─> Session.keydown()
       └─> IDE.send(cmd, args)
            └─> Connection.send()
                 └─> socket.write()
                      └─> Interpreter
```

## File Structure

```
ride/
├── main.js                 # Electron main process
├── src/
│   ├── init.js            # Renderer initialization
│   ├── ide.js             # IDE class (per-window)
│   ├── connection.js      # TCP connection (per-IDE)
│   ├── window-manager.js  # Window tracking
│   ├── cn.js              # Connection dialog
│   ├── se.js              # Session/REPL
│   ├── ed.js              # Editor windows
│   ├── menu.js            # Menu building
│   └── prf.js             # Preferences
└── package.json           # App metadata
```

## Configuration and State

### Window State (`winstate.json`)

```json
{
  "dx": 0,
  "dy": 0,
  "width": 800,
  "height": 600,
  "maximized": false
}
```

### Connections (`connections.json`)

```json
[
  {
    "name": "Local v18.2",
    "type": "start",
    "exe": "/Applications/Dyalog-18.2.app/Contents/Resources/Dyalog/mapl",
    "env": "MAXWS=4G"
  }
]
```

### Preferences (`prefs.json`)

User preferences are stored globally and apply to all windows.

## Best Practices

### 1. Window References

Always check if windows are destroyed:

```javascript
if (!window.isDestroyed()) {
  window.focus();
}
```

### 2. IPC Communication

Minimal IPC between main and renderer:

```javascript
// Prefer simple state notifications
ipcRenderer.send('window-state-change', { hasConnection: true });

// Avoid complex data passing
```

### 3. Connection Handling

Each IDE manages its own connection:

```javascript
// Good - instance method
ide.connection.send(cmd, args);

// Bad - global send
D.send(cmd, args);  // Deprecated
```

### 4. Menu Updates

Menus should reflect the focused window's state:

```javascript
// Window gains focus -> check state -> update menu
// This ensures menu always matches active window
```

## Debugging

### Useful Commands

```bash
# Open DevTools in focused window
Cmd+Opt+I (macOS) / Ctrl+Shift+I (Windows/Linux)

# View IPC messages
D.el.BrowserWindow.getFocusedWindow().webContents.on('ipc-message', console.log)

# List all windows
windowManager.getAllWindows()

# Check connection state
D.ide.connected
D.ide.connection.socket.readyState
```

### Common Issues

1. **Menu not updating**: Check focus event handlers and menu rebuild triggers
2. **Window sizing**: Initial size (600x500) vs connected size (800x600)
3. **Connection timeouts**: Default 60s, configurable via RIDE_CONNECT_TIMEOUT

## Future Considerations

1. **Window restoration**: Save/restore window positions across app restarts
2. **Workspace awareness**: Link windows to APL workspaces
3. **Shared preferences UI**: Single preferences window affecting all sessions
4. **Cross-window features**: Copy/paste of APL objects between sessions

## Migration Notes

When upgrading from pre-4.7 versions:

1. Floating window preferences are ignored
2. IPC-based extensions won't work
3. Window positioning preferences need migration
4. All windows share the same process memory space

The new architecture is simpler, more reliable, and provides better OS integration while maintaining the full feature set users expect from a modern IDE.