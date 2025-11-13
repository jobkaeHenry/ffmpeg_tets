import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export interface GifMetadata {
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  duration: number;
  avgBitrate: number;
}

export interface FrameAnalysis {
  totalFrames: number;
  uniqueFrames: number;
  duplicateFrames: number;
  compressionRatio: number;
}

/**
 * GIF 메타데이터 분석
 * ffprobe를 사용하여 프레임 수, FPS, 해상도 등을 추출
 */
export async function analyzeGifMetadata(
  ffmpeg: FFmpeg,
  input: File | string
): Promise<GifMetadata> {
  const inputName = "analyze_input.gif";
  await ffmpeg.writeFile(inputName, await fetchFile(input));

  // FFmpeg로 GIF 정보 추출
  // 첫 프레임을 PNG로 변환하여 알파 채널 확인
  const testOutput = "alpha_test.png";
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vframes",
    "1",
    "-f",
    "image2",
    testOutput,
  ]);

  const alphaData = (await ffmpeg.readFile(testOutput)) as Uint8Array;
  const hasAlpha = await checkAlphaChannel(alphaData);

  // GIF 프레임 수 계산을 위해 모든 프레임 추출
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vsync",
    "0",
    "frame_%04d.png",
  ]);

  // 생성된 프레임 파일 확인
  let frameCount = 0;
  const maxFrames = 1000; // 최대 체크 범위

  for (let i = 1; i <= maxFrames; i++) {
    const frameName = `frame_${String(i).padStart(4, "0")}.png`;
    try {
      await ffmpeg.readFile(frameName);
      frameCount++;
    } catch {
      break;
    }
  }

  // 파일 크기 확인
  const inputData = (await ffmpeg.readFile(inputName)) as Uint8Array;
  const fileSize = inputData.length;

  // 첫 프레임으로 해상도 확인
  const firstFrame = (await ffmpeg.readFile("frame_0001.png")) as Uint8Array;
  const { width, height } = await getImageDimensions(firstFrame);

  // FPS 추정 (기본 GIF는 10fps, 실제로는 delay 시간으로 계산해야 함)
  const estimatedFps = 10; // GIF 표준 기본값
  const duration = frameCount / estimatedFps;
  const avgBitrate = (fileSize * 8) / duration / 1000; // kbps

  // 임시 파일 정리
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(testOutput);
    for (let i = 1; i <= frameCount; i++) {
      const frameName = `frame_${String(i).padStart(4, "0")}.png`;
      await ffmpeg.deleteFile(frameName);
    }
  } catch {
    // 정리 실패는 무시
  }

  return {
    frameCount,
    fps: estimatedFps,
    width,
    height,
    hasAlpha,
    duration,
    avgBitrate,
  };
}

/**
 * 프레임 중복도 분석
 * 연속된 프레임 간의 유사도를 계산하여 중복 프레임 감지
 */
export async function analyzeFrameDuplication(
  ffmpeg: FFmpeg,
  input: File | string,
  metadata: GifMetadata
): Promise<FrameAnalysis> {
  const inputName = "dup_input.gif";
  await ffmpeg.writeFile(inputName, await fetchFile(input));

  // 모든 프레임을 PNG로 추출
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vsync",
    "0",
    "dup_frame_%04d.png",
  ]);

  let duplicateCount = 0;
  const threshold = 0.99; // PSNR 유사도 임계값

  // 연속 프레임 간 비교
  for (let i = 1; i < metadata.frameCount; i++) {
    const frame1 = `dup_frame_${String(i).padStart(4, "0")}.png`;
    const frame2 = `dup_frame_${String(i + 1).padStart(4, "0")}.png`;

    try {
      const similarity = await compareFrames(ffmpeg, frame1, frame2);
      if (similarity > threshold) {
        duplicateCount++;
      }
    } catch {
      // 비교 실패 시 계속 진행
      continue;
    }
  }

  const uniqueFrames = metadata.frameCount - duplicateCount;
  const compressionRatio = uniqueFrames / metadata.frameCount;

  // 임시 파일 정리
  try {
    await ffmpeg.deleteFile(inputName);
    for (let i = 1; i <= metadata.frameCount; i++) {
      const frameName = `dup_frame_${String(i).padStart(4, "0")}.png`;
      await ffmpeg.deleteFile(frameName);
    }
  } catch {
    // 정리 실패는 무시
  }

  return {
    totalFrames: metadata.frameCount,
    uniqueFrames,
    duplicateFrames: duplicateCount,
    compressionRatio,
  };
}

