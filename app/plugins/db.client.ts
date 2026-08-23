import { createDB } from '~/db'

export default defineNuxtPlugin(() => {
  // coi-serviceworker registers asynchronously and reloads the page on first visit.
  // Skip PGlite initialization until crossOriginIsolated is true (post-reload).
  // dbReady will remain pending; components awaiting it will be unblocked after reload.
  if (!crossOriginIsolated) return
  const { app } = useRuntimeConfig()
  // Non-blocking: db initializes in the background while the app mounts.
  // Components gate db access via initializeKnowledgeDB() which awaits dbReady.
  createDB(app.baseURL).catch(console.error)
})
