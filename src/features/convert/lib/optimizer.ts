import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export interface OptimizationResult {
  url: string;
  outputName: string;
  sizeKB: number;
  preset: string;
  settings: {
    quality: number;
    compression: number;
  };
}

export type OptimizationPreset = "high-quality" | "balanced" | "compressed";

/**
 * 프리셋 기반 최적화
 * 복잡한 분석 없이 검증된 설정 조합 사용
 */
export async function optimizeGifToWebp({
  ffmpeg,
  input,
  preset = "balanced",
  progressCallback,
}: {
  ffmpeg: FFmpeg;
  input: File | string;
  preset?: OptimizationPreset;
  progressCallback?: (progress: number, message: string) => void;
}): Promise<OptimizationResult | null> {
  if (!ffmpeg) return null;

  const updateProgress = (progress: number, message: string) => {
    if (progressCallback) {
      progressCallback(progress, message);
    }
  };

  // 프리셋별 설정
  const presetConfigs = {
    "high-quality": {
      quality: 90,
      compression: 4,
      filter: "lanczos",
      dither: "floyd_steinberg",
    },
    balanced: {
      quality: 85,
      compression: 5,
      filter: "lanczos",
      dither: "bayer:bayer_scale=2",
    },
    compressed: {
      quality: 75,
      compression: 6,
      filter: "spline",
      dither: "bayer:bayer_scale=3",
    },
  };

  const config = presetConfigs[preset];

  updateProgress(10, "GIF 메타데이터 확인 중...");

  // 파일명 추출
  let baseName = "converted";
  if (typeof input !== "string" && input instanceof File) {
    baseName = input.name.replace(/\.[^/.]+$/, "");
  } else if (typeof input === "string" && input.includes("/")) {
    baseName = input.split("/").pop()?.replace(/\.[^/.]+$/, "") || "sample";
  }

  const inputName = "input.gif";
  const outputName = `${baseName}_optimized.webp`;

  updateProgress(20, "파일 로드 중...");
  await ffmpeg.writeFile(inputName, await fetchFile(input));

  // GIF 알파 채널 확인 (간단한 방법)
  updateProgress(30, "이미지 분석 중...");
  const hasAlpha = await checkAlphaChannel(ffmpeg, inputName);

  updateProgress(50, `${preset} 프리셋으로 변환 중...`);

  // 팔레트 최적화 적용
  const paletteFile = "palette.png";

  try {
    // 팔레트 생성
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      "palettegen=max_colors=256:stats_mode=diff",
      "-y",
      paletteFile,
    ]);

    // 팔레트 적용하여 변환
    const filterComplex = hasAlpha
      ? `fps=10,scale=iw:-1:flags=${config.filter}[x];[x][1:v]paletteuse=dither=${config.dither}`
      : `fps=10,scale=iw:-1:flags=${config.filter},format=yuv420p[x];[x][1:v]paletteuse=dither=${config.dither}`;

    await ffmpeg.exec([
      "-i",
      inputName,
      "-i",
      paletteFile,
      "-filter_complex",
      filterComplex,
      "-c:v",
      "libwebp",
      "-q:v",
      String(config.quality),
      "-compression_level",
      String(config.compression),
      "-preset",
      "picture",
      "-loop",
      "0",
      "-an",
      "-y",
      outputName,
    ]);
  } catch (error) {
    // 팔레트 실패 시 기본 변환
    console.warn("팔레트 변환 실패, 기본 모드로 전환:", error);

    const filterChain = hasAlpha
      ? `fps=10,scale=iw:-1:flags=${config.filter},format=yuva420p`
      : `fps=10,scale=iw:-1:flags=${config.filter},format=yuv420p`;

    await ffmpeg.exec([
      "-i",
      inputName,
      "-filter:v",
      filterChain,
      "-c:v",
      "libwebp",
      "-q:v",
      String(config.quality),
      "-compression_level",
      String(config.compression),
      "-preset",
      "picture",
      "-pix_fmt",
      hasAlpha ? "yuva420p" : "yuv420p",
      "-loop",
      "0",
      "-an",
      "-y",
      outputName,
    ]);
  }

  updateProgress(90, "결과 생성 중...");

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  const blob = new Blob([data.slice().buffer], { type: "image/webp" });
  const url = URL.createObjectURL(blob);

  // 정리
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(paletteFile);
  } catch {
    // 정리 실패 무시
  }

  updateProgress(100, "완료!");

  return {
    url,
    outputName,
    sizeKB: blob.size / 1024,
    preset,
    settings: {
      quality: config.quality,
      compression: config.compression,
    },
  };
}

/**
 * 간단한 알파 채널 확인
 * 첫 프레임만 PNG로 변환하여 확인
 */
async function checkAlphaChannel(
  ffmpeg: FFmpeg,
  inputName: string
): Promise<boolean> {
  const testFrame = "alpha_test.png";

  try {
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vframes",
      "1",
      "-f",
      "image2",
      testFrame,
    ]);

    const data = (await ffmpeg.readFile(testFrame)) as Uint8Array;

    // PNG 헤더에서 컬러 타입 확인
    // PNG 시그니처 확인
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      // IHDR 청크의 컬러 타입 (인덱스 25)
      const colorType = data[25];
      // 4 = Grayscale+Alpha, 6 = RGBA
      const hasAlpha = colorType === 4 || colorType === 6;

      await ffmpeg.deleteFile(testFrame);
      return hasAlpha;
    }

    await ffmpeg.deleteFile(testFrame);
    return false;
  } catch {
    return false;
  }
}
