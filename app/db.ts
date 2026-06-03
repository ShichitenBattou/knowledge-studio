import { PGlite } from '@electric-sql/pglite'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { vector } from '@electric-sql/pglite/vector'

const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
    WebAssembly.compileStreaming(fetch('/pglite/pglite.wasm')),
    WebAssembly.compileStreaming(fetch('/pglite/initdb.wasm')),
    fetch('/pglite/pglite.data').then(r => r.blob()),
])

const vectorWithPublicPath = {
    name: vector.name,
    setup: async (pg: any, opts: any) => {
        const result = await vector.setup(pg, opts)
        return {
            ...result,
            bundlePath: new URL('/pglite/vector.tar.gz', location.href)
        }
    }
}

export const db: PGliteWithLive = await PGlite.create({
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle,
    extensions: {
        live,
        vector: vectorWithPublicPath,
    },
    dataDir: 'idb://knowledge-studio-pglite'
})
