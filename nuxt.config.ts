// https://nuxt.com/docs/api/configuration/nuxt-config
const baseURL = process.env.NUXT_APP_BASE_URL ?? '/'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  app: {
    baseURL,
    head: {
      script: [
        {
          // process polyfill: Nuxt replaces globalThis.process.env with {} (truthy),
          // causing PGlite to access process.exitCode → ReferenceError in browsers.
          // Injecting a minimal process object before bundles load prevents that.
          innerHTML:
            'window.process=window.process||{env:{},argv:[],versions:{},version:"v18",platform:"browser",browser:true,exitCode:0}',
        },
        { src: `${baseURL}coi-serviceworker.js` },
      ],
    },
  },
  colorMode: {
    preference: 'dark',
  },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  vite: {
    define: {
      'process.env': '{}',
      'process.argv': '[]',
      'process.platform': '"browser"',
      'process.version': '"v18.0.0"',
      'process.versions': '{}',
      'process.browser': 'true',
    },
  },
})
