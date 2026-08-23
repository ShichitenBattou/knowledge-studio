import { configureDB, rejectDB } from '~/db'

export default defineNuxtPlugin(() => {
  if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) {
    // coi-serviceworker will reload the page to enable cross-origin isolation.
    // If it cannot (insecure origin, unsupported context), reject so components can show an error.
    rejectDB(new Error('SharedArrayBuffer unavailable: cross-origin isolation required'))
    return
  }
  const { app } = useRuntimeConfig()
  // Store the base URL without starting PGlite yet.
  // DB initialization is deferred to the first call of startDB() from a DB-backed route.
  configureDB(app.baseURL)
})
