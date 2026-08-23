import { createDB } from '~/db'

export default defineNuxtPlugin(async () => {
  const { app } = useRuntimeConfig()
  await createDB(app.baseURL)
})
