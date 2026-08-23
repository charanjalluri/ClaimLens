const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');
const db = require('../db/database');

// SSE stream for real-time updates: GET /api/v1/events & GET /events
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  eventService.addSseClient(res);
});

// GET /api/v1/stats & GET /stats
router.get('/stats', async (req, res) => {
  const stats = await db.getStats();
  const subStats = eventService.getSubscriberCounts();
  res.json({
    ...stats,
    realTimeSubscribers: subStats,
  });
});

module.exports = router;
