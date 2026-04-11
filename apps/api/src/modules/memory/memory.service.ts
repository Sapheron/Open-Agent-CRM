/**
 * Memory Service — OpenClaw-style file/chunk/recall storage backed by pgvector.
 *
 * Each "memory" is a markdown file (`MemoryFile`) split into ~500-char chunks
 * (`MemoryChunk`) that carry both a vector embedding (for semantic search) and
 * a tsvector (for keyword search). Reads merge both signals with temporal
 * decay, the same scoring strategy OpenClaw uses on top of SQLite vec0+FTS5.
 *
 * Recalls are tracked in `RecallEntry` so the worker's dreaming job can later
 * promote frequently-recalled chunks into the long-term `MEMORY.md` file.
 */
import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import { chunkMarkdown, sha256 } from './chunker';
import { getCompanyEmbedder, toPgVector, EMBEDDING_DIM } from './embeddings';
import { buildFtsQuery, extractKeywords } from './search-helpers';

export interface SearchHit {
  id: string;
  path: string;
  source: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
  vecScore: number;
  textScore: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Set when search couldn't run at all (e.g. DB error). The AI should explain it instead of asserting absence. */
  unavailable?: { reason: string };
}

export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
  source?: string;
}

// Hybrid weights — match OpenClaw defaults (0.7 vec / 0.3 text).
const VECTOR_WEIGHT = 0.7;
const TEXT_WEIGHT = 0.3;
// Temporal decay — opt-in. Set to a long half-life so older facts (a few weeks
// old) don't get pushed below `minScore` just because nobody recalled them yet.
const TEMPORAL_DECAY_ENABLED = true;
const TEMPORAL_HALF_LIFE_DAYS = 30;

