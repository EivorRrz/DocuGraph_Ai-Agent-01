/**
 * Utility to save generated Cypher to files
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

const CYPHER_OUTPUT_DIR = process.env.CYPHER_OUTPUT_DIR || './cypher-output';

/**
 * Ensure Cypher output directory exists
 */
async function ensureCypherOutputDir() {
  try {
    await fs.mkdir(CYPHER_OUTPUT_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create Cypher output directory', { error: error.message });
    throw error;
  }
}

/**
 * Save Cypher results to files
 * @param {string} docId - Document ID
 * @param {string} filename - Original document filename
 * @param {Array} cypherResults - Array of Cypher result documents
 * @returns {Promise<string>} - Path to the saved file
 */
export async function saveCypherToFile(docId, filename, cypherResults) {
  try {
    await ensureCypherOutputDir();
    
    // Create a safe filename from the original document name
    const safeFilename = filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.[^/.]+$/, ''); // Remove extension
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outputFilename = `${safeFilename}_${docId}_${timestamp}.cypher`;
    const outputPath = path.join(CYPHER_OUTPUT_DIR, outputFilename);
    
    // Combine all Cypher statements
    // Check if this is a full document (single result with no chunkId) or chunked
    const isFullDocument = cypherResults.length === 1 && !cypherResults[0].chunkId;
    
    let combinedCypher = `-- Generated Cypher for: ${filename}\n`;
    combinedCypher += `-- Document ID: ${docId}\n`;
    combinedCypher += `-- Generated at: ${new Date().toISOString()}\n\n`;
    
    if (isFullDocument) {
      // Full document - output complete Cypher
      combinedCypher += cypherResults[0].generatedCypher;
    } else {
      // Chunked mode - combine all chunks
      cypherResults.forEach((result, index) => {
        if (result.error) {
          combinedCypher += `-- ERROR in result ${index + 1}: ${result.error}\n\n`;
        } else {
          combinedCypher += `${result.generatedCypher}\n\n`;
        }
      });
    }
    
    // Final cleanup: Ensure NO HTML entities remain before saving
    combinedCypher = combinedCypher.replace(/-&gt;/g, '->');
    combinedCypher = combinedCypher.replace(/-&lt;/g, '<-');
    combinedCypher = combinedCypher.replace(/&gt;/g, '>');
    combinedCypher = combinedCypher.replace(/&lt;/g, '<');
    combinedCypher = combinedCypher.replace(/&amp;gt;/g, '>');
    combinedCypher = combinedCypher.replace(/&amp;lt;/g, '<');
    
    // Save to file
    await fs.writeFile(outputPath, combinedCypher, 'utf-8');
    
    logger.info('Cypher saved to file', { 
      docId, 
      filename: outputFilename, 
      path: outputPath,
      isFullDocument: isFullDocument
    });
    
    return outputPath;
  } catch (error) {
    logger.error('Failed to save Cypher to file', { 
      docId, 
      filename, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Get the Cypher output directory path
 * @returns {string} - Path to Cypher output directory
 */
export function getCypherOutputDir() {
  return CYPHER_OUTPUT_DIR;
}

