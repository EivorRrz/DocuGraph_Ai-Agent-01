/**
 * LLM client abstraction layer
 * Supports both Ollama (local) and Hugging Face (cloud) APIs
 */

// CRITICAL: Disable SSL verification FIRST, before any imports that might make HTTPS requests
// This fixes Windows certificate store issues
if (process.env.DISABLE_SSL_VERIFICATION === 'true' || 
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
    !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  // Default to disabled for development (Windows compatibility)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import axios from 'axios';
import https from 'https';
import { logger } from './logger.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const HF_API_KEY = process.env.HF_API_KEY;
// Hugging Face Inference API endpoint
// Note: router.huggingface.co may use different format, fallback to old endpoint if router fails
const HF_INFERENCE_API_URL = process.env.HF_INFERENCE_API_URL || 'https://api-inference.huggingface.co';
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || '900000'); // 15 minutes default
const HF_TIMEOUT = parseInt(process.env.HF_TIMEOUT_MS || '300000'); // 5 minutes default

// Create HTTPS agent with SSL verification disabled (Windows compatibility)
// This is set at module load time to ensure it's available immediately
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Disabled for Windows SSL certificate issues
  keepAlive: true
});

logger.info('HTTPS Agent configured with SSL verification disabled for Windows compatibility');

/**
 * Check if Ollama is available and model exists
 */
