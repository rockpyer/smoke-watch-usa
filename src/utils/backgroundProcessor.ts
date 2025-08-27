
// Dedicated background processor for heavy computations
export class BackgroundProcessor {
  private static readonly MICRO_CHUNK_SIZE = 5; // Very small chunks
  private static readonly MICRO_TIME_SLICE = 0.5; // Ultra-short time slices

  // Process work in micro-chunks with maximum yielding
  static async processInMicroChunks<T>(
    items: T[],
    processor: (item: T, index: number) => void | Promise<void>,
    options: {
      onProgress?: (completed: number, total: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<void> {
    const { onProgress, signal } = options;
    let completed = 0;

    for (let index = 0; index < items.length; index += this.MICRO_CHUNK_SIZE) {
      // Check for abort signal
      if (signal?.aborted) {
        throw new Error('Processing aborted');
      }

      const endIndex = Math.min(index + this.MICRO_CHUNK_SIZE, items.length);
      const startTime = performance.now();
      
      // Process micro-chunk
      for (let i = index; i < endIndex; i++) {
        await processor(items[i], i);
        completed++;
        
        // Break early if time slice exceeded
        if (performance.now() - startTime > this.MICRO_TIME_SLICE) {
          break;
        }
      }
      
      // Report progress
      onProgress?.(completed, items.length);
      
      // Yield to main thread using the most effective method available
      await this.yieldToMain();
    }
  }

  // Most effective yielding strategy
  private static async yieldToMain(): Promise<void> {
    return new Promise(resolve => {
      // Use scheduler API with background priority if available
      if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
        (window as any).scheduler.postTask(resolve, { priority: 'background' });
      }
      // Use MessageChannel for immediate yielding
      else if (typeof MessageChannel !== 'undefined') {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      }
      // Fallback to setTimeout with minimal delay
      else {
        setTimeout(resolve, 0);
      }
    });
  }

  // Process with automatic progress reporting
  static async processWithProgress<T>(
    items: T[],
    processor: (item: T, index: number) => void | Promise<void>,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await this.processInMicroChunks(items, processor, {
      onProgress: (completed, total) => onProgress(completed / total),
      signal
    });
  }
}
