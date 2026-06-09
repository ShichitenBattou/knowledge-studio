<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Home',
    to: '/',
    icon: 'i-lucide-book-open',
    active: route.path === '/',
  },
  {
    label: 'About',
    to: '/about',
    icon: 'i-lucide-info',
    active: route.path.startsWith('/about'),
  },
  {
    label: 'Knowledge',
    to: '/knowledge',
    icon: 'i-lucide-brain',
    active: route.path.startsWith('/knowledge'),
  },
  {
    label: 'PGlite',
    to: '/pglite',
    icon: 'i-lucide-database',
    active: route.path.startsWith('/pglite'),
  },
])
</script>

<template>
  <UApp>
    <UHeader title="Knowledge Studio">
      <UNavigationMenu :items="items" />

      <template #right>
        <UColorModeButton />

        <UTooltip text="Open on GitHub" :kbds="['meta', 'G']">
          <UButton
            color="neutral"
            variant="ghost"
            to="https://github.com/"
            target="_blank"
            icon="i-simple-icons-github"
            aria-label="GitHub"
          />
        </UTooltip>
      </template>

      <template #body>
        <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <UFooter class="bg-red-50">
      <div class="text-center text-sm text-gray-500">
        &copy; 2024 Knowledge Studio. All rights reserved.
      </div>
    </UFooter>
  </UApp>
</template>
