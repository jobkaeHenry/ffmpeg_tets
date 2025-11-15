import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
  analyzeGifMetadata,
  analyzePaletteSize,
  type GifMetadata,
} from "./gifAnalyzer";
import {
  calculateAllMetrics,
  type QualityMetrics,
} from "./qualityMetrics";

export interface OptimizationConfig {
  quality: number;
  compression: number;
  preset: string;
  scaleFilter: string;
  ditherMethod: string;
  pixelFormat: string;
  usePalette: boolean;
  lossless: boolean; // 무손실 모드 플래그
}

export interface OptimizationResult {
  url: string;
  outputName: string;
  sizeKB: number;
  config: OptimizationConfig;
  metrics: QualityMetrics;
  metadata: GifMetadata;
  compressionRatio: number;
}

interface CandidateResult {
  blob: Blob;
  config: OptimizationConfig;
  sizeKB: number;
}

/**
 * 최적화된 GIF → WebP 변환
 * 여러 설정 조합을 테스트하여 최적의 결과를 자동 선택
 */
export async function optimizeGifToWebp({
  ffmpeg,
  input,
  progressCallback,
  lossless = false, // 무손실 모드 (기본값: 손실)
}: {
  ffmpeg: FFmpeg;
  input: File | string;
  progressCallback?: (progress: number, message: string) => void;
  lossless?: boolean;
}): Promise<OptimizationResult | null> {
  if (!ffmpeg) return null;

  const updateProgress = (progress: number, message: string) => {
    if (progressCallback) {
      progressCallback(progress, message);
    }
  };

  updateProgress(5, "GIF 메타데이터 분석 중...");

  // 1단계: GIF 분석
  const metadata = await analyzeGifMetadata(ffmpeg, input);
  updateProgress(15, `프레임 분석 완료: ${metadata.frameCount}개 프레임`);

  const paletteSize = await analyzePaletteSize(input);
  updateProgress(20, `팔레트 크기: ${paletteSize}색`);

  // 2단계: 설정 조합 생성
  const configs = generateOptimizationConfigs(metadata, paletteSize, lossless);
  updateProgress(
    25,
    `${configs.length}개 설정 조합 테스트 시작... (${lossless ? "무손실" : "손실"} 모드)`
  );

  // 3단계: 각 설정으로 변환 테스트
  const candidates: CandidateResult[] = [];
  const inputName = "opt_input.gif";
  await ffmpeg.writeFile(inputName, await fetchFile(input));

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const progress = 25 + (i / configs.length) * 50;
    updateProgress(
      progress,
      `테스트 중 (${i + 1}/${configs.length}): Q=${config.quality}, C=${config.compression}`
    );

    try {
      const result = await convertWithConfig(
        ffmpeg,
        inputName,
        config,
        metadata,
        i
      );
      if (result) {
        candidates.push(result);
      }
    } catch (error) {
      console.warn(`Config ${i} failed:`, error);
      // 실패한 설정은 건너뛰기
      continue;
    }
  }

  if (candidates.length === 0) {
    throw new Error("모든 변환 시도가 실패했습니다");
  }

  updateProgress(75, "품질 평가 중...");

  // 4단계: 원본 GIF를 첫 프레임 PNG로 변환 (품질 비교용)
  const originalBlob = await extractFirstFrame(ffmpeg, inputName);

  // 5단계: 품질 메트릭 계산 및 최적 후보 선택
  let bestCandidate: CandidateResult | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const progress = 75 + (i / candidates.length) * 15;
    updateProgress(progress, `품질 측정 (${i + 1}/${candidates.length})`);

    try {
      const metrics = await calculateAllMetrics(originalBlob, candidate.blob);

      // 품질 기준: SSIM ≥ 0.98, ΔE ≤ 2.3, Edge ≥ 0.95
      const meetsQualityCriteria =
        metrics.ssim >= 0.98 &&
        metrics.deltaE <= 2.3 &&
        metrics.edgePreservation >= 0.95;

      // 완화된 기준: SSIM ≥ 0.95
      const meetsRelaxedCriteria = metrics.ssim >= 0.95;

      if (meetsQualityCriteria || meetsRelaxedCriteria) {
        // 점수 계산: 품질 유지하면서 용량 최소화
        const qualityScore =
          metrics.ssim * 0.4 +
          (1 - metrics.deltaE / 10) * 0.3 +
          metrics.edgePreservation * 0.3;

        const sizeScore = 1 / candidate.sizeKB;
        const score = qualityScore * 0.7 + sizeScore * 0.3;

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    } catch (error) {
      console.warn(`Quality check failed for candidate ${i}:`, error);
      continue;
    }
  }

  // 품질 기준을 만족하는 후보가 없으면 가장 높은 품질의 후보 선택
  if (!bestCandidate && candidates.length > 0) {
    updateProgress(90, "품질 기준 완화, 최상 품질 선택 중...");
    bestCandidate = candidates.reduce((best, current) =>
      current.config.quality > best.config.quality ? current : best
    );
  }

  if (!bestCandidate) {
    throw new Error("최적 설정을 찾을 수 없습니다");
  }

  updateProgress(95, "최종 품질 확인 중...");

  // 최종 메트릭 계산
  const finalMetrics = await calculateAllMetrics(
    originalBlob,
    bestCandidate.blob
  );

  const url = URL.createObjectURL(bestCandidate.blob);

  let baseName = "converted";
  if (typeof input !== "string" && input instanceof File) {
    baseName = input.name.replace(/\.[^/.]+$/, "");
  } else if (typeof input === "string" && input.includes("/")) {
    baseName = input.split("/").pop()?.replace(/\.[^/.]+$/, "") || "sample";
  }

  const outputName = `${baseName}_optimized.webp`;

  // 원본 크기 계산
  const originalSize =
    input instanceof File
      ? input.size / 1024
      : (await (await fetch(input)).blob()).size / 1024;

  const compressionRatio = bestCandidate.sizeKB / originalSize;

  // 임시 파일 정리
  try {
    await ffmpeg.deleteFile(inputName);
  } catch {
    // 정리 실패 무시
  }

  updateProgress(100, "변환 완료!");

  return {
    url,
    outputName,
    sizeKB: bestCandidate.sizeKB,
    config: bestCandidate.config,
    metrics: finalMetrics,
    metadata,
    compressionRatio,
  };
}

