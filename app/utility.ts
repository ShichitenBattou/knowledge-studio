export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