async function checkOllamaModel(model) {
  try {
    const listUrl = `${OLLAMA_BASE_URL}/api/tags`;
    const response = await axios.get(listUrl, { timeout: 5000 });
    
    if (response.data && response.data.models) {
      const modelNames = response.data.models.map(m => m.name);
      const modelExists = modelNames.some(name => name === model || name.startsWith(`${model}:`));
      
      if (!modelExists) {
        const availableModels = modelNames.slice(0, 10).join(', ');
        throw new Error(
          `Model "${model}" not found in Ollama. ` +
          `Available models: ${availableModels}${modelNames.length > 10 ? '...' : ''}. ` +
          `To install: ollama pull ${model}`
        );
      }
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to Ollama at ${OLLAMA_BASE_URL}. ` +
        `Make sure Ollama is running: ollama serve`
      );
    }
    // Re-throw if it's our custom error (model not found)
    if (error.message && error.message.includes('not found in Ollama')) {
      throw error;
    }
    // If check fails for other reasons, continue anyway - the actual API call will provide better error
  }
}

/**
 * Call Ollama API
 */
async function callOllama(model, prompt, systemPrompt = null, options = {}) {
  const url = `${OLLAMA_BASE_URL}/api/generate`;
  
  const payload = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options.temperature || 0.1,
      top_p: options.top_p || 0.9,
      ...options
    }
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  try {
    // Check if model exists before making the call
    await checkOllamaModel(model);
    
    // Use timeout from options or default
    const timeout = options.timeout || OLLAMA_TIMEOUT;
    
    logger.info(`Calling Ollama model: ${model}`, { 
      url, 
      model,
      timeoutMs: timeout,
      timeoutMinutes: Math.round(timeout / 60000)
    });
    
    const response = await axios.post(url, payload, {
      timeout: timeout
    });

    if (response.data && response.data.response) {
      return response.data.response.trim();
    }
    throw new Error('Invalid Ollama response format');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const errorMsg = `Model "${model}" not found in Ollama. ` +
        `Make sure Ollama is running and the model is installed: ollama pull ${model}`;
      logger.error('Ollama API error', { 
        error: errorMsg, 
        model,
        status: error.response.status,
        url: OLLAMA_BASE_URL
      });
      throw new Error(errorMsg);
    }
    
    if (error.code === 'ECONNREFUSED') {
      const errorMsg = `Cannot connect to Ollama at ${OLLAMA_BASE_URL}. ` +
        `Make sure Ollama is running: ollama serve`;
      logger.error('Ollama connection error', { 
        error: errorMsg, 
        model,
        url: OLLAMA_BASE_URL
      });
      throw new Error(errorMsg);
    }
    
    // Handle timeout specifically
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      const timeoutMinutes = Math.round((options.timeout || OLLAMA_TIMEOUT) / 60000);
      const errorMsg = `Ollama request timed out after ${timeoutMinutes} minutes. ` +
        `The model "${model}" is taking too long to respond. ` +
        `Consider using a smaller model (e.g., deepseek-r1:7b) or increasing OLLAMA_TIMEOUT_MS in .env`;
      logger.error('Ollama timeout error', { 
        error: errorMsg, 
        model,
        timeoutMs: options.timeout || OLLAMA_TIMEOUT,
        url: OLLAMA_BASE_URL
      });
      throw new Error(errorMsg);
    }
    
    logger.error('Ollama API error', { 
      error: error.message, 
      model,
      status: error.response?.status,
      url: OLLAMA_BASE_URL
    });
    throw error;
  }
}

/**
 * Call Hugging Face Inference API
 */
async function callHuggingFace(model, prompt, systemPrompt = null, options = {}) {
  // Try old endpoint first (may still work despite deprecation warning)
  // If it returns 410, we'll handle it in the error handler
  const url = `${HF_INFERENCE_API_URL}/models/${model}`;
  
  // Re-read from process.env in case it was loaded after module initialization
  const apiKey = process.env.HF_API_KEY || HF_API_KEY;
  if (!apiKey) {
    throw new Error('HF_API_KEY not configured. Make sure it is set in your .env file and the application was restarted.');
  }

  // Combine system and user prompts
  let fullPrompt = prompt;
  if (systemPrompt) {
    fullPrompt = `${systemPrompt}\n\n${prompt}`;
  }

  const payload = {
    inputs: fullPrompt,
    parameters: {
      temperature: options.temperature || 0.1,
      max_new_tokens: options.max_new_tokens || 2048,
      return_full_text: false,
      ...options
    }
  };

  // Use timeout from options or default (define outside try block for catch block access)
  const timeout = options.timeout || HF_TIMEOUT;

  try {
    
    logger.info(`Calling Hugging Face model: ${model}`, { 
      model,
      timeoutMs: timeout,
      timeoutMinutes: Math.round(timeout / 60000)
    });
    
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: timeout,
      httpsAgent: httpsAgent
    });

    logger.info('Hugging Face response received', { 
      model,
      responseType: typeof response.data,
      isArray: Array.isArray(response.data),
      dataKeys: response.data && typeof response.data === 'object' ? Object.keys(response.data) : null,
      responsePreview: JSON.stringify(response.data).substring(0, 300)
    });

    if (Array.isArray(response.data) && response.data[0] && response.data[0].generated_text) {
      const generatedText = response.data[0].generated_text.trim();
      logger.debug('Extracted generated_text from array response', { 
        model,
        textLength: generatedText.length,
        preview: generatedText.substring(0, 200)
      });
      return generatedText;
    }
    if (typeof response.data === 'string') {
      logger.debug('Response is string', { model, textLength: response.data.length });
      return response.data.trim();
    }
    
    logger.error('Invalid Hugging Face response format', { 
      model,
      responseData: JSON.stringify(response.data).substring(0, 500)
    });
    throw new Error('Invalid Hugging Face response format');
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      logger.error('Hugging Face API error', { 
        status,
        statusText: error.response.statusText,
        data: errorData,
        model,
        url
      });

      // Handle 410 Gone (deprecated endpoint) - try router endpoint as fallback
      if (status === 410) {
        logger.warn('Old Hugging Face endpoint deprecated (410), trying router endpoint...', { model });
        // Try different endpoint formats
        // Router endpoint might use different format - try multiple variations
        const routerUrls = [
          `https://api-inference.huggingface.co/models/${model}`, // Try old endpoint first (might still work despite 410)
          `https://router.huggingface.co/models/${model}`, // Router with /models/ path
          `https://router.huggingface.co/${model}` // Router without /models/ path
        ];
        
        let lastError = null;
        for (let i = 0; i < routerUrls.length; i++) {
          const routerUrl = routerUrls[i];
          try {
            logger.info('Trying router URL', { url: routerUrl, model, attempt: i + 1 });
            const retryResponse = await axios.post(routerUrl, payload, {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: timeout,
              httpsAgent: httpsAgent
            });
            logger.info('Router endpoint successful', { url: routerUrl, model });
            // Process router response same as normal response
            if (Array.isArray(retryResponse.data) && retryResponse.data[0] && retryResponse.data[0].generated_text) {
              return retryResponse.data[0].generated_text.trim();
            }
            if (typeof retryResponse.data === 'string') {
              return retryResponse.data.trim();
            }
            // If we get here, response format is unexpected but not an error - try to extract text
            logger.warn('Unexpected router response format', { 
              url: routerUrl, 
              dataType: typeof retryResponse.data,
              dataKeys: retryResponse.data && typeof retryResponse.data === 'object' ? Object.keys(retryResponse.data) : null
            });
            throw new Error('Invalid router response format');
          } catch (routerError) {
            lastError = routerError;
            const isLastAttempt = i === routerUrls.length - 1;
            const status = routerError.response?.status;
            
            logger.warn('Router URL attempt failed', { 
              url: routerUrl, 
              status,
              error: routerError.message,
              isLastAttempt
            });
            
            // If not 404 or if it's the last attempt, break and throw
            if (status !== 404 || isLastAttempt) {
              break;
            }
            // Otherwise continue to next URL
          }
        }
        
        // All attempts failed
        logger.error('All router endpoints failed', { 
          model, 
          lastError: lastError?.response?.status || lastError?.message,
          attemptedUrls: routerUrls
        });
        throw new Error(`Hugging Face API endpoints failed. Old endpoint deprecated (410), all router endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
      }

      // Provide helpful error messages based on status codes
      if (status === 401 || status === 403) {
        throw new Error(`Hugging Face API authentication failed (${status}). Check your HF_API_KEY in .env file.`);
      } else if (status === 503) {
        const estimatedTime = errorData?.estimated_time || 'unknown';
        throw new Error(`Hugging Face model is loading. Estimated wait time: ${estimatedTime} seconds. Please retry in a moment.`);
      } else if (status === 404) {
        throw new Error(`Hugging Face model "${model}" not found. Check the model name is correct.`);
      } else if (status === 429) {
        throw new Error('Hugging Face API rate limit exceeded. Please wait before retrying.');
      } else {
        throw new Error(`Hugging Face API error (${status}): ${JSON.stringify(errorData)}`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to Hugging Face API. Check your internet connection.`);
    } else {
      logger.error('Hugging Face request error', { 
        error: error.message,
        code: error.code,
        model
      });
      throw error;
    }
  }
}

