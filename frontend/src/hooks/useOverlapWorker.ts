
// src/hooks/useOverlapWorker.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CalculatedHabitat } from '@/types/map';

/**
 * Хук для расчёта пересечений и интенсивности через Web Worker
 */
export function useOverlapWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(new URL('@/workers/overlapWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (e) => {
      setResults(e.data.results);
      setLoading(false);
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const calculate = useCallback((habitats: CalculatedHabitat[]) => {
    if (!workerRef.current) return;
    setLoading(true);
    workerRef.current.postMessage({ habitats });
  }, []);

  return { results, progress, loading, calculate };
}

