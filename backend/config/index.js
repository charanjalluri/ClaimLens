const path = require('path');
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8001',
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '35000', 10),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'claimlens.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`,
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