/**
 * 두 프레임 간 유사도 계산 (간소화 버전)
 * 실제로는 PSNR 또는 SSIM을 사용하지만, 여기서는 파일 크기로 근사
 */
async function compareFrames(
  ffmpeg: FFmpeg,
  frame1: string,
  frame2: string
): Promise<number> {
  try {
    const data1 = (await ffmpeg.readFile(frame1)) as Uint8Array;
    const data2 = (await ffmpeg.readFile(frame2)) as Uint8Array;

    // 간단한 바이트 비교 (실제로는 픽셀 레벨 비교 필요)
    if (data1.length !== data2.length) return 0;

    let matchingBytes = 0;
    const sampleSize = Math.min(data1.length, 10000); // 샘플링으로 성능 개선

    for (let i = 0; i < sampleSize; i++) {
      if (data1[i] === data2[i]) matchingBytes++;
    }

    return matchingBytes / sampleSize;
  } catch {
    return 0;
  }
}

/**
 * PNG 데이터에서 알파 채널 존재 여부 확인
 */
async function checkAlphaChannel(pngData: Uint8Array): Promise<boolean> {
  // PNG 시그니처 확인
  if (
    pngData[0] !== 0x89 ||
    pngData[1] !== 0x50 ||
    pngData[2] !== 0x4e ||
    pngData[3] !== 0x47
  ) {
    return false;
  }

  // IHDR 청크에서 컬러 타입 확인
  // PNG 구조: 시그니처(8) + IHDR 청크
  // IHDR: 길이(4) + "IHDR"(4) + 데이터(13) + CRC(4)
  // 컬러 타입은 IHDR 데이터의 9번째 바이트 (인덱스 25)
  const colorType = pngData[25];

  // 컬러 타입: 0=Grayscale, 2=RGB, 3=Indexed, 4=Grayscale+Alpha, 6=RGBA
  return colorType === 4 || colorType === 6;
}

/**
 * PNG 이미지의 크기 추출
 */
async function getImageDimensions(
  pngData: Uint8Array
): Promise<{ width: number; height: number }> {
  // IHDR 청크에서 width(4바이트)와 height(4바이트) 읽기
  const dataView = new DataView(pngData.buffer);
  const width = dataView.getUint32(16, false); // big-endian
  const height = dataView.getUint32(20, false);

  return { width, height };
}

/**
 * 팔레트 크기 분석
 * GIF의 색상 테이블 크기를 분석
 */
export async function analyzePaletteSize(
  input: File | string
): Promise<number> {
  // GIF 파일 헤더 읽기
  let data: ArrayBuffer;

  if (input instanceof File) {
    data = await input.arrayBuffer();
  } else {
    const response = await fetch(input);
    data = await response.arrayBuffer();
  }

  const view = new DataView(data);

  // GIF 시그니처 확인 (GIF89a 또는 GIF87a)
  const sig1 = view.getUint8(0);
  const sig2 = view.getUint8(1);
  const sig3 = view.getUint8(2);

  if (sig1 !== 0x47 || sig2 !== 0x49 || sig3 !== 0x46) {
    throw new Error("Not a valid GIF file");
  }

  // Global Color Table Flag 확인 (Logical Screen Descriptor의 Packed Fields)
  const packed = view.getUint8(10);
  const hasGlobalColorTable = (packed & 0x80) !== 0;

  if (!hasGlobalColorTable) {
    return 0;
  }

  // 팔레트 크기 계산: 2^(N+1) where N is bits 0-2 of packed field
  const sizeCode = packed & 0x07;
  const paletteSize = Math.pow(2, sizeCode + 1);

  return paletteSize;
}
