# Document-to-Graph Pipeline

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Neo4j](https://img.shields.io/badge/Neo4j-Graph%20Database-orange.svg)](https://neo4j.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Staging-green.svg)](https://www.mongodb.com/)

**Author:** Amit_Mishra

A production-ready ETL pipeline that converts unstructured business documents (PDF, DOCX, TXT) into Neo4j graph databases. The system uses Large Language Models to extract graph schemas and generate Cypher queries, implementing a staged processing architecture with MongoDB as a staging layer for auditability and resumability.

---

## Overview

This system implements a document-to-graph transformation pipeline that addresses the common problem of converting unstructured business documents into queryable graph structures. The architecture separates concerns into distinct stages: parsing, schema extraction, Cypher generation, and graph ingestion.

The pipeline processes documents through the following stages:

1. **Document Parsing** - Extracts plain text from PDF, DOCX, DOC, and TXT files using LlamaParse (cloud) or local parsers (pdf-parse, mammoth)
2. **Schema Extraction** - Uses an LLM to analyze the full document and extract a graph schema (node types, relationship types, properties) once per document
3. **Cypher Generation** - Generates Neo4j Cypher MERGE statements using fine-tuned text2cypher models, processing either full documents or chunks
4. **Graph Ingestion** - Executes generated Cypher in Neo4j transactions with proper constraint handling and error recovery
5. **Natural Language Querying** - Provides an endpoint to query the graph using natural language, which generates Cypher queries dynamically

---

## Architecture

### System Architecture

```
┌─────────────────┐
│ Business Document│
│ (PDF/DOCX/TXT)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Document Upload │
│   & Parsing      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Text Chunking   │────▶│  Schema Extract  │
│  (Optional)      │     │  (LLM - Once)    │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │  Graph Schema    │
         │              │  (Nodes & Rel.)  │
         │              └────────┬─────────┘
         │                       │
         ▼                       │
┌─────────────────┐             │
│  Cypher Gen.    │◀────────────┘
│  (LLM - Per Chunk)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Neo4j Ingestion │
│  (Transactions) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Graph Database │
│     (Neo4j)     │
└─────────────────┘
```

### Pipeline Flow

```
DOC → Parse → SchemaOnce → [Chunk] → text2cypher → Cypher → Neo4j
```

The pipeline follows a staged processing model:

1. **Upload & Parse** - Documents are uploaded via REST API or file watcher, then parsed into clean text. Supports LlamaParse API for high-quality PDF extraction or falls back to local parsers.

2. **Chunking (Optional)** - Long documents can be split into chunks (default: 1000 words with 100-word overlap). Chunking is optional; the system defaults to processing full documents.

3. **Schema Extraction** - A single LLM call analyzes the entire document to extract the graph schema. This includes:
   - Node types (labels) with their properties
   - Relationship types with directions
   - Property names and types
   
   Schema extraction happens once per document to ensure consistency across all chunks.

4. **Cypher Generation** - For each chunk (or the full document), a text2cypher model generates Cypher MERGE statements. The generated Cypher uses the extracted schema to ensure type consistency.

5. **Neo4j Ingestion** - Generated Cypher is executed in Neo4j transactions. The system creates uniqueness constraints automatically and handles errors with rollback.

### Data Flow

**MongoDB (Staging Layer):**
- `Document` - Metadata, status tracking, timestamps
- `DocumentChunk` - Text chunks with processing status
- `Schema` - Extracted graph schema (nodes and relationships)
- `ChunkCypherResult` - Generated Cypher with execution results
- `PipelineMetrics` - Processing metrics and timing data

**Neo4j (Graph Database):**
- Nodes created from extracted entities
- Relationships created from extracted connections
- Constraints ensure data integrity

---

## Technical Features

### Core Capabilities

- **Multi-Format Document Support** - Handles PDF, DOCX, DOC, and TXT files. Uses LlamaParse API for cloud-based parsing or local parsers (pdf-parse for PDFs, mammoth for DOCX) as fallback.

- **LLM-Based Schema Extraction** - Uses general-purpose LLMs (DeepSeek-R1-Distill or similar) to extract graph schemas. The schema extraction prompt includes the full document text and returns structured JSON defining nodes, relationships, and properties.

- **Text2Cypher Model Integration** - Uses fine-tuned text2cypher models (`tomasonjo/text2cypher-demo-16bit` for Hugging Face or `deepseek-r1:7b` for Ollama) to generate Cypher queries. The model receives the extracted schema as context to ensure generated queries match the schema.

- **Neo4j Integration** - Executes Cypher with proper transaction handling. Creates uniqueness constraints automatically based on schema patterns (e.g., `accountId` for `Account` nodes). Uses MERGE statements for idempotency.

- **Scalable Chunking** - Handles large documents (100+ pages) through configurable chunking with overlap. Default chunk size is 1000 words with 100-word overlap to preserve context at boundaries.

- **Dual LLM Backend** - Supports both Ollama (local LLM runtime) and Hugging Face Inference API. Configuration allows switching providers per stage (schema extraction vs. Cypher generation).

- **MongoDB Staging Layer** - All pipeline stages are persisted in MongoDB for auditability, debugging, and resumability. Failed chunks can be retried without reprocessing the entire document.

- **Natural Language Querying** - Provides a REST endpoint that accepts natural language questions and generates Cypher queries using the document's schema.

### Implementation Details

**Idempotency:** All Cypher generation uses MERGE statements instead of CREATE, allowing safe re-runs without creating duplicate nodes or relationships.

**Error Recovery:** Failed chunks are tracked in MongoDB with error details. The pipeline can be resumed from the point of failure.

**Schema Consistency:** Schema is extracted once per document and reused across all chunks, ensuring consistent node labels, relationship types, and property names.

**Cypher Validation:** Generated Cypher is validated using Neo4j's EXPLAIN command before execution. Syntax errors are caught early.

**Transaction Safety:** Neo4j operations are wrapped in transactions. On error, transactions roll back to maintain database consistency.

**Metrics Collection:** Processing times, success rates, and error counts are tracked per stage and stored in MongoDB for monitoring and optimization.

---

## Installation

### Prerequisites

- **Node.js** 18+ and npm
- **MongoDB** 4.4+ (local installation or MongoDB Atlas)
- **Neo4j** 4.0+ (local installation, Neo4j Aura, or cloud instance)
- **LLM Provider** - Either:
  - Ollama (local) with required models pulled
  - Hugging Face API key

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/EivorRrz/Ai-Agent-01-Amit.git
   cd Ai-Agent-01-Amit
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and LLM credentials
   ```

4. **Setup Neo4j constraints:**
   ```bash
   npm run setup-neo4j
   ```
   This creates uniqueness constraints in Neo4j based on common ID property patterns.

5. **Start the server:**
   ```bash
   npm start
   ```

6. **Test the pipeline:**
   ```bash
   npm test ./path/to/your/document.pdf
   ```

---

## Configuration

### Environment Variables

Create a `.env` file in the root directory. Required and optional variables are documented below.

#### Database Configuration

```env
# MongoDB connection string
# Local: mongodb://localhost:27017/document-graph
# Atlas: mongodb+srv://user:password@cluster.mongodb.net/dbname
MONGODB_URI=mongodb://localhost:27017/document-graph

# Neo4j connection
# Local: bolt://localhost:7687
# Aura: neo4j+ssc://your-instance.databases.neo4j.io
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

**Note:** For Neo4j Aura, use `neo4j+ssc://` protocol instead of `neo4j+s://` to handle self-signed certificates.

#### LLM Configuration

Choose either Ollama (local) or Hugging Face (cloud) for each stage:

```env
# Provider selection: 'ollama' or 'huggingface'
SCHEMA_MODEL_PROVIDER=ollama
CYPHER_MODEL_PROVIDER=ollama

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
SCHEMA_MODEL_OLLAMA=deepseek-r1:7b
TEXT2CYPHER_MODEL_OLLAMA=deepseek-r1:7b
OLLAMA_TIMEOUT_MS=900000

# Hugging Face Configuration
HF_API_KEY=your-huggingface-api-key
SCHEMA_MODEL_HF=deepseek-ai/DeepSeek-R1-Distill-Qwen
TEXT2CYPHER_MODEL_HF=tomasonjo/text2cypher-demo-16bit
HF_TIMEOUT_MS=300000
```

**Model Selection:**
- Schema extraction works well with general-purpose models (DeepSeek-R1-Distill, GPT-3.5, etc.)
- Cypher generation benefits from fine-tuned text2cypher models when available

#### Document Parsing

```env
# LlamaParse API key (optional, improves PDF parsing quality)
LLAMAPARSE_API_KEY=your-llamaparse-api-key

# File upload directory
UPLOAD_DIR=./uploads
```

If `LLAMAPARSE_API_KEY` is not set, the system falls back to local parsers (pdf-parse for PDFs, mammoth for DOCX).

#### Chunking Configuration

```env
# Chunk size in words (only used if chunking is enabled)
CHUNK_SIZE_WORDS=1000
CHUNK_OVERLAP_WORDS=100
```

Chunking is optional. By default, the system processes full documents. Chunking can be enabled per document via the API.

#### Server Configuration

```env
PORT=3000
NODE_ENV=development
```

#### SSL Configuration (Windows)

```env
# Disable SSL verification for Windows certificate store issues
# Only use in development environments
DISABLE_SSL_VERIFICATION=true
NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

## API Reference

### Document Management

#### Upload Document

```http
POST /documents
Content-Type: multipart/form-data

file: <document.pdf>
```

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "filename": "document.pdf",
  "status": "uploaded",
  "uploadTimestamp": "2024-01-01T00:00:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Document uploaded successfully
- `400 Bad Request` - Invalid file type or size
- `500 Internal Server Error` - Server error during upload

#### List Documents

```http
GET /documents
```

Returns an array of all documents with their current status.

#### Get Document Details

```http
GET /documents/:id
```

Returns full document metadata including processing timestamps and error messages if any.

#### Get Processing Status

```http
GET /documents/:id/status
```

Returns detailed pipeline status including:
- Document status (uploaded, parsing, schema_extracted, cypher_generating, completed, error)
- Chunk processing status breakdown
- Schema extraction results (node types, relationship types)
- Cypher generation statistics

**Response:**
```json
{
  "document": {
    "id": "507f1f77bcf86cd799439011",
    "filename": "document.pdf",
    "status": "completed",
    "uploadTimestamp": "2024-01-01T00:00:00.000Z",
    "processingStartedAt": "2024-01-01T00:01:00.000Z",
    "processingCompletedAt": "2024-01-01T00:05:00.000Z"
  },
  "chunks": {
    "total": 5,
    "byStatus": {
      "executed": 5
    }
  },
  "schema": {
    "extracted": true,
    "nodeTypes": 8,
    "relationshipTypes": 12
  },
  "cypher": {
    "generated": 5,
    "total": 5
  }
}
```

#### Process Document

```http
POST /documents/:id/process
```

Starts the full pipeline asynchronously. Returns immediately with status `processing`. The pipeline runs in the background and updates the document status as it progresses.

**Query Parameters:**
- `useLlamaParse` (boolean, optional) - Force use of LlamaParse even if API key not set
- `createNeo4jConstraints` (boolean, optional, default: true) - Create uniqueness constraints
- `useFullDocument` (boolean, optional, default: true) - Process full document vs. chunks

### Natural Language Query

#### Query Graph

```http
POST /query
Content-Type: application/json

{
  "docId": "507f1f77bcf86cd799439011",
  "question": "What are all the companies mentioned?"
}
```

Generates a Cypher query from the natural language question using the document's schema, executes it, and returns results.

**Response:**
```json
{
  "question": "What are all the companies mentioned?",
  "cypher": "MATCH (c:Company) RETURN c.name AS company",
  "results": [
    { "company": "Acme Corp" },
    { "company": "Tech Inc" }
  ],
  "count": 2
}
```

**Status Codes:**
- `200 OK` - Query executed successfully
- `400 Bad Request` - Missing docId or question
- `404 Not Found` - Schema not found for document
- `500 Internal Server Error` - Query generation or execution failed

### Metrics

#### Get Pipeline Metrics

```http
GET /metrics
```

Returns aggregated processing statistics:
- Average processing times per stage
- Success/failure rates per stage
- Total documents processed
- Chunk processing statistics

### Health Check

```http
GET /health
```

Returns server status and database connectivity status.

---

## Project Structure

```
src/
├── server.js                 # Express application entry point
├── config/
│   ├── database.js           # MongoDB and Neo4j connection management
│   └── reference-schema.js   # Example schema structures for reference
├── models/
│   ├── Document.js           # Mongoose schema for document metadata
│   ├── DocumentChunk.js      # Mongoose schema for text chunks
│   ├── Schema.js             # Mongoose schema for extracted graph schemas
│   ├── ChunkCypherResult.js  # Mongoose schema for Cypher generation results
│   └── PipelineMetrics.js    # Mongoose schema for processing metrics
├── services/
│   ├── parsing/
│   │   └── index.js          # Document parsing service (LlamaParse/local)
│   ├── schemaExtraction/
│   │   └── index.js          # Schema extraction service using LLM
│   ├── cypherGeneration/
│   │   └── index.js          # Cypher generation service using text2cypher
│   ├── neo4jIngest/
│   │   └── index.js          # Neo4j ingestion service with transaction handling
│   ├── orchestrator.js       # Pipeline orchestration and coordination
│   └── metrics.js            # Metrics collection and aggregation
├── routes/
│   ├── documents.js          # Document management endpoints
│   ├── query.js              # Natural language query endpoint
│   └── metrics.js            # Metrics endpoint
├── utils/
│   ├── chunking.js           # Text chunking algorithm with overlap
│   ├── llm.js                # LLM client abstraction (Ollama/HuggingFace)
│   ├── logger.js             # Winston logger configuration
│   ├── prompt.js             # Prompt template utilities
│   ├── retry.js              # Retry logic with exponential backoff
│   ├── saveCypher.js         # Cypher file persistence utilities
│   ├── formatCypher.js      # Cypher code formatting and validation
│   └── documentTypeDetector.js # Document type detection logic
└── scripts/
    ├── test-pipeline.js      # End-to-end pipeline test script
    ├── setup-neo4j-constraints.js  # Neo4j constraint creation script
    ├── file-watcher.js       # File system watcher for auto-processing
    ├── check-document-status.js    # Document status inspection script
    ├── check-neo4j-data.js   # Neo4j data inspection utilities
    ├── check-ollama.js       # Ollama connection verification
    └── view-document-cypher.js    # Cypher code viewer utility
```

---

## Usage Examples

### Example 1: Upload and Process via REST API

```bash
# Upload a document
curl -X POST http://localhost:3000/documents \
  -F "file=@business-report.pdf"

# Response includes document ID: {"id": "507f1f77bcf86cd799439011", ...}

# Process the document (async)
curl -X POST http://localhost:3000/documents/507f1f77bcf86cd799439011/process

# Check processing status
curl http://localhost:3000/documents/507f1f77bcf86cd799439011/status

# Query the graph with natural language
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "docId": "507f1f77bcf86cd799439011",
    "question": "Show me all relationships between companies and people"
  }'
