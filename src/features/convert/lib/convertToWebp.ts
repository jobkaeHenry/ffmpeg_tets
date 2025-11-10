import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

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
}): Promise<{ url: string; outputName: string; sizeKB: number } | null> {
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
    "scale=iw:-1:flags=neighbor,format=rgba",
    "-c:v",
    "libwebp",
    "-q:v",
    String(quality),
    "-compression_level",
    String(compression),
    "-preset",
    "drawing",
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

  return { url, outputName, sizeKB: blob.size / 1024 };
}
