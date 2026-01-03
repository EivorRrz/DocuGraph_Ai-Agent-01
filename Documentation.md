# AI Agent: Document-to-Graph Converter

## System Blueprint
---

## What It Is
An AI-powered automated system that converts business documents (PDF, DOCX, TXT) into Neo4j graph databases. The system uses artificial intelligence to extract entities, relationships, and properties from documents, then automatically generates database queries to build the graph structure.

## Architecture

### High-Level Architecture

```
                    BUSINESS DOCUMENT
              (PDF, DOCX, or TXT file)
                      |
                      |
              DOCUMENT UPLOAD SERVICE
              (File Watcher / API)
                      |
                      |
              TEXT PARSING SERVICE
              (LlamaParse / Local Parsers)
                      |
                      |
              SCHEMA EXTRACTION SERVICE
              (AI - LLM Analysis)
                      |
                      |
              CYPHER GENERATION SERVICE
              (AI - Code Generation)
                      |
                      |
              QUALITY FIXES SERVICE
              (Automatic Error Correction)
                      |
                      |
              USER REVIEW INTERFACE
              (Approval Workflow)
                      |
                      |
              NEO4J INGESTION SERVICE
              (Transaction Execution)
                      |
                      |
              GRAPH DATABASE (Neo4j)
              (Final Output)
```

### Component Architecture

```
ORCHESTRATOR (Pipeline Coordinator)
    |
    +-- PARSING SERVICE
    |   - Document text extraction
    |   - Format support (PDF, DOCX, TXT)
    |   - Text cleaning and normalization
    |
    +-- SCHEMA EXTRACTION SERVICE
    |   - AI-powered entity identification
    |   - Relationship extraction
    |   - Property identification
    |
    +-- CYPHER GENERATION SERVICE
    |   - AI-powered code generation
    |   - Schema-based query creation
    |   - Automatic syntax fixes
    |
    +-- NEO4J INGESTION SERVICE
        - Query validation
        - Transaction execution
        - Constraint creation
        - Result tracking
```

### Data Flow Architecture

```
MongoDB (Staging Layer)
    |
    +-- Document Metadata
    |   - File information
    |   - Processing status
    |   - Timestamps
    |
    +-- Parsed Text
    |   - Full document text
    |   - Cleaned content
    |
    +-- Extracted Schema
    |   - Node types
    |   - Relationship types
    |   - Properties
    |
    +-- Generated Cypher
    |   - Query statements
    |   - Generation metadata
    |
    |
Neo4j (Graph Database)
    |
    +-- Nodes
    |   - Entity instances
    |   - Properties
    |
    +-- Relationships
        - Connections between nodes
        - Relationship properties
```

---

## Step-by-Step Process Flow

### Step 1: Document Upload

**Process:**
- User uploads document via file system (watch folder) or API endpoint
- System detects new file and creates document record in MongoDB
- Document metadata stored: filename, file type, size, upload timestamp
- Status set to "uploaded"

**Details:**
- File watcher monitors designated folder for new files
- Supports PDF, DOCX, and TXT formats
- Validates file type and size
- Creates unique document ID for tracking

**Output:** Document record in MongoDB with status "uploaded"

---

### Step 2: Text Parsing

**Process:**
- System reads document file from disk
- Determines file type (PDF, DOCX, or TXT)
- Extracts text content using appropriate parser
- Cleans and normalizes extracted text
- Stores full text in MongoDB

**Parsing Methods:**
- Primary: LlamaParse API (cloud-based, high quality)
- Fallback: Local parsers
  - PDF: pdf-parse library
  - DOCX: mammoth library
  - TXT: File system read

**Text Cleaning:**
- Removes excessive whitespace
- Normalizes line breaks
- Removes special characters
- Trims leading/trailing spaces

**Output:** Clean full text stored in MongoDB, status updated to "parsed"

---

### Step 3: Schema Extraction (AI-Powered)

