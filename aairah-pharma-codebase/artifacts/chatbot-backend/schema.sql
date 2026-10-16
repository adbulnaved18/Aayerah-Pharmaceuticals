-- PostgreSQL + pgvector Schema for Chatbot Knowledge Base
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    audience VARCHAR(100), -- e.g., 'customer-safe', 'internal'
    active_version_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Document Versions Table
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    file_key VARCHAR(512) NOT NULL, -- Path in object storage
    sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL, -- e.g., 'draft', 'processing', 'ready', 'published', 'failed'
    effective_at TIMESTAMP WITH TIME ZONE,
    uploaded_by VARCHAR(255),
    published_by VARCHAR(255),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_id, version_no)
);

-- Foreign key for active version on documents table
ALTER TABLE documents 
ADD CONSTRAINT fk_active_version 
FOREIGN KEY (active_version_id) REFERENCES document_versions(id) ON DELETE SET NULL;

-- 3. Chunks Table (Uses pgvector)
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    embedding VECTOR(768), -- Gemini embedding dimension
    embedding_model VARCHAR(100) DEFAULT 'gemini-embedding-001',
    config_version VARCHAR(50),
    UNIQUE (version_id, chunk_index)
);

-- HNSW Index for fast vector similarity search (cosine distance)
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

-- 4. Ingestion Jobs Table (Durable Queue for Background Processing)
CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL DEFAULT 'queued', -- 'queued', 'extracting', 'embedding', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    lease_until TIMESTAMP WITH TIME ZONE,
    progress JSONB,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Chat Sessions & Messages Table
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id VARCHAR(255), -- User ID if authenticated, else anonymous session ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'user', 'assistant'
    content TEXT NOT NULL,
    source_ids JSONB, -- Array of chunk IDs or titles cited
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Feedback & Audit Events
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    rating INTEGER, -- 1 for helpful, -1 for not helpful
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor VARCHAR(255) NOT NULL, -- Admin username/ID
    action VARCHAR(255) NOT NULL, -- e.g., 'UPLOAD_PDF', 'PUBLISH_VERSION', 'DELETE_DOC'
    document_version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
