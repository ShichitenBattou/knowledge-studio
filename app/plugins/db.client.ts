import { createDB, rejectDB } from '~/db'

export default defineNuxtPlugin(() => {
  if (!crossOriginIsolated) {
    // coi-serviceworker will reload the page to enable cross-origin isolation.
    // If it cannot (insecure origin, unsupported context), reject so components can show an error.
    rejectDB(new Error('SharedArrayBuffer unavailable: cross-origin isolation required'))
    return
  }
  const { app } = useRuntimeConfig()
  // Non-blocking: db initializes in the background while the app mounts.
  // createDB rejects dbReady on failure so components can surface the error.
  createDB(app.baseURL).catch(() => {})
})
