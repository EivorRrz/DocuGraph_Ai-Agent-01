# 🤖 AI-Powered Document-to-Graph Pipeline

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Neo4j](https://img.shields.io/badge/Neo4j-Graph%20Database-orange.svg)](https://neo4j.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Staging-green.svg)](https://www.mongodb.com/)

> **Transform business documents into intelligent graph databases automatically**

An end-to-end AI-powered system that parses business documents (PDF, DOCX, TXT), extracts entities and relationships using Large Language Models, and automatically generates Neo4j graph databases with proper schemas and constraints.

---

## 🎯 What It Does

This system automates the entire process of converting unstructured business documents into structured graph databases:

1. **📄 Document Parsing** - Extracts clean text from PDF, DOCX, and TXT files
2. **🧠 Schema Extraction** - AI analyzes documents to identify entities, relationships, and properties
3. **💻 Cypher Generation** - Automatically generates Neo4j Cypher queries using fine-tuned models
4. **🗄️ Graph Ingestion** - Executes queries with proper transactions, constraints, and error handling
5. **🔍 Natural Language Queries** - Query your graph using plain English

---

## 🏗️ Architecture

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
│  (Optional)      │     │  (AI - Once)     │
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
│  (AI - Per Chunk)│
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
DOC → Parse → SchemaOnce → Chunk → text2cypher → Cypher → Neo4j
```

1. **Upload & Parse** - Document uploaded and parsed into clean text (LlamaParse or local parsers)
2. **Chunk** - Long documents split into manageable chunks (default: 1000 words, optional)
3. **Schema Extraction** - LLM analyzes full document to extract graph schema (nodes, relationships, properties) - **done once per document**
4. **Cypher Generation** - text2cypher model generates Cypher MERGE statements using the extracted schema
5. **Neo4j Ingestion** - Generated Cypher executed in Neo4j with proper transactions and constraints

---

## ✨ Features

### Core Capabilities

- **📚 Multi-Format Support** - PDF, DOCX, DOC, and TXT files via LlamaParse (cloud) or local parsers
- **🧠 AI-Powered Schema Extraction** - Uses LLM (DeepSeek-R1-Distill or similar) to extract graph schema once per document
- **💻 Intelligent Cypher Generation** - Uses fine-tuned text2cypher models (`tomasonjo/text2cypher-demo-16bit`) to generate Cypher per chunk
- **🗄️ Production-Ready Neo4j Integration** - Executes generated Cypher with proper constraints, transactions, and idempotency (MERGE)
- **📊 Scalable Processing** - Handles documents with 100+ pages through intelligent chunking with overlap
- **🔄 Flexible LLM Backend** - Supports both Ollama (local) and Hugging Face (cloud) APIs
- **📝 Complete Audit Trail** - Full MongoDB staging layer tracks all steps, errors, and metadata
- **🔍 Natural Language Queries** - Query your graph using plain English questions

### Advanced Features

- **Idempotent Operations** - Safe to re-run pipeline without creating duplicates (MERGE statements)
- **Error Recovery** - Failed chunks can be retried without re-processing entire document
- **Schema Consistency** - All chunks use the same schema, ensuring consistent node/relationship types
- **Automatic Quality Fixes** - Built-in Cypher syntax correction and validation
- **File Watcher Mode** - Automatically process documents dropped in a watch folder
- **Metrics & Monitoring** - Track processing times, success rates, and pipeline metrics

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **MongoDB** (local or Atlas)
- **Neo4j** (local, Aura, or cloud instance)
- **LLM Provider** (Ollama or Hugging Face API key)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd Ai-Agent-01-Amit-main
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials (see Configuration section below)
   ```

3. **Setup Neo4j constraints:**
   ```bash
   npm run setup-neo4j
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Test with a document:**
   ```bash
   npm test ./path/to/your/document.pdf
   ```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

#### Database Configuration

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/document-graph
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname

# Neo4j
NEO4J_URI=bolt://localhost:7687
# Or for Neo4j Aura:
# NEO4J_URI=neo4j+ssc://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

#### LLM Configuration

```env
# LLM Provider: 'ollama' or 'huggingface'
SCHEMA_MODEL_PROVIDER=ollama
CYPHER_MODEL_PROVIDER=ollama

# Ollama Configuration (if using Ollama)
OLLAMA_BASE_URL=http://localhost:11434
SCHEMA_MODEL_OLLAMA=deepseek-r1:7b
TEXT2CYPHER_MODEL_OLLAMA=deepseek-r1:7b
OLLAMA_TIMEOUT_MS=900000

# Hugging Face Configuration (if using Hugging Face)
HF_API_KEY=your-huggingface-api-key
SCHEMA_MODEL_HF=deepseek-ai/DeepSeek-R1-Distill-Qwen
TEXT2CYPHER_MODEL_HF=tomasonjo/text2cypher-demo-16bit
HF_TIMEOUT_MS=300000
```

#### Document Parsing

```env
# LlamaParse (optional, for better PDF parsing)
LLAMAPARSE_API_KEY=your-llamaparse-api-key

# File Upload
UPLOAD_DIR=./uploads
```

#### Chunking Configuration

```env
# Chunking settings (only used if not using full document mode)
CHUNK_SIZE_WORDS=1000
CHUNK_OVERLAP_WORDS=100
```

#### Server Configuration

```env
PORT=3000
NODE_ENV=development
```

#### SSL Configuration (Windows)

```env
# Disable SSL verification for Windows certificate issues (development only)
DISABLE_SSL_VERIFICATION=true
NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

## 📡 API Endpoints

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

#### List Documents
```http
GET /documents
```

**Response:**
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "filename": "document.pdf",
    "status": "completed",
    "uploadTimestamp": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Get Document Details
```http
GET /documents/:id
```

#### Get Processing Status
```http
GET /documents/:id/status
```

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

Starts the full pipeline asynchronously. Returns immediately with status `processing`.

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

### Metrics

#### Get Pipeline Metrics
```http
GET /metrics
```

Returns processing statistics, success rates, and timing information.

### Health Check

```http
GET /health
```

---

## 📁 Project Structure

```
src/
├── server.js                 # Express app entry point
├── config/
│   ├── database.js           # MongoDB & Neo4j connections
│   └── reference-schema.js   # Reference schema examples
├── models/
│   ├── Document.js           # Document metadata & status
│   ├── DocumentChunk.js      # Text chunks with status
│   ├── Schema.js             # Extracted graph schema
│   ├── ChunkCypherResult.js  # Generated Cypher & execution results
│   └── PipelineMetrics.js    # Processing metrics
├── services/
│   ├── parsing/
│   │   └── index.js          # Document parsing (LlamaParse/local)
│   ├── schemaExtraction/
│   │   └── index.js          # Schema extraction with LLM
│   ├── cypherGeneration/
│   │   └── index.js          # Cypher generation with text2cypher
│   ├── neo4jIngest/
│   │   └── index.js          # Neo4j ingestion with transactions
│   ├── orchestrator.js       # Full pipeline coordinator
│   └── metrics.js            # Metrics tracking
├── routes/
│   ├── documents.js          # Document upload/status routes
│   ├── query.js              # Natural language query endpoint
│   └── metrics.js            # Metrics endpoint
├── utils/
│   ├── chunking.js           # Text chunking utilities
│   ├── llm.js                # LLM client (Ollama/HuggingFace)
│   ├── logger.js             # Winston logger setup
│   ├── prompt.js             # Prompt utilities
│   ├── retry.js              # Retry logic
│   ├── saveCypher.js         # Cypher file saving
│   ├── formatCypher.js       # Cypher formatting
│   └── documentTypeDetector.js # Document type detection
└── scripts/
    ├── test-pipeline.js      # End-to-end test script
    ├── setup-neo4j-constraints.js  # Neo4j constraint setup
    ├── file-watcher.js       # File watcher for auto-processing
    ├── check-document-status.js    # Status checker
    ├── check-neo4j-data.js   # Neo4j data inspector
    ├── check-ollama.js       # Ollama connection checker
    └── view-document-cypher.js    # Cypher viewer
```

---

## 🎓 Usage Examples

### Example 1: Upload and Process via API

```bash
# Upload document
curl -X POST http://localhost:3000/documents \
  -F "file=@business-report.pdf"

# Get document ID from response, then process
curl -X POST http://localhost:3000/documents/{docId}/process

# Check status
curl http://localhost:3000/documents/{docId}/status

# Query the graph
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "docId": "{docId}",
    "question": "Show me all relationships between companies and people"
  }'
```

### Example 2: File Watcher Mode

```bash
# Start file watcher
npm run watch

# Drop a PDF in the watch/ folder
# System automatically processes it
```

### Example 3: Using Test Script

```bash
# Process a document end-to-end
npm test ./test-docs/sample.pdf
```

---

## 🧠 Design Decisions

### Why MongoDB for Staging?

- **Audit Trail** - Track every step of the pipeline with full history
- **Resumability** - Retry failed chunks without re-processing entire document
- **Metadata Storage** - Store parsed text, schemas, generated Cypher for debugging
- **Scalability** - Handle large documents by storing chunks separately

### Why Schema Extraction Once?

- **Consistency** - All chunks use the same schema, ensuring consistent node/relationship types
- **Efficiency** - Only one LLM call for schema vs. per-chunk (cost/time savings)
- **Quality** - Schema extraction benefits from seeing the full document context
- **Reusability** - Schema can be reused for query generation

### Why MERGE Instead of CREATE?

- **Idempotency** - Safe to re-run pipeline without creating duplicates
- **Data Quality** - Prevents duplicate nodes/relationships
- **Production-Ready** - Standard practice for graph data ingestion

### Chunking Strategy

- **Size** - 1000 words balances context window with LLM token limits
- **Overlap** - 100-word overlap prevents losing context at chunk boundaries
- **Configurable** - Both size and overlap configurable via environment variables
- **Optional** - Can process full document without chunking (default mode)

---

## 🔧 Troubleshooting

### MongoDB Connection Issues

**Problem:** Cannot connect to MongoDB

**Solutions:**
- Ensure MongoDB is running: `mongod` (local) or verify Atlas connection string
- Check `MONGODB_URI` in `.env` is correct
- Verify network connectivity and firewall rules
- Check MongoDB logs for authentication errors

### Neo4j Connection Issues

**Problem:** Cannot connect to Neo4j

**Solutions:**
- Ensure Neo4j is running (local) or Aura credentials are correct
- Check `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` in `.env`
- For Neo4j Aura, use `neo4j+ssc://` protocol instead of `neo4j+s://`
- Run `npm run setup-neo4j` to verify connection
- Check Neo4j browser at `http://localhost:7474` (local)

### LLM API Issues

**Ollama:**
- Ensure Ollama is running: `ollama serve`
- Verify models are pulled: `ollama list`
- Pull required models: `ollama pull deepseek-r1:7b`
- Check `OLLAMA_BASE_URL` in `.env` (default: `http://localhost:11434`)

**Hugging Face:**
- Verify `HF_API_KEY` is set and valid
- Check API rate limits and quotas
- Ensure model names are correct in `.env`
- Check Hugging Face status page for outages

### Cypher Generation Issues

**Problem:** No Cypher generated or invalid Cypher

**Solutions:**
- Check that schema was extracted successfully (`GET /documents/:id/status`)
- Verify text2cypher model is accessible
- Review generated Cypher in MongoDB `ChunkCypherResult` collection
- Check logs for LLM API errors
- Try regenerating Cypher for failed chunks

### Document Parsing Issues

**Problem:** Text extraction fails or is incomplete

**Solutions:**
- For PDFs, try using LlamaParse (set `LLAMAPARSE_API_KEY`)
- Check file is not corrupted or password-protected
- Verify file format is supported (PDF, DOCX, DOC, TXT)
- Check file size limits (default: 100MB)

---

## 📊 Monitoring & Metrics

The system tracks comprehensive metrics:

- **Processing Times** - Per-stage timing (parsing, schema extraction, Cypher generation, ingestion)
- **Success Rates** - Success/failure counts per stage
- **Document Completion** - Overall pipeline success rate
- **Chunk Statistics** - Chunk processing success rates

Access metrics via:
```bash
GET /metrics
```

---

## 🛠️ Development

### Available Scripts

```bash
npm start              # Start the server
npm run dev            # Start with auto-reload (nodemon)
npm test <file>        # Run end-to-end test pipeline
npm run setup-neo4j    # Setup Neo4j constraints
npm run test-neo4j     # Test Neo4j connection
npm run watch          # Start file watcher
npm run check-doc      # Check document status
```

### Running Tests

```bash
# Test with a document
npm test ./test-docs/sample.pdf

# Test Neo4j connection
npm run test-neo4j

# Check Ollama connection
node src/scripts/check-ollama.js
```

---

## 📚 Additional Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed architecture documentation
- **[Documentation.md](./Documentation.md)** - Complete system documentation and process flow

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Neo4j** - Graph database platform
- **LlamaParse** - High-quality document parsing
- **Hugging Face** - LLM inference API
- **Ollama** - Local LLM runtime
- **text2cypher** - Fine-tuned Cypher generation models

---

## 📞 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review the architecture documentation

---

**Built with ❤️ using Node.js, Express, MongoDB, Neo4j, and AI**
