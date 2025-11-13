import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { optimizeGifToWebp, type OptimizationPreset } from "./optimizer";

export interface ConversionResult {
  url: string;
  outputName: string;
  sizeKB: number;
  preset?: string;
  settings?: {
    quality: number;
    compression: number;
  };
}

/**
 * 기본 변환
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
    "fps=10,scale=iw:-1:flags=lanczos",
    "-c:v",
    "libwebp",
    "-q:v",
    String(quality),
    "-compression_level",
    String(compression),
    "-preset",
    "picture",
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

  return {
    url,
    outputName,
    sizeKB: blob.size / 1024,
    settings: { quality, compression },
  };
}

/**
 * 프리셋 기반 최적화 변환
 */
export async function convertToWebpOptimized({
  ffmpeg,
  input,
  preset = "balanced",
  analysis,
  progressCallback,
}: {
  ffmpeg: FFmpeg;
  input: File | string;
  preset?: OptimizationPreset;
  analysis?: any;
  progressCallback?: (progress: number, message: string) => void;
}): Promise<ConversionResult | null> {
  if (!ffmpeg) return null;

  const result = await optimizeGifToWebp({
    ffmpeg,
    input,
    preset,
    analysis,
    progressCallback,
  });

  if (!result) return null;

  return {
    url: result.url,
    outputName: result.outputName,
    sizeKB: result.sizeKB,
    preset: result.preset,
    settings: result.settings,
  };
}
