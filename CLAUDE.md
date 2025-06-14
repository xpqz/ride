# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ride is a cross-platform IDE for Dyalog APL built with Electron. It supports both local and remote connections to Dyalog APL interpreters. Version 4.7+ includes major refactoring to remove floating window mode.

## Current Architecture Refactoring

**IMPORTANT**: This codebase is undergoing a major refactoring to remove "floating window mode" entirely. See MISSION.md for details.

**Goal**: Keep only docked mode (tabs/panes within main window) and remove all RPC/IPC communication code.

**Key files affected by refactoring**:
- src/ipc.js - IPC/RPC system (to be removed entirely)
- src/ide.js - Contains floating mode logic
- src/init.js - Window creation and mode detection
- src/prf.js - Floating mode preferences
- src/prf_wins.js - Window preferences UI
- main.js - Main process window management

## Development Commands

```bash
# Install dependencies
npm install

# Compile LESS to CSS
npm run css

# Start development mode (compiles CSS and starts app)
npm run dev

# Start without building native apps
npm start

# Build for all platforms
npm run build dist

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## Architecture

**Main Components**:
- `main.js` - Electron main process
- `src/init.js` - Renderer process initialization
- `src/ide.js` - Main IDE class managing sessions and editors
- `src/se.js` - APL session/REPL window
- `src/ed.js` - Code editor windows
- `src/cn.js` - Connection management
- `src/wse.js` - Workspace explorer
- `src/dbg.js` - Debugger/tracer

**UI Framework**: GoldenLayout for docked window management

**Technologies**: Electron, Monaco Editor (v0.52.2), jQuery, node-ipc (to be removed)

## Coding Style

See `docs/coding-style.txt` for detailed conventions. Key points:
- 2-space indentation
- 120 character line limit
- Single quotes for strings
- Use `===` instead of `==`
- Egyptian or Lisp-style braces
- Minimize semicolons (ASI-friendly)

## Building

The custom build script `mk` supports multiple platforms:
- Windows (32-bit)
- Linux (x64, ARM)
- macOS (x64, ARM64)

Use latest Node.js version (v23.8.0 or newer) for building.

## Testing

Tests use AVA framework. Run with `npm test`. Tests are in `/test` directory.

## Dyalog APL Protocol

Ride communicates with Dyalog interpreters via JSON-based messages over TCP. See `docs/protocol.md` for details.

## Startup Sequence and Known Issues

### Startup Flow (v4.7+)
1. `main.js` creates the main Electron window
2. `src/init.js` initializes the renderer process
3. When `ENABLE_FLOATING_MODE = false`:
   - IPC server is NOT started
   - Preference/dialog windows are still created (needed for UI)
   - Connection dialog (`src/cn.js`) is loaded after promises resolve

### Critical Changes for Floating Mode Removal
- `D.ENABLE_FLOATING_MODE = false` in `src/prf.js`
- IPC server initialization is conditional in `src/init.js`
- All IPC server access must check for existence: `D.ipc.server && D.ipc.server.emit(...)`
- Preference window URL must use fallback appid when IPC is disabled

### Known Issues Fixed
- Splash screen hang: Fixed by skipping auxiliary window creation when floating mode disabled
- Missing connection dialog: Fixed by loading cn.js immediately without waiting for IPC
- Preference window errors: Fixed by conditional IPC server access
- Auxiliary windows (prf, dialog, status) are NOT created when floating mode is disabled

### Window Behavior
- Launch window (splash + connection): 400x400 default size
- Main IDE window: 800x600 default size
- Window dimensions stored in winstate.json