```

### Example 2: File Watcher Mode

```bash
# Start the file watcher service
npm run watch

# Drop PDF, DOCX, or TXT files into the watch/ directory
# The system automatically detects and processes them
```

### Example 3: End-to-End Test Script

```bash
# Process a document through the entire pipeline
npm test ./test-docs/sample.pdf

# The script uploads, processes, and displays results
```

---

## Design Decisions

### Why MongoDB for Staging?

MongoDB serves as a staging layer between document upload and Neo4j ingestion for several reasons:

1. **Audit Trail** - Every stage of processing is logged with timestamps, status, and error details. This enables debugging and compliance requirements.

2. **Resumability** - Failed chunks are tracked individually. The pipeline can retry failed chunks without reprocessing the entire document, saving time and API costs.

3. **Metadata Storage** - Parsed text, extracted schemas, and generated Cypher are stored for inspection. This is essential for debugging schema extraction and Cypher generation issues.

4. **Scalability** - Large documents are split into chunks stored separately. This allows processing documents that exceed memory limits.

5. **Queryability** - MongoDB queries enable finding documents by status, date, or other metadata for monitoring and reporting.

### Why Extract Schema Once Per Document?

The schema extraction stage analyzes the full document once and extracts a unified graph schema. This design decision provides:

1. **Consistency** - All chunks use the same schema, ensuring consistent node labels, relationship types, and property names across the entire document.

2. **Efficiency** - One LLM call for schema extraction vs. per-chunk extraction reduces API costs and processing time significantly.

3. **Quality** - Schema extraction benefits from seeing the full document context. Entity types and relationships are more accurately identified when the LLM has complete context.

4. **Reusability** - The extracted schema can be reused for query generation and validation without re-extraction.

### Why MERGE Instead of CREATE?

All generated Cypher uses MERGE statements instead of CREATE:

1. **Idempotency** - The pipeline can be safely re-run without creating duplicate nodes or relationships. This is essential for error recovery and testing.

2. **Data Quality** - MERGE prevents duplicate entities even if the pipeline runs multiple times or if documents contain overlapping information.

3. **Production Readiness** - MERGE is the standard pattern for ETL pipelines in production environments where data may be reprocessed.

### Chunking Strategy

The chunking implementation uses the following approach:

1. **Size** - Default chunk size of 1000 words balances context window size with LLM token limits. Most models handle 1000 words effectively while staying within context limits.

2. **Overlap** - 100-word overlap between chunks prevents context loss at boundaries. Entities or relationships that span chunk boundaries are preserved.

3. **Configurability** - Both chunk size and overlap are configurable via environment variables to adapt to different document types and model capabilities.

4. **Optional** - Chunking is optional. The system defaults to processing full documents, which works well for documents under ~50 pages. Chunking can be enabled per document via API parameters.

---

## Troubleshooting

### MongoDB Connection Issues

**Symptoms:** Connection errors, timeouts, or authentication failures.

**Diagnosis:**
- Verify MongoDB is running: `mongod` (local) or check Atlas cluster status
- Test connection string format: `mongodb://host:port/database` or `mongodb+srv://...` for Atlas
- Check network connectivity and firewall rules
- Review MongoDB logs for authentication errors

