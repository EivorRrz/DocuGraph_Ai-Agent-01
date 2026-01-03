# Architecture Overview

## System Design

This document-to-graph pipeline follows a **staged processing architecture** with clear separation of concerns.

## Pipeline Stages

### 1. Upload & Persistence
- **Input**: PDF/DOCX/TXT file
- **Storage**: File saved to disk, metadata in MongoDB
- **Status**: `uploaded`

### 2. Parsing
- **Service**: `services/parsing/index.js`
- **Methods**:
  - Primary: LlamaParse API (cloud, high quality)
  - Fallback: Local parsers (`pdf-parse`, `mammoth`)
- **Output**: Clean full text stored in MongoDB
- **Status**: `parsed`

### 3. Chunking
- **Service**: `utils/chunking.js`
- **Strategy**: 
  - Split by word count (default: 1000 words)
  - Overlap between chunks (default: 100 words)
  - Preserves context at boundaries
- **Storage**: Each chunk stored as `DocumentChunk` in MongoDB
- **Status**: `pending`

### 4. Schema Extraction (Once Per Document)
- **Service**: `services/schemaExtraction/index.js`
- **Model**: General-purpose LLM (DeepSeek-R1-Distill or similar)
- **Input**: Full document text (or representative sample for very long docs)
- **Output**: JSON schema with:
  - Node types (labels) and their properties
  - Relationship types and directions
- **Normalization**:
  - Labels → PascalCase
  - Relationships → UPPER_SNAKE_CASE
  - Properties → camelCase
- **Storage**: Single `Schema` document per document in MongoDB
- **Status**: `schema_extracted`

### 5. Cypher Generation (Per Chunk)
- **Service**: `services/cypherGeneration/index.js`
- **Model**: Fine-tuned text2cypher model (`tomasonjo/text2cypher-demo-16bit`)
- **Input**: 
  - Schema (from step 4)
  - Chunk text
- **Prompt Engineering**:
  - System instruction: "Generate Cypher MERGE statements only"
  - Schema context included
  - Chunk text provided
  - Enforces idempotency (MERGE)
- **Output**: Cypher MERGE statements
- **Storage**: `ChunkCypherResult` in MongoDB
- **Status**: `cypher_generated`

### 6. Neo4j Ingestion
- **Service**: `services/neo4jIngest/index.js`
- **Process**:
  - Split Cypher into individual statements
  - Execute in Neo4j transaction
  - Count created nodes/relationships
  - Handle errors gracefully
- **Constraints**: Uniqueness constraints created automatically
- **Status**: `ingested` / `completed`

## Data Flow

```
┌─────────────┐
│   Upload    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Parse     │────▶│  Full Text   │
└──────┬──────┘     └──────┬───────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌──────────────┐
│   Chunk     │     │   Schema     │
└──────┬──────┘     │ Extraction   │
       │            └──────┬───────┘
       │                  │
       ▼                  │
┌─────────────┐          │
│   Chunks    │──────────┘
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Cypher    │
│ Generation  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Neo4j     │
│  Ingestion  │
└─────────────┘
```

## Key Design Decisions

### Why MongoDB for Staging?

1. **Audit Trail**: Every step is logged with status, timestamps, errors
2. **Resumability**: Failed chunks can be retried without re-processing entire document
3. **Debugging**: Generated Cypher stored for inspection
4. **Scalability**: Large documents split into manageable chunks
5. **Metadata**: Rich metadata for monitoring and analytics

### Why Extract Schema Once?

1. **Consistency**: All chunks use same schema → consistent node/relationship types
2. **Efficiency**: One LLM call vs. per-chunk (cost/time savings)
3. **Quality**: Schema extraction benefits from full document context
4. **Reusability**: Schema can be reused for query generation

### Why MERGE Instead of CREATE?

1. **Idempotency**: Safe to re-run pipeline
2. **Data Quality**: Prevents duplicates
3. **Production-Ready**: Standard practice for ETL pipelines

### Chunking Strategy

- **Size**: 1000 words balances context with token limits
- **Overlap**: 100 words prevents context loss at boundaries
- **Configurable**: Both parameters via environment variables

## Service Layer Architecture

Each service is **independent** and can be:
- Tested in isolation
- Replaced/swapped easily
- Scaled independently

```
orchestrator.js (coordinates)
    ├── parsing/
    ├── schemaExtraction/
    ├── cypherGeneration/
    └── neo4jIngest/
```

## Error Handling

- **Graceful Degradation**: LlamaParse → local parser fallback
- **Retry Logic**: Cypher generation retries on empty response
- **Transaction Safety**: Neo4j transactions with rollback on error
- **Status Tracking**: Each stage tracks success/failure in MongoDB

## Scalability Considerations

1. **Chunking**: Handles 100+ page documents
2. **Async Processing**: Pipeline runs asynchronously via API
3. **Database Indexing**: MongoDB indexes on docId, status for fast queries
4. **Neo4j Transactions**: Batched execution for performance

## Security Considerations

1. **Environment Variables**: All secrets in `.env` (not committed)
2. **File Validation**: MIME type and extension validation
3. **Log Sanitization**: Secrets redacted in logs
4. **Input Validation**: File size limits, type restrictions

## Monitoring & Observability

- **Winston Logging**: Structured JSON logs with levels
- **Status Endpoints**: Real-time pipeline status via API
- **MongoDB Metadata**: Full audit trail in database
- **Error Tracking**: Errors stored with context in MongoDB

## Future Enhancements

1. **Queue System**: Add job queue (Bull, RabbitMQ) for production
2. **Streaming**: Stream large documents instead of loading fully
3. **Schema Versioning**: Support schema evolution
4. **Incremental Updates**: Update graph when document changes
5. **Multi-tenancy**: Support multiple users/organizations
6. **Caching**: Cache schemas and parsed text
7. **Webhooks**: Notify on pipeline completion

