import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { optimizeGifToWebp } from "./optimizer";
import type { QualityMetrics } from "./qualityMetrics";

export interface ConversionResult {
  url: string;
  outputName: string;
  sizeKB: number;
  metrics?: QualityMetrics;
  compressionRatio?: number;
  metadata?: {
    frameCount: number;
    fps: number;
    width: number;
    height: number;
    hasAlpha: boolean;
  };
}

/**
 * 기본 변환 (레거시 - 하위 호환성)
 */
export async function convertToWebp({
  ffmpeg,
  input,
  quality,
  compression,
}: {
  ffmpeg: FFmpeg;
  input: File | string;
  quality: number;
  compression: number;
}): Promise<ConversionResult | null> {
  if (!ffmpeg) return null;

  let baseName = "converted";
  if (typeof input !== "string" && input instanceof File) {
    baseName = input.name.replace(/\.[^/.]+$/, "");
  } else if (typeof input === "string" && input.includes("/")) {
    baseName = input.split("/").pop()?.replace(/\.[^/.]+$/, "") || "sample";
  }

  const inputName = "input.gif";
  const outputName = `${baseName}.webp`;

  await ffmpeg.writeFile(inputName, await fetchFile(input));

  await ffmpeg.exec([
    "-i",
    inputName,
    "-filter:v",
    "scale=iw:-1:flags=lanczos,format=rgba",
    "-c:v",
    "libwebp",
    "-q:v",
    String(quality),
    "-compression_level",
    String(compression),
    "-preset",
    "picture",
    "-pix_fmt",
    "rgba",
    "-loop",
    "0",
    "-an",
    "-vsync",
    "0",
    outputName,
  ]);

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  const blob = new Blob([data.slice().buffer], { type: "image/webp" });
  const url = URL.createObjectURL(blob);

  // 정리
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch {
    // 정리 실패 무시
  }

  return { url, outputName, sizeKB: blob.size / 1024 };
}

/**
 * 최적화된 변환 (자동 품질/압축 탐색)
 */
export async function convertToWebpOptimized({
  ffmpeg,
  input,
  progressCallback,
  lossless = false,
}: {
  ffmpeg: FFmpeg;
  input: File | string;
  progressCallback?: (progress: number, message: string) => void;
  lossless?: boolean;
}): Promise<ConversionResult | null> {
  if (!ffmpeg) return null;

  const result = await optimizeGifToWebp({
    ffmpeg,
    input,
    progressCallback,
    lossless,
  });

  if (!result) return null;

  return {
    url: result.url,
    outputName: result.outputName,
    sizeKB: result.sizeKB,
    metrics: result.metrics,
    compressionRatio: result.compressionRatio,
    metadata: {
      frameCount: result.metadata.frameCount,
      fps: result.metadata.fps,
      width: result.metadata.width,
      height: result.metadata.height,
      hasAlpha: result.metadata.hasAlpha,
    },
  };
}
