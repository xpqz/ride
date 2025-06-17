# RIDE Refactoring Plan: Remove Floating Mode

## Executive Summary

This plan outlines the complete removal of floating mode from RIDE, retaining only docked mode while ensuring new sessions open as proper OS windows owned by the main application instance. The refactoring will eliminate the complex RPC system, improve performance, and fix platform-specific window management issues.

## Phase 1: Preparation and Safety Measures

### 1.1 Create Feature Flag (Week 1)
- Add `ENABLE_FLOATING_MODE` flag defaulting to `false`
- Wrap all floating mode code paths with this flag
- This allows quick rollback if issues arise during refactoring

### 1.2 Comprehensive Test Suite (Week 1-2)
- Document current behavior of both modes
- Create automated tests for:
  - Session creation and management
  - Editor window operations (open, close, focus)
  - Window menu functionality
  - Keyboard shortcuts
  - Preferences saving/loading

### 1.3 Backup Current State
- Tag current version as `pre-refactor-backup`
- Document all floating mode features for reference

## Phase 2: New Session Window Architecture

### 2.1 Redesign Session Creation (Week 3)
- Modify `main.js` to support multiple session windows
- Each session window is a separate BrowserWindow but owned by main app
- Implement window tracking in main process:
  ```javascript
  // main.js
  const sessionWindows = new Map(); // windowId -> BrowserWindow
  ```

### 2.2 Update Window Menu (Week 3)
- Implement dynamic Window menu that lists all open sessions
- Add standard macOS window management:
  - Minimize (Cmd+M)
  - Bring All to Front
  - List of open windows with checkmarks
- Fix dock right-click menu to show window list

### 2.3 Inter-Window Communication (Week 4)
- Replace IPC system with Electron's built-in IPC
- Use `ipcMain` and `ipcRenderer` for main � renderer communication
- Remove dependency on `node-ipc` package

## Phase 3: Remove Floating Mode Infrastructure

### 3.1 Remove IPC System (Week 5)
- Delete `src/ipc.js` entirely
- Remove all `D.IPC_*` function calls
- Remove window proxy pattern

### 3.2 Clean IDE Class (Week 5-6)
- Remove `ide.floating` property
- Remove all conditional branches based on floating mode
- Consolidate editor creation to always use GoldenLayout
- Update `D.ide.pending` to work without IPC

### 3.3 Update Editor Class (Week 6)
- Remove floating-specific code from `src/ed.js`
- Always use docked behavior for editor windows
- Remove title updates for floating windows

### 3.4 Clean Preferences (Week 7)
- Remove floating mode preferences from `src/prf.js`
- Remove UI elements from `src/prf_wins.js` and `index.html`
- Update preference migration to handle old settings

## Phase 4: Fix Window Management - Multi-Session Architecture

### Initial Investigation Results

The initial attempt to implement session tabs revealed fundamental architectural limitations:

1. **Single Global TCP Connection**: RIDE uses one global `clt` variable for the interpreter connection
2. **Single Message Router**: All protocol messages go through one `D.recv` function to `D.ide`
3. **Global Protocol State**: The entire codebase assumes one active interpreter connection
4. **Connection Lifecycle**: Connection code in `cn.js` manages a single global connection

### Revised Approach: Multi-Window Sessions (like VS Code)

Instead of tabs, implement proper multi-window sessions where each window:
- Is a separate BrowserWindow in the same Electron process
- Has its own TCP connection to an interpreter
- Maintains independent state
- Shares the main process but has isolated renderer processes

### 4.1 Connection Architecture Refactoring (Week 8)

