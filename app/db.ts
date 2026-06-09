import { PGlite } from '@electric-sql/pglite'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { vector } from '@electric-sql/pglite/vector'

const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
  WebAssembly.compileStreaming(fetch('/pglite/pglite.wasm')),
  WebAssembly.compileStreaming(fetch('/pglite/initdb.wasm')),
  fetch('/pglite/pglite.data').then((r) => r.blob()),
])

const vectorWithPublicPath = {
  name: vector.name,
  setup: async (pg: PGlite, opts: Record<string, unknown>) => {
    const result = await vector.setup(pg, opts)
    return {
      ...result,
      bundlePath: new URL('/pglite/vector.tar.gz', location.href),
    }
  },
}

export const db: PGliteWithLive = await PGlite.create({
  pgliteWasmModule,
  initdbWasmModule,
  fsBundle,
  extensions: {
    live,
    vector: vectorWithPublicPath,
  },
  dataDir: 'idb://knowledge-studio-pglite',
})

export async function initializeKnowledgeDB(): Promise<void> {
  await db.exec(`
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE TABLE IF NOT EXISTS notes (
            id UUID PRIMARY KEY,
            note TEXT NOT NULL,
            embedding vector(384),
            created_at TIMESTAMPTZ DEFAULT now()
        );
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
        CREATE TABLE IF NOT EXISTS tags (
            id   UUID PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS note_tags_note_id_idx ON note_tags(note_id);
        CREATE INDEX IF NOT EXISTS note_tags_tag_id_idx ON note_tags(tag_id);
    `)
}
