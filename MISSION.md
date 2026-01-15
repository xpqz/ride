# Window Creation and Management Flow in RIDE

## Overview

RIDE supports two primary window management modes:
1. **Docked Mode** (default) - Windows are managed by GoldenLayout within a single browser/electron window
2. **Floating Mode** - Each editor/tracer window is a separate OS window

## Key Components

### 1. Main Entry Point (main.js)
- Creates the initial Electron BrowserWindow
- Manages window state persistence (position, size, maximized state)
- Loads index.html which bootstraps the application
- No direct window creation for editors/debuggers

### 2. Session Creation Flow

#### New Session via Connect Page (cn.js)
1. User selects interpreter or enters connection details
2. Connection established via TCP socket
3. Creates new D.IDE instance
4. IDE constructor creates:
   - Session window (D.Se) as win[0]
   - GoldenLayout container
   - Registers component types: 'win', 'wse', 'dbg'

#### IDE Initialization (ide.js)
```javascript
// Docked mode - creates session in GoldenLayout
ide.wins[0] = new D.Se(ide);
gl.registerComponent('win', Win);
gl.registerComponent('wse', WSE);
gl.registerComponent('dbg', DBG);
```

### 3. Editor Window Creation

#### Docked Mode (default)
1. **Trigger**: OpenWindow message from interpreter or user action (Edit command)
2. **Flow**:
   ```javascript
   IDE.handlers.OpenWindow(ee) {
     // Creates D.Ed instance
     const ed = new D.Ed(ide, editorOpts);
     ide.wins[w] = ed;
     
     // Adds to GoldenLayout
     p.addChild({
       type: 'component',
       componentName: 'win',
       componentState: { id: w },
       title: ee.name
     });
   }
   ```

#### Floating Mode
1. **IPC Architecture**:
   - Main window runs IPC server (ride_master)
   - Each floating window runs IPC client
   - Communication via node-ipc

2. **Window Creation**:
   ```javascript
   D.IPC_CreateWindow(seq) {
     const bw = new D.el.BrowserWindow(opts);
     bw.loadURL(`${window.location}?type=editor&winId=${bw.id}`);
   }
   ```

3. **Window Proxy**:
   - D.IPC_WindowProxy manages remote windows
   - Forwards commands between main and floating windows

### 4. Window Menu Management

#### Menu Structure (prf_menu.js)
- Static menu defined in D.prf.menu default
- Window menu contains only "Close All Windows" command
- No dynamic window list in current implementation

#### Menu Parsing (parseMenuDSL)
- Parses menu description language
- Supports conditional display based on platform/mode
- Creates native Electron menus or HTML menus

### 5. GoldenLayout Integration

#### Component Registration
- **win**: Editor/Tracer windows
- **wse**: Workspace Explorer
- **dbg**: Debug panel

#### Layout Management
- Automatic positioning of new windows
- Tracers added to columns, editors to rows
- Maintains window state during resize/maximize

### 6. macOS Dock Integration

Currently minimal:
- Application menu set via `D.el.Menu.setApplicationMenu(m)`
- No custom dock menu
- No window-specific dock items

## Key Differences Between Modes

### Docked Mode
- Single process, all windows in one browser context
- Shared D.ide instance
- Direct function calls between components
- GoldenLayout manages window positioning

### Floating Mode
- Multiple processes (one per window)
- IPC communication required
- Each window has its own D.IDE instance
- OS manages window positioning

## Window Tracking

### Window Registry
- `ide.wins` object stores all windows by ID
- Session is always wins[0]
- Editors/tracers get unique numeric IDs

### Focus Management
- `ide.focusedWin` tracks last focused window
- `focusTS` timestamp for MRU (Most Recently Used) tracking
- Focus events update timestamps

## Classic Mode Considerations

When connected to Classic interpreter (detected via `x.arch[0] === 'C'`):
- System function names adjusted for Classic syntax
- Different Unicode mappings applied
- No functional difference in window management

## Missing Features / Observations

1. **No Dynamic Window List**: The Window menu doesn't show open windows
2. **No Window Navigation**: Can't switch between windows via menu
3. **Limited Dock Integration**: No custom dock menu on macOS
4. **No Window Grouping**: Floating windows aren't grouped in taskbar
5. **No Recent Windows**: No MRU list in UI

## Command Flow Examples

### Edit Command (Docked)
1. User triggers ED command
2. D.send('Edit', data) to interpreter
3. Interpreter responds with OpenWindow
4. IDE creates editor in GoldenLayout

### Edit Command (Floating)
1. User triggers ED in main window
2. IPC server broadcasts to find available window
3. If none available, creates new BrowserWindow
4. Links editor via IPC_LinkEditor

### Close All Windows (CAW)
- Command defined but implementation not found
- Likely iterates ide.wins and closes each
- Would need to handle both docked and floating modes