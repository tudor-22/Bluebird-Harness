export interface EmbeddingProvider {
  readonly name: string;
  /** Returns one vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}
