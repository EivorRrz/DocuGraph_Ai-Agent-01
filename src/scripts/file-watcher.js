/**
 * File Watcher Script
 * Monitors a folder and automatically processes files when dropped
 * 
 * Usage: node src/scripts/file-watcher.js
 */

// IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Set NODE_TLS_REJECT_UNAUTHORIZED early if DISABLE_SSL_VERIFICATION is set
// This must be done before any HTTPS requests are made
if (process.env.DISABLE_SSL_VERIFICATION === 'true' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { connectMongoDB, getNeo4jDriver } from '../config/database.js';
import Document from '../models/Document.js';
import { runPipeline } from '../services/orchestrator.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCH_FOLDER = process.env.WATCH_FOLDER || path.join(process.cwd(), 'watch');
const PROCESSED_FOLDER = path.join(WATCH_FOLDER, 'processed');
const ERROR_FOLDER = path.join(WATCH_FOLDER, 'error');

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Get MIME type from file extension
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if file is valid for processing
 */
async function isValidFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    
    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      logger.warn('File too large', { filePath, size: stats.size });
      return false;
    }
    
    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      logger.warn('Invalid file type', { filePath, ext });
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error checking file', { filePath, error: error.message });
    return false;
  }
}

/**
 * Move file to processed or error folder
 */
async function moveFile(filePath, success) {
  try {
    const filename = path.basename(filePath);
    const destFolder = success ? PROCESSED_FOLDER : ERROR_FOLDER;
    const destPath = path.join(destFolder, filename);
    
    // Ensure destination folder exists
    await fs.mkdir(destFolder, { recursive: true });
    
    // Move file
    await fs.rename(filePath, destPath);
    logger.info('File moved', { from: filePath, to: destPath, success });
  } catch (error) {
    logger.error('Error moving file', { filePath, error: error.message });
  }
}

/**
 * Process a file
 */
async function processFile(filePath) {
  const filename = path.basename(filePath);
  logger.info('Processing file', { filePath, filename });

  try {
    // Validate file
    if (!(await isValidFile(filePath))) {
      await moveFile(filePath, false);
      return;
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    const mimetype = getMimeType(filename);

    // Create document record
    const doc = new Document({
      filename,
      mimetype,
      size: stats.size,
      filePath,
      status: 'uploaded'
    });

    await doc.save();
    logger.info('Document created', { docId: doc._id, filename });

    // Run pipeline
    logger.info('Starting pipeline', { docId: doc._id });
    const result = await runPipeline(doc._id.toString(), {
      useLlamaParse: !!process.env.LLAMAPARSE_API_KEY,
      createNeo4jConstraints: true
    });

    logger.info('Pipeline completed', { 
      docId: doc._id, 
      filename,
      result 
    });

    // Move to processed folder
    await moveFile(filePath, true);

  } catch (error) {
    logger.error('Error processing file', { 
      filePath, 
      error: error.message,
      stack: error.stack
    });
    
    // Move to error folder
    await moveFile(filePath, false);
  }
}

/**
 * Initialize folders
 */
async function initializeFolders() {
  try {
    await fs.mkdir(WATCH_FOLDER, { recursive: true });
    await fs.mkdir(PROCESSED_FOLDER, { recursive: true });
    await fs.mkdir(ERROR_FOLDER, { recursive: true });
    logger.info('Folders initialized', { 
      watch: WATCH_FOLDER,
      processed: PROCESSED_FOLDER,
      error: ERROR_FOLDER
    });
  } catch (error) {
    logger.error('Error initializing folders', { error: error.message });
    throw error;
  }
}

/**
 * Process existing files in watch folder
 */
async function processExistingFiles() {
  try {
    const files = await fs.readdir(WATCH_FOLDER);
    const filePaths = [];

    for (const file of files) {
      const filePath = path.join(WATCH_FOLDER, file);
      try {
        const stats = await fs.stat(filePath);
        // Only process files (not directories) and skip hidden files
        if (stats.isFile() && !file.startsWith('.')) {
          filePaths.push(filePath);
        }
      } catch (error) {
        // Skip files that can't be accessed
        logger.debug('Skipping file', { filePath, error: error.message });
      }
    }

    logger.info('Found existing files', { count: filePaths.length });

    for (const filePath of filePaths) {
      await processFile(filePath);
    }
  } catch (error) {
    logger.error('Error processing existing files', { error: error.message });
  }
}

/**
 * Start file watcher
 */
async function startWatcher() {
  try {
    // Connect to databases
    await connectMongoDB();
    getNeo4jDriver();

    // Initialize folders
    await initializeFolders();

    logger.info('File watcher started', { watchFolder: WATCH_FOLDER });
    console.log('\n========================================');
    console.log('📁 File Watcher Active');
    console.log('========================================');
    console.log(`Watch Folder: ${WATCH_FOLDER}`);
    console.log(`Processed Folder: ${PROCESSED_FOLDER}`);
    console.log(`Error Folder: ${ERROR_FOLDER}`);
    console.log('\nDrop files into the watch folder to process them automatically!');
    console.log('Press Ctrl+C to stop\n');

    // Process existing files
    await processExistingFiles();

    // Watch for new files
    const watcher = chokidar.watch(WATCH_FOLDER, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2 seconds after file stops changing
        pollInterval: 100
      }
    });

    watcher
      .on('add', async (filePath) => {
        try {
          // Only process files directly in watch folder (not subfolders)
          const fileDir = path.dirname(filePath);
          const normalizedFileDir = path.normalize(fileDir);
          const normalizedWatchFolder = path.normalize(WATCH_FOLDER);
          
          if (normalizedFileDir === normalizedWatchFolder) {
            // Skip .gitkeep and other hidden files
            const filename = path.basename(filePath);
            if (filename.startsWith('.')) {
              return;
            }
            
            logger.info('New file detected', { filePath, filename });
            await processFile(filePath);
          }
        } catch (error) {
          logger.error('Error processing detected file', { filePath, error: error.message });
        }
      })
      .on('error', (error) => {
        logger.error('Watcher error', { error: error.message });
      });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Stopping file watcher...');
      await watcher.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Stopping file watcher...');
      await watcher.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start file watcher', { error: error.message });
    process.exit(1);
  }
}

startWatcher();

