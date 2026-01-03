/**
 * Database connection configuration
 * MongoDB (Mongoose) for staging/audit
 * Neo4j for graph storage
 */

import mongoose from 'mongoose';
import neo4j from 'neo4j-driver';
import { logger } from '../utils/logger.js';

// MongoDB connection
let mongoClient = null;

export async function connectMongoDB() {
  if (mongoClient) {
    return mongoClient;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/document-graph-pipeline';

  try {
    mongoClient = await mongoose.connect(uri);
    logger.info('MongoDB connected', { uri: uri.replace(/\/\/.*@/, '//***@') });
    return mongoClient;
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    throw error;
  }
}

// Neo4j connection
let neo4jDriver = null;

export function getNeo4jDriver() {
  if (neo4jDriver) {
    return neo4jDriver;
  }

  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD;

  if (!password) {
    throw new Error('NEO4J_PASSWORD environment variable is required');
  }

  // Debug logging
  logger.info('Neo4j connection attempt', {
    uri: uri.substring(0, 50) + '...',
    user,
    passwordSet: !!password
  });

  // For Neo4j Aura, we need to handle the connection differently
  // Aura uses neo4j+s:// or neo4j+ssc:// protocols (encryption is in URL)
  const driverConfig = {
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
  };

  // For Neo4j Aura, try neo4j+ssc:// if neo4j+s:// fails (self-signed certificate)
  // Some Aura instances require ssc:// protocol
  let actualUri = uri;
  if (uri.startsWith('neo4j+s://')) {
    // Try ssc:// first as it's more compatible with Aura
    actualUri = uri.replace('neo4j+s://', 'neo4j+ssc://');
    logger.info('Using neo4j+ssc:// protocol for Aura', { uri: actualUri.substring(0, 50) + '...' });
  }

  neo4jDriver = neo4j.driver(actualUri, neo4j.auth.basic(user, password), driverConfig);

  // Verify connectivity with better error handling
  neo4jDriver.verifyConnectivity()
    .then(() => {
      logger.info('Neo4j connected successfully', { uri: actualUri.substring(0, 50) + '...' });
    })
    .catch((error) => {
      logger.error('Neo4j connection error', {
        error: error.message,
        uri: actualUri.substring(0, 50) + '...',
        hint: 'If using Aura, ensure NEO4J_URI uses neo4j+ssc:// protocol'
      });
    });

  return neo4jDriver;
}

export function getNeo4jSession(mode = neo4j.session.READ) {
  const driver = getNeo4jDriver();
  return driver.session({ defaultAccessMode: mode });
}

export async function closeConnections() {
  if (mongoClient) {
    await mongoose.disconnect();
    mongoClient = null;
    logger.info('MongoDB disconnected');
  }

  if (neo4jDriver) {
    await neo4jDriver.close();
    neo4jDriver = null;
    logger.info('Neo4j disconnected');
  }
}