/**
 * 메타데이터 기반 최적화 설정 조합 생성
 */
function generateOptimizationConfigs(
  metadata: GifMetadata,
  paletteSize: number,
  lossless: boolean = false
): OptimizationConfig[] {
  const configs: OptimizationConfig[] = [];

  // 알파 채널 여부에 따른 픽셀 포맷
  const pixelFormats = metadata.hasAlpha ? ["yuva444p"] : ["yuv420p"];

  // 팔레트 사용 여부 (256색 이하면 팔레트 최적화)
  const usePalette = paletteSize > 0 && paletteSize <= 256;

  if (lossless) {
    // 무손실 모드: quality는 압축 레벨 (0-100, 100=최대 압축)
    // compression_level은 속도/크기 트레이드오프 (0-6)
    const qualityLevels = [100, 95, 90]; // 압축 강도
    const compressionLevels = [6, 5, 4]; // 압축 레벨

    for (const quality of qualityLevels) {
      for (const compression of compressionLevels) {
        if (configs.length >= 6) break;

        configs.push({
          quality,
          compression,
          preset: "picture",
          scaleFilter: "lanczos",
          ditherMethod: "bayer:bayer_scale=2",
          pixelFormat: pixelFormats[0],
          usePalette: false, // 무손실에서는 팔레트 사용 안 함
          lossless: true,
        });
      }
    }
  } else {
    // 손실 모드 (기존 로직)
    // 품질 레벨: 높음(85), 중간(80), 낮음(75)
    const qualityLevels = [85, 80, 75];

    // 압축 레벨: 최고(5), 높음(4), 중간(3)
    const compressionLevels = [5, 4, 3];

    // 스케일 필터: Lanczos (기본), Spline36 (대안)
    const scaleFilters = ["lanczos", "spline36"];

    // 디더링: Bayer, Floyd-Steinberg
    const ditherMethods = ["bayer:bayer_scale=2", "floyd_steinberg"];

    // 조합 생성 (너무 많으면 성능 문제 → 상위 조합만)
    for (const quality of qualityLevels) {
      for (const compression of compressionLevels) {
        // 각 품질에 대해 2개의 조합만 생성 (성능 최적화)
        if (configs.length >= 6) break;

        const scaleFilter = scaleFilters[0]; // 기본 Lanczos
        const dither = ditherMethods[0]; // 기본 Bayer

        configs.push({
          quality,
          compression,
          preset: "picture",
          scaleFilter,
          ditherMethod: dither,
          pixelFormat: pixelFormats[0],
          usePalette,
          lossless: false,
        });
      }
    }
  }

  return configs;
}

