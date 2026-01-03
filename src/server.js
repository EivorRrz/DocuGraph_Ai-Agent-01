/**
 * Express server entry point
 * Document-to-Graph Pipeline API
 */

import express from 'express';
import dotenv from 'dotenv';
import { connectMongoDB, getNeo4jDriver } from './config/database.js';
import { logger } from './utils/logger.js';
import documentsRouter from './routes/documents.js';
import queryRouter from './routes/query.js';
import metricsRouter from './routes/metrics.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/documents', documentsRouter);
app.use('/query', queryRouter);
app.use('/metrics', metricsRouter);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path
  });
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize databases and start server
async function start() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    
    // Initialize Neo4j driver (verify connectivity)
    getNeo4jDriver();
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`, {
        env: process.env.NODE_ENV || 'development',
        mongo: process.env.MONGODB_URI ? 'connected' : 'not configured',
        neo4j: process.env.NEO4J_URI ? 'connected' : 'not configured'
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

start();

