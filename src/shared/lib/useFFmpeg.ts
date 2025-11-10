import { useEffect, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { loadingMessages } from "../constants/loadingMessages";

export function useFFmpeg() {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    (async () => {
      const ff = new FFmpeg();
      ff.on("progress", ({ progress }) => {
        const percent = Math.round(progress * 100);
        setProgress(percent);
        const step = Math.floor(percent / (100 / loadingMessages.length));
        if (step >= 0 && step < loadingMessages.length) {
          setLoadingMessage(loadingMessages[step]);
        }
      });
      await ff.load();
      setFfmpeg(ff);
      setReady(true);
    })().catch(console.error);
  }, []);

  const resetProgress = () => {
    setProgress(0);
    setLoadingMessage("");
  };

  return { ffmpeg, ready, progress, loadingMessage, setProgress, setLoadingMessage, resetProgress } as const;
}
