const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const db = require('./db/database');
const eventService = require('./services/eventService');
const aiService = require('./services/aiService');

const claimRoutes = require('./routes/claimRoutes');
const conflictRoutes = require('./routes/conflictRoutes');
const eventRoutes = require('./routes/eventRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// 1. Basic Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 2. Static Asset Hosting
app.use('/uploads', express.static(config.uploadDir));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// 3. Health Check
const healthHandler = async (req, res) => {
  const aiHealth = await aiService.checkHealth();
  const stats = await db.getStats();

  res.json({
    status: 'healthy',
    service: 'ClaimLens Backend & Database Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      engine: 'SQLite (WASM)',
      claimsCount: stats.totalClaims,
      conflictsCount: stats.totalConflicts,
    },
    aiService: {
      url: config.aiServiceUrl,
      reachable: aiHealth.reachable,
      details: aiHealth.data || { error: aiHealth.error },
    },
    realtime: eventService.getSubscriberCounts(),
  });
};

app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// 4. API Routes (Supporting both /api/v1/* and direct /* aliases)
app.use('/api/v1/claims', claimRoutes);
app.use('/claims', claimRoutes);

app.use('/api/v1/conflicts', conflictRoutes);
app.use('/conflicts', conflictRoutes);

app.use('/api/v1/events', eventRoutes);
app.use('/events', eventRoutes);

// Direct stats alias
const statsHandler = async (req, res) => {
  const stats = await db.getStats();
  res.json({
    ...stats,
    realTimeSubscribers: eventService.getSubscriberCounts(),
  });
};
app.get('/stats', statsHandler);
app.get('/api/v1/stats', statsHandler);

// 5. Initialize WebSocket Server for Real-Time streaming
eventService.initWebSocket(server);

// 6. Error Handlers
app.use(errorHandler);

// Only listen if executed directly (allows test runner to import app)
if (require.main === module) {
  (async () => {
    await db.init();
    server.listen(config.port, config.host, () => {
      console.log('='.repeat(60));
      console.log(`  ClaimLens Backend Service (Agent 2)`);
      console.log(`  HTTP Server   : http://localhost:${config.port}`);
      console.log(`  Dashboard     : http://localhost:${config.port}/dashboard`);
      console.log(`  WebSocket     : ws://localhost:${config.port}/ws`);
      console.log(`  SSE Feed      : http://localhost:${config.port}/api/v1/events`);
      console.log(`  AI Service    : ${config.aiServiceUrl}`);
      console.log(`  Database      : ${config.dbPath}`);
      console.log('='.repeat(60));
    });
  })();
}

module.exports = { app, server };
