import { PGlite } from '@electric-sql/pglite'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { vector } from '@electric-sql/pglite/vector'

const state: { db: PGliteWithLive | null } = { db: null }

let _resolveDbReady!: () => void
let _rejectDbReady!: (err: Error) => void
export const dbReady = new Promise<void>((resolve, reject) => {
  _resolveDbReady = resolve
  _rejectDbReady = reject
})
// Suppress unhandled-rejection events on routes that never await dbReady,
// while still propagating the rejection to callers that do await it.
dbReady.catch(() => {})

export function rejectDB(err: Error): void {
  _rejectDbReady(err)
}

export const db = new Proxy({} as PGliteWithLive, {
  get(_target, prop) {
    if (!state.db) throw new Error('DB not initialized')
    const value = Reflect.get(state.db, prop, state.db)
    return typeof value === 'function' ? value.bind(state.db) : value
  },
})

let _baseURL: string | null = null
let _startPromise: Promise<void> | null = null

export function configureDB(baseURL: string): void {
  _baseURL = baseURL
}

export function startDB(): Promise<void> {
  if (!_startPromise) {
    if (!_baseURL) {
      const err = new Error('DB not configured: configureDB must be called first')
      _rejectDbReady(err)
      _startPromise = Promise.reject(err)
      _startPromise.catch(() => {})
    } else {
      _startPromise = createDB(_baseURL)
    }
  }
  return _startPromise
}

async function createDB(baseURL: string): Promise<void> {
  try {
    const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
      WebAssembly.compileStreaming(fetch(`${baseURL}pglite/pglite.wasm`)),
      WebAssembly.compileStreaming(fetch(`${baseURL}pglite/initdb.wasm`)),
      fetch(`${baseURL}pglite/pglite.data`).then((r) => r.blob()),
    ])

    const vectorWithPublicPath = {
      name: vector.name,
      setup: async (pg: PGlite, opts: Record<string, unknown>) => {
        const result = await vector.setup(pg, opts)
        return {
          ...result,
          bundlePath: new URL(`${baseURL}pglite/vector.tar.gz`, location.href),
        }
      },
    }

    state.db = await PGlite.create({
      pgliteWasmModule,
      initdbWasmModule,
      fsBundle,
      extensions: {
        live,
        vector: vectorWithPublicPath,
      },
      dataDir: 'idb://knowledge-studio-pglite',
    })
    _resolveDbReady()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    _rejectDbReady(error)
    throw error
  }
}

export async function initializeKnowledgeDB(): Promise<void> {
  await startDB()
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
