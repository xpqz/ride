// Connection class - encapsulates TCP connection to interpreter
// Each IDE instance has its own connection
{
  const net = nodeRequire('net');
  const cp = nodeRequire('child_process');
  
  D.Connection = class Connection {
    constructor(ide) {
      this.ide = ide;
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      this.server = null;  // For spawned interpreters
      this.child = null;   // Child process if spawned
      this.connected = false;
      this.log = (msg) => console.log(`RIDE[${this.ide.sessionId}]: ${msg}`);
    }
    
    connect(host, port) {
      this.log(`Connecting to ${host}:${port}`);
      this.socket = net.connect({ host, port });
      this.setupHandlers();
      return this.socket;
    }
    
    listen(port, host, callback) {
      this.server = net.createServer((socket) => {
        this.log('Interpreter connected');
        this.socket = socket;
        this.connected = true;
        this.setupHandlers();
        if (callback) callback(socket);
      });
      
      this.server.on('error', (err) => {
        this.log(`Server error: ${err}`);
        this.ide.handleConnectionError(err);
      });
      
      this.server.listen(port || 0, host || '127.0.0.1', () => {
        const addr = this.server.address();
        this.log(`Listening on ${addr.address}:${addr.port}`);
      });
      
      return this.server;
    }
    
    send(cmd, args) {
      if (this.socket && this.socket.writable) {
        const msg = JSON.stringify([cmd, args]);
        const buf = this.toBuf(msg);
        this.socket.write(buf);
        this.log(`Sent: ${cmd}`);
      } else {
        this.log(`Cannot send ${cmd} - no connection`);
      }
    }
    
    toBuf(str) {
      const b = Buffer.from(`xxxxRIDE${str}`);
      b.writeInt32BE(b.length, 0);
      return b;
    }
    
    setupHandlers() {
      this.handshakeDone = false;
      
      this.socket.on('connect', () => {
        this.log('Connected, starting handshake');
        this.connected = true;
        
        // Send initial protocol handshake - only SupportedProtocols first
        this.sendRaw('SupportedProtocols=2');
      });
      
      this.socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        this.processBuffer();
      });
      
      this.socket.on('error', (err) => {
        this.log(`Connection error: ${err}`);
        this.connected = false;
        this.ide.handleConnectionError(err);
      });
      
      this.socket.on('close', () => {
        this.log('Connection closed');
        this.connected = false;
        if (!this.handshakeDone) {
          console.error('Connection closed before handshake completed');
        }
        this.ide.handleConnectionClose();
      });
    }
    
    sendRaw(str) {
      if (this.socket && this.socket.writable) {
        const buf = this.toBuf(str);
        this.socket.write(buf);
        this.log(`Sent raw: ${str}`);
      }
    }
    
    processBuffer() {
      while (this.buffer.length >= 4) {
        const n = this.buffer.readInt32BE(0);
        if (n > this.buffer.length) break;
        if (n <= 8) {
          console.error('Bad protocol message - length too small:', n);
          this.buffer = this.buffer.slice(n);
          continue;
        }
        
        const msg = this.buffer.slice(8, n).toString();
        this.buffer = this.buffer.slice(n);
        
        this.log(`Received: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`);
        
        // Check for protocol handshake messages
        if (msg.startsWith('SupportedProtocols=')) {
          // Server responded with supported protocols, now we choose protocol 2
          this.sendRaw('UsingProtocol=2');
          this.send('Identify', { apiVersion: 1, identity: 1 });
          this.send('Connect', { remoteId: 2 });
          this.send('GetWindowLayout', {});
          continue;
        }
        
        if (msg.startsWith('UsingProtocol=')) {
          const version = msg.slice(14);
          if (version === '2') {
            this.handshakeDone = true;
            this.log('Handshake completed');
            this.ide.handleConnectionOpen();
          } else {
            console.error('Unsupported protocol version:', version);
            this.disconnect();
          }
          continue;
        }
        
        // Check for old protocol warning
        if (msg[0] === '<') {
          console.error('This version of Ride cannot talk to interpreters older than v15.0');
          this.disconnect();
          continue;
        }
        
        // Parse JSON messages
        if (msg[0] === '[') {
          try {
            const [cmd, args] = JSON.parse(msg);
            this.ide.recv(cmd, args);
          } catch (e) {
            console.error('Failed to parse message:', e, msg);
          }
        }
      }
    }
    
    disconnect() {
      this.log('Disconnecting');
      
      if (this.socket) {
        // Remove all listeners to prevent memory leaks
        this.socket.removeAllListeners();
        this.socket.end();
        this.socket = null;
      }
      
      if (this.server) {
        this.server.removeAllListeners();
        this.server.close();
        this.server = null;
      }
      
      if (this.child) {
        this.child.removeAllListeners();
        this.child.kill();
        this.child = null;
      }
      
      this.connected = false;
      this.handshakeDone = false;
    }
    
    spawn(exe, args, opts) {
      this.log(`Spawning ${exe}`);
      this.child = cp.spawn(exe, args, opts);
      
      this.child.on('exit', (code, signal) => {
        this.log(`Child process exited: code=${code}, signal=${signal}`);
        this.child = null;
      });
      
      this.child.on('error', (err) => {
        this.log(`Child process error: ${err}`);
        this.ide.handleConnectionError(err);
      });
      
      return this.child;
    }
    
    getAddress() {
      if (this.server) {
        return this.server.address();
      }
      return null;
    }
  };
}