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
  // 고급 WebP 옵션
  method?: number; // 0-6: 압축 방법 (6=최고 압축, 0=빠름)
  nearLossless?: number; // 0-100: 시각적 무손실 (0=완전무손실, 100=더 많은 손실)
  useSharpYuv?: boolean; // RGB→YUV 변환 정확도 향상
  encodingStrategy?: "pure-lossless" | "near-lossless" | "hybrid" | "optimized-lossy";
  // 프레임 최적화
  removeDuplicates?: boolean; // 중복 프레임 제거
  deltaEncoding?: boolean; // 프레임 간 차이만 저장
  // 노이즈 제거 & 전처리
  denoise?: boolean; // 노이즈 제거 활성화
  denoiseStrength?: "light" | "medium" | "strong"; // 노이즈 제거 강도
  // 애니메이션 최적화
  minKeyframeInterval?: number; // 최소 키프레임 간격
  maxKeyframeInterval?: number; // 최대 키프레임 간격
  mixedMode?: boolean; // 혼합 모드 (일부 프레임 손실, 일부 무손실)
}

export interface OptimizationResult {
  url: string;
  outputName: string;
  sizeKB: number;
  config: OptimizationConfig;
  metrics: QualityMetrics;
  metadata: GifMetadata;
  compressionRatio: number;
  compressionStats?: {
    originalSizeKB: number;
    compressedSizeKB: number;
    savingsKB: number;
    savingsPercent: number;
    isLargerThanOriginal: boolean;
    bitsPerPixel: number; // 압축 효율성 지표
  };
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

    // 전략 이름 표시
    let strategyName = "";
    switch (config.encodingStrategy) {
      case "pure-lossless":
        strategyName = "완전 무손실";
        break;
      case "near-lossless":
        strategyName = `준무손실 (NL=${config.nearLossless})`;
        break;
      case "hybrid":
        strategyName = "하이브리드 고품질";
        break;
      case "optimized-lossy":
        strategyName = "최적화 손실";
        break;
      default:
        strategyName = "표준";
    }