#### Remove Global Connection State:
1. **Encapsulate Connection in IDE Class**
   ```javascript
   // Each IDE instance owns its connection
   class IDE {
     constructor(opts) {
       this.connection = null;  // TCP socket
       this.sessionId = opts.sessionId;
       this.messageQueue = [];
       this.protocolState = {};
     }
     
     connect(host, port) {
       this.connection = net.connect({ host, port });
       this.setupMessageHandling();
     }
     
     send(cmd, args) {
       // Send on this IDE's connection
       if (this.connection) {
         const msg = JSON.stringify([cmd, args]);
         this.connection.write(toBuf(msg));
       }
     }
     
     setupMessageHandling() {
       this.connection.on('data', (data) => {
         // Process messages for this IDE only
         this.processMessage(data);
       });
     }
   }
   ```

2. **Remove Global Variables**
   - Remove global `clt` (client connection)
   - Remove global `D.send` function
   - Make `D.recv` per-IDE instance
   - Move connection state from `cn.js` globals to IDE instance

3. **Update Protocol Handlers**
   - Pass IDE instance to all protocol handlers
   - Replace `D.send` with `ide.send`
   - Update all files that use global connection

### 4.2 Window Management Architecture (Week 9)

#### Main Process Window Manager:
```javascript
// main.js - Window manager for session windows
class SessionWindowManager {
  constructor() {
    this.windows = new Map(); // windowId -> { window, sessionId }
  }
  
  createSessionWindow(sessionId) {
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load with session context
    window.loadFile('index.html');
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('init-session', { sessionId });
    });
    
    this.windows.set(window.id, { window, sessionId });
    return window;
  }
}
```

#### Renderer Process Initialization:
```javascript
// Each window creates its own IDE instance
ipcRenderer.on('init-session', (event, { sessionId }) => {
  const ide = new D.IDE({ sessionId });
  // This window's IDE, not global
  D.ide = ide;
});
```

### 4.3 NSW Command Implementation (Week 10)

1. **NSW triggers new window creation**:
   ```javascript
   NSW() {
     if (D.el) {
       ipcRenderer.send('create-session-window');
     }
   }
   ```

2. **Main process creates window**:
   ```javascript
   ipcMain.on('create-session-window', () => {
     const sessionId = `session_${Date.now()}`;
     const window = sessionWindowManager.createSessionWindow(sessionId);
   });
   ```

3. **New window shows connection dialog**:
   - Each window starts with connection dialog
   - Establishes its own interpreter connection
   - Independent of other windows

### 4.4 Implementation Order

1. **Phase 4.1: Connection Refactoring**
   - Create connection wrapper class
   - Move global connection state to IDE instance
   - Update all `D.send` calls to use IDE instance
   - Test single window still works

2. **Phase 4.2: Multi-Window Support**
   - Implement SessionWindowManager in main process
   - Update window creation flow
   - Ensure each window has isolated state
   - Test multiple windows can run independently

3. **Phase 4.3: Polish**
   - Window menu showing all sessions
   - Proper window titles with connection info
   - Clean shutdown of connections on window close
   - Keyboard shortcuts for window management

### Key Differences from Original Plan

1. **Windows not Tabs**: Each session is a separate window (like VS Code)
2. **Connection per Window**: Each window has its own TCP connection
3. **Process Isolation**: Windows are isolated at the renderer process level
4. **Simpler Architecture**: No complex message routing between tabs

### Success Criteria

