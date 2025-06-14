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
- Use `ipcMain` and `ipcRenderer` for main ” renderer communication
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

## Phase 4: Fix Window Management

### 4.1 Session Window Lifecycle (Week 8)
- Implement proper window creation for new sessions
- Each session creates new BrowserWindow from main process
- Sessions remain independent but share application instance

### 4.2 Focus Management (Week 8)
- Implement proper focus tracking across session windows
- Fix macOS-specific focus issues
- Ensure keyboard shortcuts work across windows

### 4.3 Window State Persistence (Week 9)
- Save/restore window positions for each session
- Handle multi-monitor setups correctly
- Persist GoldenLayout state per session

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