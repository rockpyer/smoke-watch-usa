
// Utility for breaking up heavy work into smaller chunks to prevent main-thread blocking
export class AsyncProcessor {
  private static readonly DEFAULT_CHUNK_SIZE = 15; // Reduced from 25
  private static readonly DEFAULT_TIME_SLICE = 2; // Reduced from 5ms

  static async processInChunks<T>(
    items: T[],
    processor: (item: T, index: number) => void | Promise<void>,
    options: {
      chunkSize?: number;
      timeSlice?: number;
      priority?: 'background' | 'user-blocking' | 'user-visible';
    } = {}
  ): Promise<void> {
    const {
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      timeSlice = this.DEFAULT_TIME_SLICE,
      priority = 'background'
    } = options;

    let index = 0;
    
    const processChunk = async (): Promise<void> => {
      const startTime = performance.now();
      const endIndex = Math.min(index + chunkSize, items.length);
      
      // Process items in current chunk
      for (let i = index; i < endIndex; i++) {
        await processor(items[i], i);
        
        // Break earlier if we've exceeded our smaller time slice
        if (performance.now() - startTime > timeSlice) {
          index = i + 1;
          break;
        }
      }
      
      if (index < endIndex) {
        index = endIndex;
      }
      
      // Continue processing if there are more items
      if (index < items.length) {
        await this.scheduleNext(processChunk, priority);
      }
    };
    
    return processChunk();
  }

  private static scheduleNext(
    callback: () => void | Promise<void>, 
    priority: 'background' | 'user-blocking' | 'user-visible'
  ): Promise<void> {
    return new Promise(resolve => {
      // Use scheduler API if available - prefer background priority for FID
      if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
        (window as any).scheduler.postTask(
          async () => {
            await callback();
            resolve();
          },
          { priority: priority === 'user-blocking' ? 'user-blocking' : 'background' }
        );
      }
      // Use requestIdleCallback for all background tasks to improve FID
      else if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
          await callback();
          resolve();
        });
      }
      // Fallback to setTimeout with minimal delay
      else {
        setTimeout(async () => {
          await callback();
          resolve();
        }, 1); // Reduced from 0 to ensure yielding
      }
    });
  }

  static async defer(ms: number = 1): Promise<void> { // Increased default from 0 to 1
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