**Solutions:**
- Ensure MongoDB service is running
- Verify `MONGODB_URI` in `.env` matches your MongoDB instance
- Check MongoDB user permissions and authentication
- For Atlas, verify IP whitelist includes your IP address

### Neo4j Connection Issues

**Symptoms:** Connection refused, authentication failures, or SSL errors.

**Diagnosis:**
- Test connection: `npm run test-neo4j`
- Check Neo4j service status (local) or Aura instance status (cloud)
- Verify credentials in `.env`

**Solutions:**
- **Local Neo4j:** Ensure Neo4j service is running and accessible on configured port (default: 7687)
- **Neo4j Aura:** Use `neo4j+ssc://` protocol instead of `neo4j+s://` for self-signed certificate handling
- Verify `NEO4J_USER` and `NEO4J_PASSWORD` are correct
- Check Neo4j browser at `http://localhost:7474` (local) to verify connectivity
- Run `npm run setup-neo4j` to test connection and constraint creation

### LLM API Issues

**Ollama:**

**Symptoms:** Connection refused, model not found, or timeout errors.

**Diagnosis:**
- Check Ollama service: `ollama serve` should be running
- List available models: `ollama list`
- Test connection: `node src/scripts/check-ollama.js`

**Solutions:**
- Start Ollama service: `ollama serve`
- Pull required models: `ollama pull deepseek-r1:7b`
- Verify `OLLAMA_BASE_URL` in `.env` (default: `http://localhost:11434`)
- Check model names match exactly (case-sensitive)

