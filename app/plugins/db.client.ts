import { createDB } from '~/db'

export default defineNuxtPlugin(async () => {
  // coi-serviceworker registers asynchronously and reloads the page on first visit.
  // Skip PGlite initialization until crossOriginIsolated is true (post-reload).
  if (!crossOriginIsolated) return
  const { app } = useRuntimeConfig()
  await createDB(app.baseURL)
})
