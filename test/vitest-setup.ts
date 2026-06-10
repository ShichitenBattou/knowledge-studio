import * as vue from 'vue'

// Nuxt が auto-import で提供する Vue API をグローバルに注入する
// （ソースファイルは explicit import を持たず Nuxt が inject するため）
Object.assign(globalThis, vue)
