import { pipeline } from '@huggingface/transformers'

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>

let extractor: FeatureExtractionPipeline | null = null

export function useEmbedding() {
    const isLoading = ref(false)

    async function generateEmbedding(text: string): Promise<number[]> {
        isLoading.value = true
        try {
            if (!extractor) {
                extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-V2')
            }
            const output = await extractor(text, { pooling: 'mean', normalize: true })
            return output.data as number[]
        } finally {
            isLoading.value = false
        }
    }

    return { generateEmbedding, isLoading }
}