**Process:**
- System retrieves full document text from MongoDB
- Detects document type (business, financial, technical)
- Builds specialized prompt for AI model
- Calls LLM (Large Language Model) with document text
- LLM analyzes document and extracts graph schema
- System extracts JSON schema from LLM response
- Validates schema structure and format
- Normalizes naming conventions
- Saves schema to MongoDB

**AI Analysis:**
- Identifies entity types (nodes): Account, Party, Trade, Security, etc.
- Identifies properties: accountId, firstName, tradeAmount, etc.
- Identifies relationships: HAS_ACCOUNT, EXECUTED_TRADE, etc.
- Determines relationship directions: from → to

**Schema Normalization:**
- Node labels: PascalCase (Account, Party)
- Properties: camelCase (accountId, partyId)
- Relationships: UPPER_SNAKE_CASE (HAS_ACCOUNT, EXECUTED_TRADE)

**Output:** Structured JSON schema with nodes and relationships, status updated to "schema_extracted"

---

### Step 4: Constraint Creation (Optional)

**Process:**
- System reads extracted schema from MongoDB
- Identifies unique identifier properties for each node type
- Creates uniqueness constraints in Neo4j
- Constraints ensure data integrity and prevent duplicates

**Constraint Logic:**
- Only creates constraints on true ID properties (e.g., accountId for Account)
- Does not create constraints on foreign keys (e.g., accountId in Trade)
- Uses pattern matching: {label}Id (e.g., Account → accountId)

**Output:** Uniqueness constraints created in Neo4j database

---

### Step 5: Cypher Generation (AI-Powered)

**Process:**
- System retrieves schema and document text from MongoDB
- Builds detailed prompt with 9 critical rules for Cypher generation
- Calls LLM with schema context and document text
- LLM generates Cypher MERGE statements
- System extracts Cypher code from LLM response
- Applies automatic syntax fixes (9 categories)
- Formats Cypher into structured output
- Saves generated Cypher to MongoDB

**Prompt Engineering:**
- Includes extracted schema as context
- Provides document text for entity extraction
- Enforces 9 critical rules:
  1. Explicit node creation
  2. Business-meaningful relationship names
  3. Correct relationship directions
  4. Consistent property naming
  5. Valid date formats
  6. MERGE for idempotency
  7. Literal values only
  8. Correct syntax (no HTML entities)
  9. Structured output format

**Automatic Quality Fixes:**
1. HTML entity cleanup (-&gt; → ->)
2. Property name typos (accountI d → accountId)
3. Property inconsistencies (productId → securityId)
4. MERGE with variable references
5. Invalid node creation in relationships
6. Invalid date formats
7. Inverted relationship directions
8. Relationship name standardization
9. Missing relationship links

**Output:** Generated Cypher code with automatic fixes, status updated to "cypher_generated"

---

### Step 6: User Review

**Process:**
- System displays generated Cypher in console
- User reviews the Cypher code
- System prompts for confirmation to save to MongoDB
- If approved, Cypher saved to MongoDB
- System prompts for confirmation to ingest to Neo4j
- User decision recorded

**Review Features:**
- Full Cypher displayed for inspection
- Saved to file system for later review
- Interactive confirmation prompts
- Option to skip MongoDB save
- Option to skip Neo4j ingestion

**Output:** User-approved Cypher ready for ingestion

---

### Step 7: Neo4j Ingestion

**Process:**
- System retrieves approved Cypher from MongoDB
- Validates Cypher syntax using EXPLAIN command
- Splits Cypher into individual statements
- Executes statements in Neo4j transaction
- Counts nodes and relationships created
- Handles errors gracefully with rollback
- Updates status and metrics

**Validation:**
- Uses Neo4j EXPLAIN to check syntax
- Validates each statement before execution
- Catches errors early

**Transaction Execution:**
- Groups statements into single transaction
- Executes sequentially
- Counts created nodes and relationships
- Commits on success
- Rolls back on error

**Error Handling:**
- Catches syntax errors
- Catches constraint violations
- Rolls back transaction on failure
- Logs errors with context
- Updates status to "error"

**Output:** Graph database populated with nodes and relationships, status updated to "completed"

