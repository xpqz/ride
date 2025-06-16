# Connection Architecture Refactoring Plan

## Overview

This document details the refactoring needed to support multiple independent RIDE sessions, each with its own TCP connection to an interpreter.

## Current Architecture Problems

### Global State in cn.js
```javascript
let clt;  // Global client connection
let srv;  // Global server for spawned interpreters
let child;  // Global child process reference
```

### Global D.send Function
```javascript
// Currently in init.js
D.send = (x, y) => {
  if (clt && clt.readyState === clt.OPEN) {
    clt.send(JSON.stringify([x, y]));
  }
};
```

### Single Message Router
```javascript
// Currently in ide.js
D.recv = (x, y) => { 
  mq.push([x, y]); 
  rrd(); 
};
```

## Proposed Architecture

### 1. Connection Class
```javascript
// src/connection.js
class Connection {
  constructor(ide) {
    this.ide = ide;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.server = null;  // For spawned interpreters
    this.child = null;   // Child process if spawned
  }
  
  connect(host, port) {
    this.socket = net.connect({ host, port });
    this.setupHandlers();
  }
  
  listen(port, callback) {
    this.server = net.createServer(callback);
    this.server.listen(port);
  }
  
  send(cmd, args) {
    if (this.socket && this.socket.writable) {
      const msg = JSON.stringify([cmd, args]);
      this.socket.write(this.toBuf(msg));
    }
  }
  
  toBuf(str) {
    const b = Buffer.from(`xxxxRIDE${str}`);
    b.writeInt32BE(b.length, 0);
    return b;
  }
  
  setupHandlers() {
    this.socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });
    
    this.socket.on('error', (err) => {
      this.ide.handleConnectionError(err);
    });
    
    this.socket.on('close', () => {
      this.ide.handleConnectionClose();
    });
  }
  
  processBuffer() {
    while (this.buffer.length >= 8) {
      const n = this.buffer.readInt32BE(0);
      if (n > this.buffer.length) break;
      
      const msg = this.buffer.slice(8, n).toString();
      try {
        const [cmd, args] = JSON.parse(msg);
        this.ide.recv(cmd, args);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
      
      this.buffer = this.buffer.slice(n);
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}
```

### 2. IDE Class Updates
```javascript
// src/ide.js
D.IDE = function IDE(opts = {}) {
  const ide = this;
  
  // Create connection for this IDE
  ide.connection = new Connection(ide);
  
  // Instance-specific send method
  ide.send = (cmd, args) => {
    ide.connection.send(cmd, args);
  };
  
  // Instance-specific receive method
  ide.recv = (cmd, args) => {
    ide.messageQueue.push([cmd, args]);
    ide.runMessageQueue();
  };
  
  // ... rest of IDE initialization
};
```

### 3. Connection Dialog Updates
```javascript
// src/cn.js - Remove globals, use IDE's connection
const createIDEInstance = (host, port, name) => {
  const ide = new D.IDE({ sessionId });
  
  // Connect using IDE's connection
  ide.connection.connect(host, port);
  
  ide.setConnInfo(host, port, name);
  return ide;
};

// For spawning interpreter
const spawnInterpreter = (config, ide) => {
  ide.connection.listen(0, (socket) => {
    // Handle incoming connection from spawned interpreter
    ide.connection.socket = socket;
    ide.connection.setupHandlers();
  });
  
  const addr = ide.connection.server.address();
  const env = {
    ...process.env,
    RIDE_INIT: `CONNECT:${addr.address}:${addr.port}`
  };
  
  ide.connection.child = spawn(config.exe, args, { env });
};
```

## Migration Steps

### Step 1: Create Connection Class
1. Create `src/connection.js` with the Connection class
2. Add require in `src/init.js`
3. Test with mock IDE object

### Step 2: Update IDE Class
1. Add `this.connection = new Connection(this)` to IDE constructor
2. Add instance `send` method
3. Add instance `recv` method
4. Update message queue handling

### Step 3: Update Protocol Calls
1. Find all `D.send` calls (approximately 200+ occurrences)
2. Replace with `ide.send` or `D.ide.send` as appropriate
3. Update protocol handlers to use IDE instance

### Step 4: Update Connection Dialog
1. Remove global `clt`, `srv`, `child` variables
2. Update all connection methods to use IDE's connection
3. Test spawn and connect flows

### Step 5: Multi-Window Support
1. Ensure each window creates its own IDE
2. Remove any remaining global state
3. Test multiple windows with different connections

## Files to Update

### High Priority (Core Connection Logic)
- `src/cn.js` - Remove all global connection state
- `src/init.js` - Remove global D.send
- `src/ide.js` - Add connection instance

### Medium Priority (Protocol Handlers)
- `src/se.js` - Session window
- `src/ed.js` - Editor windows
- `src/dbg.js` - Debugger
- `src/wse.js` - Workspace explorer

### Find and Replace Patterns
```bash
# Find all D.send calls
grep -r "D\.send(" src/

# Find all references to global clt
grep -r "\bclt\b" src/

# Find all protocol handler definitions
grep -r "D\.IDE\.prototype.*handlers" src/
```

## Testing Plan

1. **Single Window Tests**
   - Connect to interpreter
   - Execute commands
   - Open editors
   - Use debugger

2. **Multi-Window Tests**
   - Open two windows
   - Connect to different interpreters
   - Execute commands in both
   - Ensure independence

3. **Edge Cases**
   - Close window during connection
   - Network errors
   - Interpreter crashes
   - Rapid window open/close

## Rollback Plan

If issues arise:
1. Keep old global code commented
2. Add feature flag for new connection architecture
3. Can revert to single-window mode