
import { useState, useCallback, useRef } from 'react';
import { startTransition } from 'react';
import { BackgroundProcessor } from '@/utils/backgroundProcessor';

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
}

export const useBackgroundProcessing = () => {
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const processInBackground = useCallback(async <T, R>(
    items: T[],
    processor: (item: T, index: number) => R | Promise<R>,
    onComplete?: (results: R[]) => void
  ) => {
    // Cancel any existing processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    // Use React's startTransition for non-urgent state updates
    startTransition(() => {
      setState({
        isProcessing: true,
        progress: 0,
        error: null
      });
    });

    try {
      const results: R[] = [];
      
      await BackgroundProcessor.processInMicroChunks(
        items,
        async (item, index) => {
          const result = await processor(item, index);
          results.push(result);
        },
        {
          onProgress: (completed, total) => {
            startTransition(() => {
              setState(prev => ({ ...prev, progress: completed / total }));
            });
          },
          signal: abortControllerRef.current!.signal
        }
      );
      
      startTransition(() => {
        setState({
          isProcessing: false,
          progress: 1,
          error: null
        });
      });
      
      onComplete?.(results);
    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        startTransition(() => {
          setState({
            isProcessing: false,
            progress: 0,
            error: error instanceof Error ? error.message : 'Processing failed'
          });
        });
      }
    }
  }, []);

  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      startTransition(() => {
        setState({
          isProcessing: false,
          progress: 0,
          error: null
        });
      });
    }
  }, []);

  return {
    ...state,
    processInBackground,
    cancelProcessing
  };
};
