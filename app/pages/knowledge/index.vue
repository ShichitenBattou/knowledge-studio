<script setup lang="ts">
const {
  allNotes,
  allTags,
  isEmbeddingLoading,
  handleCreate,
  handleUpdate,
  deleteNote,
  deleteTag,
  renameTag,
} = useKnowledge()
</script>

<template>
  <UContainer class="py-8 max-w-3xl">
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-4">ナレッジ追加</h2>
      <KnowledgeAddForm
        :all-tags="allTags"
        :is-embedding-loading="isEmbeddingLoading"
        :on-create="handleCreate"
      />
    </section>

    <USeparator class="mb-8" />

    <section>
      <KnowledgeList
        :all-notes="allNotes"
        :all-tags="allTags"
        :is-embedding-loading="isEmbeddingLoading"
        :on-update="handleUpdate"
        :on-delete="deleteNote"
        :on-delete-tag="deleteTag"
        :on-rename-tag="renameTag"
      />
    </section>
  </UContainer>
</template>