    updateProgress(
      progress,
      `전략 ${i + 1}/${configs.length}: ${strategyName} (M=${config.method || 4}, C=${config.compression})`
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

      // 인코딩 전략에 따른 품질 기준 설정
      let meetsQualityCriteria = false;

      if (candidate.config.encodingStrategy === "pure-lossless") {
        // 완전 무손실: 매우 엄격한 기준 (실제로는 SSIM 1.0에 가까움)
        meetsQualityCriteria = metrics.ssim >= 0.99;
      } else if (candidate.config.encodingStrategy === "near-lossless") {
        // 준무손실: 시각적으로 구분 불가능한 수준
        meetsQualityCriteria =
          metrics.ssim >= 0.97 &&
          metrics.deltaE <= 3.0 &&
          metrics.edgePreservation >= 0.93;
      } else if (candidate.config.encodingStrategy === "hybrid") {
        // 하이브리드: 높은 품질 기준
        meetsQualityCriteria =
          metrics.ssim >= 0.96 &&
          metrics.deltaE <= 4.0 &&
          metrics.edgePreservation >= 0.92;
      } else {
        // 최적화 손실: 표준 기준
        meetsQualityCriteria =
          metrics.ssim >= 0.95 &&
          metrics.deltaE <= 5.0 &&
          metrics.edgePreservation >= 0.90;
      }

      // 완화된 기준: 모든 전략에 대해 SSIM ≥ 0.92
      const meetsRelaxedCriteria = metrics.ssim >= 0.92;

      if (meetsQualityCriteria || meetsRelaxedCriteria) {
        // 점수 계산: 전략에 따라 가중치 조정
        let qualityWeight = 0.7;
        let sizeWeight = 0.3;

        // 무손실 모드에서는 크기 절약을 더 중요시
        if (lossless) {
          qualityWeight = 0.5; // 품질은 이미 보장됨
          sizeWeight = 0.5; // 크기 최소화에 집중
        }

        const qualityScore =
          metrics.ssim * 0.4 +
          (1 - Math.min(metrics.deltaE / 10, 1)) * 0.3 +
          metrics.edgePreservation * 0.3;

        const sizeScore = 1 / candidate.sizeKB;
        const score = qualityScore * qualityWeight + sizeScore * sizeWeight;

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

  // 압축 통계 계산
  const savingsKB = originalSize - bestCandidate.sizeKB;
  const savingsPercent = ((savingsKB / originalSize) * 100);
  const isLargerThanOriginal = bestCandidate.sizeKB > originalSize;

  // Bits per pixel 계산 (압축 효율성 지표)
  const totalPixels = metadata.width * metadata.height * metadata.frameCount;
  const bitsPerPixel = (bestCandidate.sizeKB * 1024 * 8) / totalPixels;

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
    compressionStats: {
      originalSizeKB: originalSize,
      compressedSizeKB: bestCandidate.sizeKB,
      savingsKB,
      savingsPercent,
      isLargerThanOriginal,
      bitsPerPixel,
    },
  };
}

/**
 * 메타데이터 기반 최적화 설정 조합 생성
 * 다양한 인코딩 전략을 시도하여 최적의 품질/크기 비율 달성
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

  // 프레임 수에 따른 최적화 전략
  const hasManyFrames = metadata.frameCount > 20;

  if (lossless) {
    // === 무손실 모드: 다양한 전략 시도 ===

    // 전략 1: Pure Lossless + Maximum Compression
    // FFmpeg libwebp의 -lossless 1 + method 6 (최고 압축)
    configs.push({
      quality: 100,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 6, // 최고 압축 방법
      useSharpYuv: false, // 무손실에서는 불필요
      encodingStrategy: "pure-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
      denoise: false, // 완전 무손실에서는 노이즈 제거 안 함
      minKeyframeInterval: metadata.frameCount > 50 ? 10 : undefined,
      maxKeyframeInterval: metadata.frameCount > 50 ? 100 : undefined,
    });

    // 전략 2: Pure Lossless + Balanced Compression
    configs.push({
      quality: 100,
      compression: 5,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 4,
      useSharpYuv: false,
      encodingStrategy: "pure-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 3: Near-Lossless (quality 60) - 시각적으로 무손실, 더 작은 크기
    // nearLossless 값이 낮을수록 무손실에 가까움 (0=완전 무손실)
    configs.push({
      quality: 100,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 6,
      nearLossless: 60, // 시각적으로 거의 무손실
      useSharpYuv: false,
      encodingStrategy: "near-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 4: Near-Lossless (quality 40) - 더 공격적
    configs.push({
      quality: 100,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 6,
      nearLossless: 40,
      useSharpYuv: false,
      encodingStrategy: "near-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 5: Near-Lossless (quality 20) - 가장 공격적, 여전히 시각적 무손실
    configs.push({
      quality: 100,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 6,
      nearLossless: 20,
      useSharpYuv: false,
      encodingStrategy: "near-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 6: Hybrid - 고품질 손실 + Sharp YUV (매우 높은 품질 유지)
    // 무손실은 아니지만 품질 기준(SSIM ≥ 0.98)을 충족하면서 작은 크기
    configs.push({
      quality: 98,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "floyd_steinberg",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: false,
      method: 6,
      useSharpYuv: true, // RGB→YUV 변환 정확도 향상
      encodingStrategy: "hybrid",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 7: Optimized Lossy - 최고 품질 손실 압축
    configs.push({
      quality: 95,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "floyd_steinberg",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: false,
      method: 6,
      useSharpYuv: true,
      encodingStrategy: "optimized-lossy",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 8: Fast Near-Lossless (빠른 처리)
    configs.push({
      quality: 90,
      compression: 4,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "bayer:bayer_scale=2",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 3,
      nearLossless: 50,
      useSharpYuv: false,
      encodingStrategy: "near-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
    });

    // 전략 9: Near-Lossless + Light Denoise (노이즈 제거 + 준무손실)
    // GIF 특유의 디더링 노이즈를 제거하면 압축률 향상
    configs.push({
      quality: 100,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "floyd_steinberg",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: true,
      method: 6,
      nearLossless: 30,
      useSharpYuv: false,
      encodingStrategy: "near-lossless",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
      denoise: true,
      denoiseStrength: "light", // 약한 노이즈 제거
    });

    // 전략 10: Hybrid + Medium Denoise (하이브리드 + 중간 강도 노이즈 제거)
    configs.push({
      quality: 96,
      compression: 6,
      preset: "picture",
      scaleFilter: "lanczos",
      ditherMethod: "floyd_steinberg",
      pixelFormat: pixelFormats[0],
      usePalette: false,
      lossless: false,
      method: 6,
      useSharpYuv: true,
      encodingStrategy: "hybrid",
      removeDuplicates: hasManyFrames,
      deltaEncoding: hasManyFrames,
      denoise: true,
      denoiseStrength: "medium", // 중간 강도 노이즈 제거
    });
  } else {
    // === 손실 모드: 기존 로직 유지 ===
    const qualityLevels = [85, 80, 75];
    const compressionLevels = [5, 4, 3];

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
          usePalette,
          lossless: false,
          method: 4,
          useSharpYuv: false,
          encodingStrategy: "optimized-lossy",
          removeDuplicates: false,
          deltaEncoding: false,
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

  // === 필터 체인 구성 ===
  let filterChain = "";

  // 1. 노이즈 제거 필터 (선처리)
  if (config.denoise) {
    // hqdn3d: 고품질 3D 디노이즈 필터 (시간+공간 노이즈 제거)
    // 파라미터: luma_spatial:chroma_spatial:luma_tmp:chroma_tmp
    let denoiseParams = "";
    switch (config.denoiseStrength) {
      case "light":
        // 약한 노이즈 제거: 디테일 유지, GIF 디더링 최소화
        denoiseParams = "1.5:1.5:3:3";
        break;
      case "medium":
        // 중간 노이즈 제거: 균형잡힌 노이즈 감소
        denoiseParams = "3:3:6:6";
        break;
      case "strong":
        // 강한 노이즈 제거: 최대 압축을 위한 공격적 노이즈 제거
        denoiseParams = "5:5:10:10";
        break;
      default:
        denoiseParams = "2:2:4:4"; // 기본값
    }
    filterChain += `hqdn3d=${denoiseParams},`;
  }

  // 2. 프레임 최적화: 중복 제거 (mpdecimate 필터)
  if (config.removeDuplicates && metadata.frameCount > 10) {
    // mpdecimate: 거의 동일한 프레임 제거 (hi/lo/frac 파라미터로 민감도 조절)
    // hi=512, lo=64, frac=0.1은 매우 유사한 프레임만 제거
    filterChain += "mpdecimate=hi=512:lo=64:frac=0.1,";
  }

  // 3. FPS 설정 (중복 제거 후 프레임레이트 조정)
  filterChain += `fps=${metadata.fps}`;

  // 4. 스케일 필터 (고품질 리샘플링)
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
    // === 일반 변환 (고급 WebP 옵션 적용) ===
    filterChain += `,format=${config.pixelFormat}`;

    const ffmpegArgs = [
      "-i",
      inputName,
      "-filter:v",
      filterChain,
      "-c:v",
      "libwebp",
    ];

    // 무손실/손실 모드 설정
    if (config.lossless) {
      ffmpegArgs.push("-lossless", "1");
      ffmpegArgs.push("-quality", String(config.quality)); // 무손실 압축 effort

      // Near-lossless 옵션 (시각적 무손실)
      if (config.nearLossless !== undefined) {
        ffmpegArgs.push("-near_lossless", String(config.nearLossless));
      }
    } else {
      ffmpegArgs.push("-q:v", String(config.quality)); // 손실 품질

      // Sharp YUV 옵션 (RGB→YUV 변환 정확도 향상)
      if (config.useSharpYuv) {
        ffmpegArgs.push("-use_sharp_yuv", "1");
      }
    }

    // 압축 레벨 (속도 vs 크기 트레이드오프)
    ffmpegArgs.push("-compression_level", String(config.compression));

    // 압축 방법 (0=빠름, 6=최고 압축)
    if (config.method !== undefined) {
      ffmpegArgs.push("-method", String(config.method));
    }

    // 프리셋 및 픽셀 포맷
    ffmpegArgs.push(
      "-preset",
      config.preset,
      "-pix_fmt",
      config.pixelFormat,
      "-loop",
      "0",
      "-an", // 오디오 제거
      "-map_metadata", "-1", // 메타데이터 제거 (크기 절약)
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