@Injectable()
export class MemoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MemoryService.name);

  /**
   * On API boot, scan every MemoryFile and re-write any that still has chunks
   * referencing the old `english` tsvector tokenizer (or has zero chunks at
   * all). This is idempotent — `writeFile` checks the hash and skips if
   * unchanged. The migration in `manual_pgvector.sql` already drops + recreates
   * the generated column to `simple`, so the old chunks have correct
   * tsvectors at the column level — but we still need to make sure every file
   * has actually been chunked.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const files = await prisma.memoryFile.findMany({
        select: { id: true, companyId: true, path: true, content: true, source: true },
      });
      let rebuilt = 0;
      for (const f of files) {
        const chunkCount = await prisma.memoryChunk.count({ where: { fileId: f.id } });
        if (chunkCount > 0) continue;
        try {
          await this.writeFile(f.companyId, f.path, f.content, f.source);
          rebuilt++;
        } catch (err) {
          this.logger.warn(
            `[Memory] boot reindex failed for ${f.companyId}:${f.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (rebuilt > 0) {
        this.logger.log(`[Memory] boot reindex complete — rebuilt ${rebuilt}/${files.length} files`);
      }
    } catch (err) {
      this.logger.warn(
        `[Memory] boot reindex skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── File CRUD ────────────────────────────────────────────────────────────

  async listFiles(companyId: string, source?: string) {
    return prisma.memoryFile.findMany({
      where: { companyId, ...(source ? { source } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        path: true,
        source: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getFile(companyId: string, path: string) {
    const file = await prisma.memoryFile.findUnique({
      where: { companyId_path: { companyId, path } },
    });
    if (!file) throw new NotFoundException(`Memory file not found: ${path}`);
    return file;
  }

  async readFile(
    companyId: string,
    path: string,
    fromLine?: number,
    lineCount?: number,
  ): Promise<string | null> {
    const file = await prisma.memoryFile.findUnique({
      where: { companyId_path: { companyId, path } },
      select: { content: true },
    });
    if (!file) return null;
    if (fromLine === undefined) return file.content;
    const lines = file.content.split('\n');
    const start = Math.max(1, fromLine) - 1;
    const end = lineCount ? start + lineCount : lines.length;
    return lines.slice(start, end).join('\n');
  }

  /**
   * Write (create or replace) a memory file. Re-chunks the content, embeds
   * each chunk via the company's configured embedding provider, and stores
   * everything in `MemoryChunk` with vector + tsvector for hybrid search.
   */
  async writeFile(
    companyId: string,
    path: string,
    content: string,
    source = 'memory',
  ): Promise<{ fileId: string; chunkCount: number }> {
    const hash = await sha256(content);

    const file = await prisma.memoryFile.upsert({
      where: { companyId_path: { companyId, path } },
      create: {
        companyId,
        path,
        source,
        content,
        hash,
        size: content.length,
      },
      update: {
        content,
        hash,
        source,
        size: content.length,
      },
    });

    // Wipe and re-build chunks. Re-embedding everything is fine for the
    // file sizes we expect (a few KB); we can swap to delta indexing later.
    await prisma.memoryChunk.deleteMany({ where: { fileId: file.id } });

    const chunks = chunkMarkdown(content);
    if (chunks.length === 0) return { fileId: file.id, chunkCount: 0 };

    const embedder = await getCompanyEmbedder(companyId).catch(() => null);
    const modelName = embedder ? 'embedded' : 'none';

    for (const c of chunks) {
      const chunkHash = await sha256(c.text);
      let embeddingLiteral: string | null = null;
      let model = 'none';
      if (embedder) {
        try {
          const result = await embedder(c.text);
          embeddingLiteral = toPgVector(result.vector);
          model = result.model;
        } catch (err) {
          // Embedding failed — fall back to keyword-only for this chunk.
          console.warn('[Memory] embed failed:', err instanceof Error ? err.message : err);
        }
      }

      // Prisma client can't write to the Unsupported vector column, so insert raw.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MemoryChunk"
           ("id", "companyId", "fileId", "path", "source",
            "startLine", "endLine", "hash", "text", "model",
            "embedding", "createdAt", "updatedAt")
         VALUES
           (gen_random_uuid()::text, $1, $2, $3, $4,
            $5, $6, $7, $8, $9,
            ${embeddingLiteral ? `$10::vector` : 'NULL'}, NOW(), NOW())`,
        companyId,
        file.id,
        path,
        source,
        c.startLine,
        c.endLine,
        chunkHash,
        c.text,
        model,
        ...(embeddingLiteral ? [embeddingLiteral] : []),
      );
    }

    void modelName; // referenced for future telemetry
    return { fileId: file.id, chunkCount: chunks.length };
  }

  async deleteFile(companyId: string, path: string): Promise<void> {
    const file = await prisma.memoryFile.findUnique({
      where: { companyId_path: { companyId, path } },
    });
    if (!file) return;
    await prisma.memoryFile.delete({ where: { id: file.id } });
  }

  // ── Search (hybrid: vector + FTS + fallback chain, OpenClaw-style) ──────
  //
  // The search pipeline mirrors OpenClaw's `MemoryIndexManager.search`:
  //   1. Vector path (if a compatible embedder is configured).
  //   2. Strict AND keyword search via `to_tsquery('simple', ...)`.
  //   3. Per-keyword broaden-recall fallback if (2) returns nothing — drops
  //      stop words and re-runs the FTS query for each individual keyword.
  //   4. Final ILIKE substring fallback if FTS still finds nothing — catches
  //      proper nouns / partial matches that the tokenizer might miss.
  //
  // The classic `search()` method below returns a flat `SearchHit[]` for
  // backward compatibility with controllers and the dashboard. New callers
  // should prefer `searchWithStatus()` so they can distinguish "no hits" from
  // "search broken".

  async search(
    companyId: string,
    query: string,
    opts: SearchOptions = {},
  ): Promise<SearchHit[]> {
    return (await this.searchWithStatus(companyId, query, opts)).hits;
  }

  async searchWithStatus(
    companyId: string,
    query: string,
    opts: SearchOptions = {},
  ): Promise<SearchResult> {
    const cleaned = query.trim();
    if (!cleaned) return { hits: [] };

    const maxResults = Math.max(1, Math.min(opts.maxResults ?? 10, 50));
    const minScore = opts.minScore ?? 0;

    // ── 1. Vector path ────────────────────────────────────────────────────
    const embedder = await getCompanyEmbedder(companyId).catch(() => null);
    let vectorRows: Array<{ id: string; vec_score: number }> = [];
    let vectorError: string | undefined;
    if (embedder) {
      try {
        const { vector } = await embedder(cleaned);
        const literal = toPgVector(vector);
        vectorRows = await prisma.$queryRawUnsafe<Array<{ id: string; vec_score: number }>>(
          `SELECT "id", 1 - ("embedding" <=> $1::vector) AS vec_score
             FROM "MemoryChunk"
            WHERE "companyId" = $2
              AND "embedding" IS NOT NULL
              ${opts.source ? `AND "source" = $3` : ''}
            ORDER BY "embedding" <=> $1::vector
            LIMIT 20`,
          literal,
          companyId,
          ...(opts.source ? [opts.source] : []),
        );
      } catch (err) {
        vectorError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[Memory] vector search failed: ${vectorError}`);
      }
    }

    // ── 2. Strict FTS path (`simple` tokenizer + AND query) ───────────────
    let textRows = await this.runFtsQuery(companyId, cleaned, opts.source);

    // ── 3. Broaden recall by per-keyword if strict AND found nothing ──────
    if (textRows.length === 0) {
      const keywords = extractKeywords(cleaned);
      if (keywords.length > 0) {
        const broadened = new Map<string, number>();
        for (const kw of keywords) {
          for (const row of await this.runFtsQuery(companyId, kw, opts.source)) {
            const prev = broadened.get(row.id) ?? 0;
            broadened.set(row.id, Math.max(prev, row.text_score));
          }
        }
        textRows = [...broadened.entries()].map(([id, text_score]) => ({ id, text_score }));
      }
    }

    // ── 4. ILIKE substring fallback when FTS still finds nothing ─────────
    // Catches names, acronyms, and any token the tokenizer might split or
    // miss. Scoped to the same company so it stays cheap.
    if (textRows.length === 0 && vectorRows.length === 0) {
      try {
        const ilikeRows = await prisma.memoryChunk.findMany({
          where: {
            companyId,
            ...(opts.source ? { source: opts.source } : {}),
            text: { contains: cleaned, mode: 'insensitive' },
          },
          select: { id: true },
          take: 20,
        });
        // Substring matches get a flat 0.4 textScore — strong enough to clear
        // typical minScore values without dominating real FTS hits.
        textRows = ilikeRows.map((r) => ({ id: r.id, text_score: 0.4 }));
      } catch (err) {
        this.logger.warn(
          `[Memory] ilike fallback failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Merge by chunk id.
    const merged = new Map<string, { vec: number; text: number }>();
    for (const r of vectorRows) {
      merged.set(r.id, { vec: Number(r.vec_score) || 0, text: 0 });
    }
    for (const r of textRows) {
      const prev = merged.get(r.id) ?? { vec: 0, text: 0 };
      prev.text = Number(r.text_score) || 0;
      merged.set(r.id, prev);
    }

    // If we genuinely have nothing AND the search machinery itself failed
    // (e.g. vector errored AND ilike threw), surface that to the caller so
    // the AI can say "I checked but the search is broken" instead of
    // "this fact does not exist".
    if (merged.size === 0 && vectorError && embedder) {
      return { hits: [], unavailable: { reason: `vector search error: ${vectorError}` } };
    }
    if (merged.size === 0) return { hits: [] };

    // Hydrate full chunk metadata.
    const ids = [...merged.keys()];
    const chunks = await prisma.memoryChunk.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        path: true,
        source: true,
        startLine: true,
        endLine: true,
        text: true,
        updatedAt: true,
      },
    });

    const now = Date.now();
    const hits: SearchHit[] = chunks.map((c) => {
      const scores = merged.get(c.id) ?? { vec: 0, text: 0 };
      const base = VECTOR_WEIGHT * scores.vec + TEXT_WEIGHT * scores.text;
      let final = base;
      if (TEMPORAL_DECAY_ENABLED) {
        const ageDays = Math.max(0, (now - c.updatedAt.getTime()) / 86_400_000);
        const decay = Math.pow(0.5, ageDays / TEMPORAL_HALF_LIFE_DAYS);
        // Don't let decay collapse a real keyword hit below minScore — clamp
        // to a floor of 50% of the base score so a 6-month-old fact still
        // surfaces when literally nothing else matches.
        final = Math.max(base * decay, base * 0.5);
      }
      return {
        id: c.id,
        path: c.path,
        source: c.source,
        startLine: c.startLine,
        endLine: c.endLine,
        text: c.text,
        vecScore: scores.vec,
        textScore: scores.text,
        score: final,
      };
    });

    hits.sort((a, b) => b.score - a.score);

    // Strict filter first; if it would drop everything, relax to a floor of
    // half the highest text-only score so pure keyword hits still pass.
    let filtered = hits.filter((h) => h.score >= minScore).slice(0, maxResults);
    if (filtered.length === 0 && hits.length > 0) {
      const relaxed = Math.min(minScore, TEXT_WEIGHT * 0.5);
      filtered = hits.filter((h) => h.score >= relaxed).slice(0, maxResults);
    }

    // Fire-and-forget: track recalls for the dreaming job.
    void this.recordRecalls(companyId, cleaned, filtered).catch((err) =>
      this.logger.warn(`[Memory] recordRecalls failed: ${err instanceof Error ? err.message : String(err)}`),
    );

    return { hits: filtered };
  }

  /**
   * Run a single `to_tsquery('simple', ...)` against MemoryChunk for the
   * given raw query string. Returns the matching ids + ts_rank scores.
   * Returns `[]` (not throwing) if the query produces no usable tokens.
   */
  private async runFtsQuery(
    companyId: string,
    raw: string,
    source?: string,
  ): Promise<Array<{ id: string; text_score: number }>> {
    const tsQuery = buildFtsQuery(raw);
    if (!tsQuery) return [];
    try {
      return await prisma.$queryRawUnsafe<Array<{ id: string; text_score: number }>>(
        `SELECT "id", ts_rank("textSearch", to_tsquery('simple', $1)) AS text_score
           FROM "MemoryChunk"
          WHERE "companyId" = $2
            AND "textSearch" @@ to_tsquery('simple', $1)
            ${source ? `AND "source" = $3` : ''}
          ORDER BY text_score DESC
          LIMIT 20`,
        tsQuery,
        companyId,
        ...(source ? [source] : []),
      );
    } catch (err) {
      this.logger.warn(
        `[Memory] FTS query failed for "${raw}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  // ── Recall tracking (feeds the dreaming job) ─────────────────────────────

  async recordRecalls(companyId: string, query: string, hits: SearchHit[]): Promise<void> {
    if (hits.length === 0) return;
    const queryHash = await sha256(query.toLowerCase().trim());
    const today = new Date().toISOString().slice(0, 10);

    for (const hit of hits) {
      const key = `${hit.source}:${hit.path}:${hit.startLine}:${hit.endLine}`;
      const existing = await prisma.recallEntry.findUnique({
        where: { companyId_key: { companyId, key } },
      });

      if (existing) {
        const queryHashes = existing.queryHashes.includes(queryHash)
          ? existing.queryHashes
          : [queryHash, ...existing.queryHashes].slice(0, 32);
        const recallDays = existing.recallDays.includes(today)
          ? existing.recallDays
          : [today, ...existing.recallDays].slice(0, 16);

        await prisma.recallEntry.update({
          where: { id: existing.id },
          data: {
            recallCount: existing.recallCount + 1,
            totalScore: existing.totalScore + hit.score,
            maxScore: Math.max(existing.maxScore, hit.score),
            lastRecalledAt: new Date(),
            queryHashes,
            recallDays,
          },
        });
      } else {
        await prisma.recallEntry.create({
          data: {
            companyId,
            key,
            path: hit.path,
            startLine: hit.startLine,
            endLine: hit.endLine,
            source: hit.source,
            snippet: hit.text.slice(0, 500),
            recallCount: 1,
            totalScore: hit.score,
            maxScore: hit.score,
            queryHashes: [queryHash],
            recallDays: [today],
            conceptTags: [],
          },
        });
      }
    }
  }

  // ── MEMORY.md helpers ────────────────────────────────────────────────────

  /** Append a titled section to MEMORY.md (creates the file if missing). */
  async appendToMemoryDoc(companyId: string, title: string, body: string): Promise<void> {
    const path = 'MEMORY.md';
    const existing = (await this.readFile(companyId, path)) ?? '# Long-Term Memory\n';
    const stamp = new Date().toISOString().slice(0, 10);
    const next = `${existing.replace(/\s+$/, '')}\n\n## ${title}\n_${stamp}_\n\n${body.trim()}\n`;
    await this.writeFile(companyId, path, next, 'memory');
  }

  /**
   * Build the OpenClaw-style "Memory Recall" prompt section.
   *
   * IMPORTANT: this no longer inlines MEMORY.md verbatim. Mirroring OpenClaw's
   * `extensions/memory-core/src/prompt-section.ts`, the system prompt only
   * tells the agent *how* to use the memory tools — actual recall happens via
   * `memory_search` / `memory_get`. This avoids the dual-source-of-truth bug
   * where the AI distrusted its own inlined context after `memory_search`
   * returned an empty result.
   */
  async getSystemPromptMemory(companyId: string): Promise<string> {
    // Skip the entire section when the company has nothing indexed yet — the
    // AI shouldn't be told to call a tool that has zero rows to find.
    const fileCount = await prisma.memoryFile.count({ where: { companyId } });
    if (fileCount === 0) return '';
    return [
      '## Memory Recall',
      'Before answering anything about prior work, decisions, dates, people, preferences, or todos: run `memory_search` against MEMORY.md, memory/*.md, and indexed sessions, then use `memory_get` to fetch the exact lines you need. If results are empty or low-confidence after searching, say so explicitly — do not guess from training data.',
      'When citing a memory snippet in your reply, include the path and line range like `Source: MEMORY.md#15-22` so the user can verify it.',
    ].join('\n');
  }

  // ── Stats (used by the dashboard memory page) ────────────────────────────

  async stats(companyId: string) {
    const [files, chunks, recalls, embedded] = await Promise.all([
      prisma.memoryFile.count({ where: { companyId } }),
      prisma.memoryChunk.count({ where: { companyId } }),
      prisma.recallEntry.count({ where: { companyId } }),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "MemoryChunk" WHERE "companyId" = $1 AND "embedding" IS NOT NULL`,
        companyId,
      ),
    ]);
    return {
      files,
      chunks,
      recalls,
      embeddedChunks: Number(embedded[0]?.count ?? 0),
      embeddingDim: EMBEDDING_DIM,
    };
  }
}