**Hugging Face:**

**Symptoms:** Authentication errors, rate limit errors, or model not found.

**Diagnosis:**
- Verify API key is set: `echo $HF_API_KEY` or check `.env`
- Check API status: https://status.huggingface.co/
- Review rate limits in Hugging Face dashboard

**Solutions:**
- Set `HF_API_KEY` in `.env` with a valid token from https://huggingface.co/settings/tokens
- Verify model names are correct (format: `username/model-name`)
- Check API rate limits and upgrade plan if needed
- Monitor Hugging Face status page for outages

### Cypher Generation Issues

**Symptoms:** No Cypher generated, invalid Cypher syntax, or execution failures.

**Diagnosis:**
- Check schema extraction status: `GET /documents/:id/status`
- Review generated Cypher in MongoDB `ChunkCypherResult` collection
- Check application logs for LLM API errors
- Verify text2cypher model is accessible

**Solutions:**
- Ensure schema was extracted successfully before Cypher generation
- Verify text2cypher model name matches configuration
- Check LLM API logs for timeout or rate limit errors
- Review generated Cypher in MongoDB for syntax issues
- Try regenerating Cypher for failed chunks by re-running the pipeline

### Document Parsing Issues

**Symptoms:** Text extraction fails, incomplete text, or parsing errors.

