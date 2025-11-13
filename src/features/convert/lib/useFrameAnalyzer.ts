import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisProgress, AnalysisResult } from "./frameAnalyzer.worker";

export function useFrameAnalyzer() {
  const workerRef = useRef<Worker | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Web Worker 초기화
    workerRef.current = new Worker(
      new URL("./frameAnalyzer.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, data } = e.data;

      if (type === "progress") {
        setProgress(data);
      } else if (type === "result") {
        setResult(data);
        setAnalyzing(false);
        setProgress(null);
      } else if (type === "error") {
        setError(data.message);
        setAnalyzing(false);
        setProgress(null);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const analyze = useCallback(async (file: File | Blob) => {
    if (!workerRef.current) {
      setError("Worker가 초기화되지 않았습니다");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setProgress({
      phase: "loading",
      progress: 0,
      message: "시작 중...",
    });

    try {
      const arrayBuffer = await file.arrayBuffer();
      workerRef.current.postMessage({
        type: "analyze",
        data: { arrayBuffer },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAnalyzing(false);
      setProgress(null);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
    setAnalyzing(false);
  }, []);

  return {
    analyze,
    analyzing,
    progress,
    result,
    error,
    reset,
  };
}