/**
 * Unified LLM call interface
 * @param {string} provider - 'ollama' or 'huggingface'
 * @param {string} model - Model name/identifier
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - Optional system prompt
 * @param {object} options - Additional options (temperature, timeout, etc.)
 */
export async function callLLM(provider, model, prompt, systemPrompt = null, options = {}) {
  if (provider === 'ollama') {
    return await callOllama(model, prompt, systemPrompt, options);
  } else if (provider === 'huggingface') {
    // Extract timeout for HF (use HF_TIMEOUT if not specified)
    const hfOptions = { ...options };
    if (!hfOptions.timeout) {
      hfOptions.timeout = HF_TIMEOUT;
    }
    return await callHuggingFace(model, prompt, systemPrompt, hfOptions);
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Extract JSON from LLM response (handles markdown code blocks, etc.)
 */
export function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a string');
  }

  let cleanedText = text.trim();

  // Method 1: Extract from markdown code blocks (```json ... ```)
  // Handle both ```json and ``` code blocks
  const codeBlockPatterns = [
    /```json\s*([\s\S]*?)\s*```/i,  // ```json ... ```
    /```\s*([\s\S]*?)\s*```/,        // ``` ... ```
  ];

  for (const pattern of codeBlockPatterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      try {
        const jsonText = match[1].trim();
        // Find the JSON object within the extracted text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Continue to next method
      }
    }
  }

  // Method 2: Find JSON object directly (handles incomplete code blocks)
  // Remove any leading markdown code block markers
  cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, '');
  cleanedText = cleanedText.replace(/\s*```$/i, '');
  
  // Try to find JSON object
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Try to fix common issues
      let jsonStr = jsonMatch[0];
      
      // Remove trailing commas before closing braces/brackets
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      
      // Try parsing again
      try {
        return JSON.parse(jsonStr);
      } catch (e2) {
        // Fall through to next method
      }
    }
  }

  // Method 3: Try parsing the whole cleaned text
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    // Method 4: Try to extract and fix incomplete JSON
    // Find the first { and try to balance braces
    const firstBrace = cleanedText.indexOf('{');
    if (firstBrace !== -1) {
      let braceCount = 0;
      let jsonEnd = firstBrace;
      
      for (let i = firstBrace; i < cleanedText.length; i++) {
        if (cleanedText[i] === '{') braceCount++;
        if (cleanedText[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
      
      if (braceCount === 0) {
        try {
          const extractedJson = cleanedText.substring(firstBrace, jsonEnd);
          return JSON.parse(extractedJson);
        } catch (e) {
          // Last attempt: try to fix trailing commas
          try {
            const fixedJson = cleanedText.substring(firstBrace, jsonEnd).replace(/,(\s*[}\]])/g, '$1');
            return JSON.parse(fixedJson);
          } catch (e2) {
            // Give up
          }
        }
      }
    }
    
    throw new Error(`Failed to extract JSON from LLM response: ${e.message}. Response preview: ${text.substring(0, 500)}`);
  }
}

/**
 * Extract Cypher from LLM response (removes markdown, explanations, etc.)
 */
export function extractCypher(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove markdown code blocks
  let cypher = text.replace(/```(?:cypher)?\s*/g, '').replace(/```/g, '').trim();
  
  // Fix HTML entities FIRST - before any other processing
  cypher = cypher.replace(/-&gt;/g, '->');
  cypher = cypher.replace(/-&lt;/g, '<-');
  cypher = cypher.replace(/&gt;/g, '>');
  cypher = cypher.replace(/&lt;/g, '<');
  
  // Remove common prefixes/suffixes
  cypher = cypher.replace(/^(Here's|Here is|The cypher|Cypher query|Query):\s*/i, '');
  cypher = cypher.replace(/\s*(This query|The query|This cypher).*$/is, '');
  
  // Extract only lines that look like Cypher (contain keywords or patterns)
  const lines = cypher.split('\n');
  const cypherLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('--')) {
      return false;
    }
    // Keep lines with Cypher keywords or that look like statements
    return /^\s*(MERGE|CREATE|MATCH|SET|RETURN|WITH|WHERE|UNWIND|FOREACH)/i.test(trimmed) ||
           trimmed.includes('(') || trimmed.includes('[') || trimmed.includes('{');
  });

  const extracted = cypherLines.join('\n').trim();
  
  // If filtering removed everything but original had content, return cleaned original
  // (less aggressive filtering - might contain valid Cypher that doesn't match patterns)
  if (!extracted && cypher.length > 0 && cypher.length < 10000) {
    // Return cleaned text if it's reasonably short (might be valid Cypher)
    return cypher;
  }

  return extracted;
}