**Diagnosis:**
- Check file format is supported (PDF, DOCX, DOC, TXT)
- Verify file is not corrupted or password-protected
- Check file size (default limit: 100MB)
- Review parsing service logs

**Solutions:**
- **PDFs:** Use LlamaParse for better quality (set `LLAMAPARSE_API_KEY`)
- Verify file is not password-protected or encrypted
- Check file size limits in multer configuration
- For corrupted files, try re-saving the document
- Use local parsers as fallback if LlamaParse fails

---

## Monitoring and Metrics

The system collects comprehensive metrics throughout the pipeline:

- **Processing Times** - Per-stage timing (parsing, schema extraction, Cypher generation, ingestion) stored in `PipelineMetrics` collection
- **Success Rates** - Success/failure counts per stage for monitoring pipeline health
- **Document Completion** - Overall pipeline success rate and average processing time
- **Chunk Statistics** - Chunk processing success rates and timing distributions

Access metrics via:
```bash
GET /metrics
```

Metrics are also stored in MongoDB `PipelineMetrics` collection for historical analysis and alerting.

---

## Development

### Available Scripts

```bash
npm start              # Start Express server
npm run dev            # Start server with auto-reload (nodemon)
npm test <file>        # Run end-to-end pipeline test with document
npm run setup-neo4j    # Create Neo4j uniqueness constraints
npm run test-neo4j     # Test Neo4j connection
npm run watch          # Start file watcher service
npm run check-doc      # Check document processing status
```

