const { WebSocketServer } = require('ws');

class EventService {
  constructor() {
    this.sseClients = new Set();
    this.wsServer = null;
    this.wsClients = new Set();
  }

  /**
   * Attach WebSocket server to existing HTTP server
   */
  initWebSocket(httpServer) {
    this.wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });

    this.wsServer.on('connection', (socket, req) => {
      this.wsClients.add(socket);
      console.log(`[WS] Client connected. Total WS clients: ${this.wsClients.size}`);

      // Send initial welcome/heartbeat
      socket.send(JSON.stringify({
        type: 'connection:established',
        timestamp: new Date().toISOString(),
        message: 'Connected to ClaimLens Real-Time Event Stream',
      }));

      socket.on('close', () => {
        this.wsClients.delete(socket);
        console.log(`[WS] Client disconnected. Total WS clients: ${this.wsClients.size}`);
      });

      socket.on('error', (err) => {
        console.error('[WS] Socket error:', err.message);
        this.wsClients.delete(socket);
      });
    });
  }

  /**
   * Register a new SSE subscriber response object
   */
  addSseClient(res) {
    this.sseClients.add(res);
    console.log(`[SSE] Client connected. Total SSE clients: ${this.sseClients.size}`);

    // Send initial handshake event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to ClaimLens SSE Stream', timestamp: new Date().toISOString() })}\n\n`);

    res.on('close', () => {
      this.sseClients.delete(res);
      console.log(`[SSE] Client disconnected. Total SSE clients: ${this.sseClients.size}`);
    });
  }

  /**
   * Broadcast an event to all connected SSE and WebSocket clients
   */
  broadcast(eventType, payload) {
    const timestamp = new Date().toISOString();
    const eventData = {
      type: eventType,
      timestamp,
      data: payload,
    };

    const messageString = JSON.stringify(eventData);

    // 1. Broadcast to SSE clients
    for (const client of this.sseClients) {
      try {
        client.write(`event: ${eventType}\ndata: ${messageString}\n\n`);
      } catch (err) {
        console.error('[SSE] Error sending to client:', err.message);
        this.sseClients.delete(client);
      }
    }

    // 2. Broadcast to WebSocket clients
    for (const ws of this.wsClients) {
      try {
        if (ws.readyState === 1) { // OPEN
          ws.send(messageString);
        }
      } catch (err) {
        console.error('[WS] Error sending to socket:', err.message);
        this.wsClients.delete(ws);
      }
    }

    console.log(`[RealTime] Broadcast event '${eventType}' to ${this.sseClients.size} SSE and ${this.wsClients.size} WS clients.`);
  }

  getSubscriberCounts() {
    return {
      sse: this.sseClients.size,
      ws: this.wsClients.size,
      total: this.sseClients.size + this.wsClients.size,
    };
  }
}

const eventService = new EventService();
module.exports = eventService;