/**
 * 특정 설정으로 변환 실행
 */
async function convertWithConfig(
  ffmpeg: FFmpeg,
  inputName: string,
  config: OptimizationConfig,
  metadata: GifMetadata,
  index: number
): Promise<CandidateResult | null> {
  const outputName = `candidate_${index}.webp`;

  // 필터 구성
  let filterChain = `fps=${metadata.fps}`;
  filterChain += `,scale=iw:-1:flags=${config.scaleFilter}`;

  // 팔레트 사용 시
  if (config.usePalette) {
    const paletteFile = `palette_${index}.png`;

    // 팔레트 생성
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      `palettegen=max_colors=256:stats_mode=diff`,
      "-y",
      paletteFile,
    ]);

    // 팔레트 적용
    filterChain += `[x];[x][1:v]paletteuse=dither=${config.ditherMethod}`;

    await ffmpeg.exec([
      "-i",
      inputName,
      "-i",
      paletteFile,
      "-filter_complex",
      filterChain,
      "-c:v",
      "libwebp",
      "-q:v",
      String(config.quality),
      "-compression_level",
      String(config.compression),
      "-preset",
      config.preset,
      "-loop",
      "0",
      "-an",
      "-y",
      outputName,
    ]);

    // 팔레트 파일 삭제
    try {
      await ffmpeg.deleteFile(paletteFile);
    } catch {
      // 무시
    }
  } else {
    // 일반 변환
    filterChain += `,format=${config.pixelFormat}`;

    const ffmpegArgs = [
      "-i",
      inputName,
      "-filter:v",
      filterChain,
      "-c:v",
      "libwebp",
    ];

    // 무손실 모드 처리
    if (config.lossless) {
      ffmpegArgs.push("-lossless", "1");
      ffmpegArgs.push("-quality", String(config.quality)); // 압축 레벨
    } else {
      ffmpegArgs.push("-q:v", String(config.quality)); // 품질
    }

    ffmpegArgs.push(
      "-compression_level",
      String(config.compression),
      "-preset",
      config.preset,
      "-pix_fmt",
      config.pixelFormat,
      "-loop",
      "0",
      "-an",
      "-y",
      outputName
    );

    await ffmpeg.exec(ffmpegArgs);
  }

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  const blob = new Blob([data.slice().buffer], { type: "image/webp" });

  // 출력 파일 삭제
  try {
    await ffmpeg.deleteFile(outputName);
  } catch {
    // 무시
  }

  return {
    blob,
    config,
    sizeKB: blob.size / 1024,
  };
}

/**
 * GIF의 첫 프레임을 PNG로 추출 (품질 비교용)
 */
async function extractFirstFrame(
  ffmpeg: FFmpeg,
  inputName: string
): Promise<Blob> {
  const frameName = "first_frame.png";

  await ffmpeg.exec([
    "-i",
    inputName,
    "-vframes",
    "1",
    "-f",
    "image2",
    frameName,
  ]);

  const data = (await ffmpeg.readFile(frameName)) as Uint8Array;
  const blob = new Blob([data.slice().buffer], { type: "image/png" });

  try {
    await ffmpeg.deleteFile(frameName);
  } catch {
    // 무시
  }

  return blob;
}