### Running Tests

```bash
# Test pipeline with a document
npm test ./test-docs/sample.pdf

# Test Neo4j connection
npm run test-neo4j

# Test Ollama connection
node src/scripts/check-ollama.js
```

### Development Workflow

1. Start MongoDB and Neo4j services
2. Start Ollama service (if using local LLM)
3. Configure `.env` with database and LLM credentials
4. Run `npm run setup-neo4j` to initialize constraints
5. Start development server: `npm run dev`
6. Upload test documents via API or file watcher
7. Monitor logs and MongoDB collections for debugging

---

## Additional Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system architecture and component design
- **[Documentation.md](./Documentation.md)** - Complete process flow documentation

---

## Contributing

Contributions are welcome. Please submit pull requests with clear descriptions of changes and ensure all tests pass.

---


## Acknowledgments

- **Neo4j** - Graph database platform and Cypher query language
- **LlamaParse** - High-quality document parsing API
- **Hugging Face** - LLM inference API and model hosting
- **Ollama** - Local LLM runtime for offline processing
- **text2cypher** - Fine-tuned Cypher generation models

---

## Support

For issues, questions, or contributions:
- Open an issue on GitHub: https://github.com/EivorRrz/Ai-Agent-01-Amit/issues
- Review the troubleshooting section above
- Check the architecture documentation for system design details