- [x] Can open multiple session windows with File → New Session
- [x] Each window can connect to a different interpreter
- [x] Windows operate independently (commands in one don't affect others)
- [ ] Closing a window cleanly disconnects its interpreter
- [ ] Window menu shows all open sessions
- [x] No global connection state

### Phase 4 Implementation Findings

#### Completed Successfully:
1. **Connection Class Architecture**
   - Created `src/connection.js` encapsulating TCP connection per IDE
   - Fixed handshake protocol to wait for server responses
   - Each IDE instance owns its connection, no global state
   
2. **Multi-Window Support**
   - CMD+N creates new Electron windows via IPC
   - Windows start with connection dialog (400x400)
   - Each window has independent IDE instance
   - Fixed focus stealing issues

3. **Connection Handshake Fix**
   - Proper sequence: Client sends SupportedProtocols, waits for response
   - Then sends UsingProtocol=2, waits for confirmation
   - Only then sends Identify, Connect, GetWindowLayout

#### Remaining Issues:
1. **Menu Focus Synchronization**
   - Menus update correctly when switching TO session window
   - Menus don't update when switching BACK to connection window
   - Root cause: Window still has D.ide instance even when showing connection dialog
   - Attempted fix: Check `I.cn.hidden` state, but no change observed

2. **Window Lifecycle**
   - Need proper cleanup when windows close
   - Connection cleanup exists but needs testing
   - Window tracking in WindowManager implemented but menu update incomplete

3. **Memory Leaks**
   - Connection class has cleanup (removeAllListeners)
   - Not fully tested under stress

#### Key Code Changes:
- `src/connection.js`: New file encapsulating TCP connection
- `src/km.js`: CNC command always creates new window
- `main.js`: IPC handler creates windows with proper query params
- `src/init.js`: Handles new session windows differently
- `src/ide.js`: Each IDE owns a Connection instance
- `src/cn.js`: Creates IDE instances with connections

#### Next Steps:
1. Fix menu synchronization by properly tracking window state
2. Implement window close handlers for clean disconnection
3. Complete WindowManager menu update functionality
4. Stress test for memory leaks

## Phase 5: Platform-Specific Fixes

### 5.1 macOS Integration (Week 10)
- Implement proper Window menu as per macOS HIG
- Fix dock behavior:
  - Show all windows on right-click
  - Proper window grouping
  - Mission Control integration
- Handle Cmd+` for window cycling

### 5.2 Windows/Linux (Week 10)
- Ensure taskbar shows all session windows
- Implement Alt+Tab friendly window titles
- Test window management on both platforms

## Phase 6: Cleanup and Optimization

### 6.1 Remove Dead Code (Week 11)
- Remove all floating mode related code
- Remove unused IPC infrastructure
- Clean up conditional branches

### 6.2 Simplify Architecture (Week 11)
- Consolidate window creation logic
- Remove unnecessary abstractions
- Update documentation

### 6.3 Performance Optimization (Week 12)
- Profile application startup
- Remove IPC overhead
- Optimize GoldenLayout usage

## Phase 7: Testing and Release

### 7.1 Comprehensive Testing (Week 13)
- Test all functionality in new architecture
- Multi-session testing
- Platform-specific testing
- Performance benchmarking

### 7.2 Migration Guide (Week 14)
- Document changes for users
- Provide migration path for settings
- Update user documentation

### 7.3 Beta Release (Week 14)
- Release beta version to selected users
- Gather feedback
- Fix reported issues

## Implementation Order

1. **Start with Phase 2** - Build new session architecture alongside existing code
2. **Test thoroughly** - Ensure new architecture works before removing old
3. **Remove floating mode** - Once new architecture is stable
4. **Platform fixes** - Address OS-specific issues
5. **Cleanup** - Remove all traces of old system

## Risk Mitigation

1. **Feature flag** allows disabling changes quickly
2. **Incremental approach** - each phase is independently testable
3. **Comprehensive tests** before starting major changes
4. **Beta testing** before full release
5. **Keep IPC removal for later phases** after new architecture proves stable

## Success Criteria

- [ ] All sessions open as proper OS windows
- [ ] Window menu shows all open sessions
- [ ] macOS dock integration works correctly
- [ ] No IPC system or floating mode code remains
- [ ] Performance improvement measurable
- [ ] All existing docked mode features work
- [ ] No regression in functionality

## Technical Debt Addressed

- Removes complex RPC system
- Eliminates window proxy pattern
- Reduces conditional branching
- Improves code maintainability
- Aligns with Electron best practices
- Fixes platform integration issues

## Estimated Timeline

Total duration: 14 weeks (3.5 months)

- Preparation: 2 weeks
- Core refactoring: 8 weeks  
- Testing and polish: 4 weeks

This conservative timeline allows for thorough testing and issue resolution.