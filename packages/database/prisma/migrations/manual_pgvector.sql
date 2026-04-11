-- ─────────────────────────────────────────────────────────────────────────────
-- OpenClaw-style memory: pgvector extension + vector/tsvector columns + indexes.
-- This is run by the install script *after* `prisma db push`, because Prisma's
-- `Unsupported("vector(1536)")` cannot create the column on its own.
-- Re-running is safe (everything is IF NOT EXISTS / guarded).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- Vector embedding column (1536 dims = OpenAI text-embedding-3-small / Gemini text-embedding-004)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MemoryChunk' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "MemoryChunk" ADD COLUMN embedding vector(1536);
  END IF;
END$$;

-- Generated tsvector column for full-text search.
--
-- IMPORTANT: we use the `simple` config (lowercases only — no Snowball stemming
-- and no stop-word removal) instead of `english`. The `english` config drops
-- common words like "who/is/the" and stems proper nouns weirdly, which causes
-- "who is sanweer" to lose recall on a chunk that literally contains "Sanweer".
-- This mirrors OpenClaw's FTS5 `unicode61` tokenizer, which is also lowercase-
-- only with no stemming.
--
-- If a previous install used `english`, drop and recreate the column so the
-- generated expression switches to `simple`.
DO $$
DECLARE
  current_def text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO current_def
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relname = 'MemoryChunk'
     AND a.attname = 'textSearch'
     AND a.attnum > 0;

  IF current_def IS NOT NULL AND current_def NOT LIKE '%''simple''%' THEN
    -- Old `english` definition — drop the GIN index and the column.
    EXECUTE 'DROP INDEX IF EXISTS memory_chunk_text_search_idx';
    ALTER TABLE "MemoryChunk" DROP COLUMN "textSearch";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MemoryChunk' AND column_name = 'textSearch'
  ) THEN
    ALTER TABLE "MemoryChunk"
      ADD COLUMN "textSearch" tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED;
  END IF;
END$$;

-- IVFFlat index for cosine similarity search on the vector column
CREATE INDEX IF NOT EXISTS memory_chunk_embedding_idx
  ON "MemoryChunk" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- GIN index for the FTS column
CREATE INDEX IF NOT EXISTS memory_chunk_text_search_idx
  ON "MemoryChunk" USING gin ("textSearch");
