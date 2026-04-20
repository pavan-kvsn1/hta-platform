# Feature Spec: Knowledge Base RAG

**Feature ID:** AI-001  
**Phase:** 1  
**Priority:** High  
**Status:** Planning

---

## Summary

Build a Retrieval-Augmented Generation (RAG) system that allows engineers and admins to query calibration knowledge - SOPs, standards, procedures, and historical data - using natural language.

---

## Problem Statement

Engineers currently:
1. Manually search through PDF manuals for procedures
2. Look up uncertainty formulas in spreadsheets
3. Ask senior engineers for tribal knowledge
4. Dig through old certificates for reference values

This wastes **30-60 minutes per day** per engineer.

---

## Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE BASE RAG                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER: "What's the uncertainty formula for DC voltage          │
│         calibration using Fluke 5520A?"                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. EMBED QUERY                                          │   │
│  │    "uncertainty formula DC voltage Fluke 5520A"         │   │
│  │    → [0.023, -0.156, 0.891, ...]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 2. VECTOR SEARCH (pgvector)                             │   │
│  │    Find top-5 similar chunks from:                      │   │
│  │    • SOP-ELEC-001: DC Voltage Calibration               │   │
│  │    • Fluke 5520A Manual, Section 4.2                    │   │
│  │    • IS 17025 Uncertainty Guidelines                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 3. LLM SYNTHESIS                                        │   │
│  │    Combine retrieved context + query → Answer           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  RESPONSE: "For DC voltage calibration using Fluke 5520A,      │
│  the combined uncertainty formula is:                          │
│                                                                 │
│  U = k × √(u_std² + u_res² + u_rep² + u_drift²)               │
│                                                                 │
│  Where:                                                         │
│  - u_std = 0.0035% + 0.0005% × V (from 5520A specs)           │
│  - u_res = resolution/√12                                      │
│  - u_rep = std deviation of readings                           │
│  - k = 2 (95% confidence)                                      │
│                                                                 │
│  Source: SOP-ELEC-001, Section 5.3"                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Sources

| Source Type | Examples | Update Frequency |
|-------------|----------|------------------|
| **SOPs** | Calibration procedures by parameter | On change |
| **Standards** | IS 17025, ISO/IEC Guide 98-3 | Yearly |
| **Equipment Manuals** | Fluke, Keysight, Agilent manuals | On acquisition |
| **Historical Certs** | Past calibration certificates | Daily |
| **NABL Guidelines** | Specific requirements | On update |
| **Internal Notes** | Best practices, tips | Ongoing |

---

## Data Model

### Prisma Schema Addition

```prisma
model KnowledgeDocument {
  id            String   @id @default(uuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  
  // Document metadata
  title         String
  type          DocumentType  // SOP, STANDARD, MANUAL, CERTIFICATE, NOTE
  category      String?       // Electro-Technical, Mechanical, Thermal
  sourceFile    String?       // GCS path to original
  version       String?
  
  // Content
  content       String        // Full text (for display)
  
  // Status
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Chunks for RAG
  chunks        KnowledgeChunk[]
  
  @@index([tenantId, type])
  @@index([tenantId, category])
}

model KnowledgeChunk {
  id            String   @id @default(uuid())
  documentId    String
  document      KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  
  // Chunk content
  content       String
  chunkIndex    Int           // Position in document
  
  // Vector embedding (pgvector)
  embedding     Unsupported("vector(1536)")
  
  // Metadata for filtering
  section       String?       // "Section 5.3", "Chapter 4"
  pageNumber    Int?
  
  createdAt     DateTime @default(now())
  
  @@index([documentId])
}

enum DocumentType {
  SOP
  STANDARD
  MANUAL
  CERTIFICATE
  NOTE
  GUIDELINE
}
```

### pgvector Setup

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column (if not using Prisma Unsupported)
ALTER TABLE "KnowledgeChunk" 
ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast similarity search
CREATE INDEX ON "KnowledgeChunk" 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## API Design

### Endpoints

```typescript
// Query the knowledge base
POST /api/ai/knowledge/query
{
  "query": "uncertainty formula for DC voltage",
  "filters": {
    "types": ["SOP", "STANDARD"],
    "category": "Electro-Technical"
  },
  "limit": 5
}

Response:
{
  "answer": "For DC voltage calibration...",
  "sources": [
    {
      "documentId": "uuid",
      "title": "SOP-ELEC-001",
      "section": "Section 5.3",
      "relevance": 0.92,
      "excerpt": "The combined uncertainty..."
    }
  ],
  "confidence": 0.89
}

// Upload document for indexing
POST /api/ai/knowledge/documents
Content-Type: multipart/form-data
{
  file: <PDF/DOCX>,
  type: "SOP",
  category: "Electro-Technical",
  title: "DC Voltage Calibration Procedure"
}

// List documents
GET /api/ai/knowledge/documents?type=SOP&category=Electro-Technical

// Delete document (and its chunks)
DELETE /api/ai/knowledge/documents/:id
```

---

## Implementation

### Document Ingestion Pipeline

```typescript
// packages/shared/src/ai/knowledge/ingest.ts

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'

interface IngestOptions {
  chunkSize: number      // 1000 tokens
  chunkOverlap: number   // 200 tokens
  tenantId: string
}

export async function ingestDocument(
  content: string,
  metadata: DocumentMetadata,
  options: IngestOptions
): Promise<string> {
  // 1. Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
  })
  const chunks = await splitter.splitText(content)
  
  // 2. Generate embeddings
  const embeddings = new OpenAIEmbeddings({
    modelName: 'text-embedding-3-small',
  })
  const vectors = await embeddings.embedDocuments(chunks)
  
  // 3. Store in database
  const document = await prisma.knowledgeDocument.create({
    data: {
      tenantId: options.tenantId,
      title: metadata.title,
      type: metadata.type,
      category: metadata.category,
      content: content,
      chunks: {
        create: chunks.map((chunk, i) => ({
          content: chunk,
          chunkIndex: i,
          embedding: vectors[i], // pgvector handles this
        }))
      }
    }
  })
  
  return document.id
}
```

### Query Pipeline

```typescript
// packages/shared/src/ai/knowledge/query.ts

export async function queryKnowledge(
  query: string,
  tenantId: string,
  filters?: QueryFilters
): Promise<QueryResult> {
  // 1. Embed the query
  const embeddings = new OpenAIEmbeddings({
    modelName: 'text-embedding-3-small',
  })
  const queryVector = await embeddings.embedQuery(query)
  
  // 2. Vector similarity search
  const results = await prisma.$queryRaw`
    SELECT 
      c.id,
      c.content,
      c.section,
      d.id as "documentId",
      d.title,
      d.type,
      1 - (c.embedding <=> ${queryVector}::vector) as similarity
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON c."documentId" = d.id
    WHERE d."tenantId" = ${tenantId}
      AND d."isActive" = true
      ${filters?.types ? Prisma.sql`AND d.type = ANY(${filters.types})` : Prisma.empty}
    ORDER BY c.embedding <=> ${queryVector}::vector
    LIMIT 5
  `
  
  // 3. Build context for LLM
  const context = results
    .map(r => `[${r.title}, ${r.section}]\n${r.content}`)
    .join('\n\n---\n\n')
  
  // 4. Generate answer with Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are an expert calibration engineer assistant. 
Answer questions using ONLY the provided context. 
If the context doesn't contain the answer, say so.
Always cite your sources.`,
    messages: [{
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${query}`
    }]
  })
  
  return {
    answer: response.content[0].text,
    sources: results.map(r => ({
      documentId: r.documentId,
      title: r.title,
      section: r.section,
      relevance: r.similarity,
      excerpt: r.content.substring(0, 200),
    })),
    confidence: Math.max(...results.map(r => r.similarity)),
  }
}
```

---

## UI Components

### Knowledge Search Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Ask HTA Knowledge Base                              [?]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ What's the acceptance criteria for pressure gauge      │   │
│  │ calibration?                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Filter: [All Types ▾] [All Categories ▾]        [Ask →]       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✨ Answer                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  For pressure gauge calibration, the acceptance criteria        │
│  depends on the accuracy class:                                 │
│                                                                 │
│  • Class 0.25: ±0.25% of span                                  │
│  • Class 0.5: ±0.5% of span                                    │
│  • Class 1.0: ±1.0% of span                                    │
│                                                                 │
│  The gauge should be tested at minimum 5 points...             │
│                                                                 │
│  📚 Sources                                                     │
│  ─────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📄 SOP-MECH-003: Pressure Gauge Calibration            │   │
│  │    Section 6.2 - Acceptance Criteria                    │   │
│  │    Relevance: 94%                              [View →] │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📄 IS 3624:1987 - Pressure Gauge Specifications        │   │
│  │    Table 2 - Permissible Errors                         │   │
│  │    Relevance: 87%                              [View →] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Admin: Document Management

```
┌─────────────────────────────────────────────────────────────────┐
│  📚 Knowledge Base Management                    [+ Upload]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filter: [All Types ▾] [All Categories ▾]  🔍 Search...        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Type     │ Title                    │ Chunks │ Updated  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ SOP      │ DC Voltage Calibration   │ 24     │ 2d ago   │   │
│  │ SOP      │ Pressure Gauge Calib.    │ 18     │ 1w ago   │   │
│  │ STANDARD │ IS 17025:2017            │ 156    │ 3mo ago  │   │
│  │ MANUAL   │ Fluke 5520A User Guide   │ 342    │ 6mo ago  │   │
│  │ NOTE     │ DMM Calibration Tips     │ 8      │ 1d ago   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Total: 47 documents, 2,341 chunks                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

1. **Tenant Isolation**: All queries filtered by tenantId
2. **Document Access**: Only indexed docs visible to tenant
3. **PII Filtering**: Strip customer data from certificate indexing
4. **Rate Limiting**: 100 queries/hour per user
5. **Audit Logging**: Log all queries for compliance

---

## Testing Plan

| Test Type | Scope | Criteria |
|-----------|-------|----------|
| Unit | Chunking logic | Correct splits, overlap |
| Unit | Embedding generation | Valid vectors |
| Integration | End-to-end query | Returns relevant results |
| Performance | Query latency | <2s p95 |
| Accuracy | Domain questions | >80% correct answers |

---

## Rollout Plan

1. **Week 1**: Set up pgvector, create schema
2. **Week 2**: Build ingestion pipeline, test with sample docs
3. **Week 3**: Build query API, integrate with frontend
4. **Week 4**: Upload initial document corpus, beta test
5. **Week 5**: Gather feedback, tune chunking/prompts
6. **Week 6**: Production release

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Query accuracy | >80% | Manual review of 100 queries |
| Query latency | <2s p95 | API monitoring |
| Adoption | 50% of engineers | Weekly active users |
| Time saved | 30 min/day/engineer | Survey + time tracking |
