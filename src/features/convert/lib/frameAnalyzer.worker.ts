import { parseGIF, decompressFrames } from "gifuct-js";

export interface FrameData {
  index: number;
  hash: string;
  width: number;
  height: number;
  delay: number;
}

export interface AnalysisProgress {
  phase: "loading" | "extracting" | "analyzing" | "complete";
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

export interface AnalysisResult {
  totalFrames: number;
  uniqueFrames: number;
  duplicateFrames: number;
  compressionRatio: number;
  framesToKeep: number[];
  avgDelay: number;
  fps: number;
  width: number;
  height: number;
  hasAlpha: boolean;
}

// 프레임의 간단한 해시 계산 (perceptual hash 간소화 버전)
function calculateFrameHash(imageData: Uint8ClampedArray): string {
  const hashSize = 16;
  const step = Math.floor(imageData.length / (hashSize * hashSize * 4));

  let hash = "";
  for (let i = 0; i < hashSize * hashSize; i++) {
    const offset = i * step * 4;
    if (offset + 2 < imageData.length) {
      // RGB 평균으로 그레이스케일
      const gray =
        (imageData[offset] + imageData[offset + 1] + imageData[offset + 2]) /
        3;
      hash += gray > 128 ? "1" : "0";
    } else {
      hash += "0";
    }
  }
  return hash;
}

// 두 해시 간의 해밍 거리 계산
function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

// Worker 메시지 핸들러
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === "analyze") {
    try {
      const { arrayBuffer } = data;

      // 진행률 업데이트 함수
      const updateProgress = (update: AnalysisProgress) => {
        self.postMessage({ type: "progress", data: update });
      };

      updateProgress({
        phase: "loading",
        progress: 5,
        message: "GIF 파일 파싱 중...",
      });

      // GIF 파싱
      const gif = parseGIF(arrayBuffer);
      const frames = decompressFrames(gif, true);

      if (!frames || frames.length === 0) {
        throw new Error("프레임을 추출할 수 없습니다");
      }

      updateProgress({
        phase: "extracting",
        progress: 20,
        message: `${frames.length}개 프레임 추출 완료`,
        totalFrames: frames.length,
      });

      // 프레임 정보 수집
      const frameDataList: FrameData[] = [];
      const totalFrames = frames.length;

      updateProgress({
        phase: "analyzing",
        progress: 30,
        message: "프레임 해시 계산 중...",
        totalFrames,
      });

      // 각 프레임의 해시 계산 (병렬 처리 시뮬레이션)
      const batchSize = 10;
      for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize);

        // 배치 처리
        const batchResults = batch.map((frame, batchIndex) => {
          const index = i + batchIndex;
          const patch = frame.patch || frame.pixels;

          // 해시 계산
          const hash = calculateFrameHash(patch);

          return {
            index,
            hash,
            width: frame.dims.width,
            height: frame.dims.height,
            delay: frame.delay || 100,
          };
        });

        frameDataList.push(...batchResults);

        // 진행률 업데이트
        const progress = 30 + ((i + batch.length) / totalFrames) * 40;
        updateProgress({
          phase: "analyzing",
          progress,
          message: `프레임 분석 중... ${i + batch.length}/${totalFrames}`,
          currentFrame: i + batch.length,
          totalFrames,
        });

        // 다음 이벤트 루프로 양보 (UI 블록 방지)
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      updateProgress({
        phase: "analyzing",
        progress: 75,
        message: "중복 프레임 감지 중...",
        totalFrames,
      });

      // 중복 프레임 감지
      const framesToKeep: number[] = [0]; // 첫 프레임은 항상 유지
      const threshold = 3; // 해밍 거리 임계값 (유사도 판단)

      for (let i = 1; i < frameDataList.length; i++) {
        const currentFrame = frameDataList[i];
        const previousFrame = frameDataList[framesToKeep[framesToKeep.length - 1]];

        // 이전 유지 프레임과 비교
        const distance = hammingDistance(currentFrame.hash, previousFrame.hash);

        // 다르면 유지
        if (distance > threshold) {
          framesToKeep.push(i);
        }

        // 진행률 업데이트
        if (i % 10 === 0) {
          const progress = 75 + (i / frameDataList.length) * 20;
          updateProgress({
            phase: "analyzing",
            progress,
            message: `중복 감지... ${i}/${frameDataList.length}`,
            currentFrame: i,
            totalFrames,
          });
        }
      }

      // 통계 계산
      const avgDelay =
        frameDataList.reduce((sum, f) => sum + f.delay, 0) /
        frameDataList.length;
      const fps = Math.round(1000 / avgDelay);

      // 알파 채널 확인 (첫 프레임)
      const firstPatch = frames[0].patch || frames[0].pixels;
      let hasAlpha = false;
      for (let i = 3; i < firstPatch.length; i += 4) {
        if (firstPatch[i] < 255) {
          hasAlpha = true;
          break;
        }
      }

      const result: AnalysisResult = {
        totalFrames: frameDataList.length,
        uniqueFrames: framesToKeep.length,
        duplicateFrames: frameDataList.length - framesToKeep.length,
        compressionRatio: framesToKeep.length / frameDataList.length,
        framesToKeep,
        avgDelay,
        fps,
        width: frameDataList[0].width,
        height: frameDataList[0].height,
        hasAlpha,
      };

      updateProgress({
        phase: "complete",
        progress: 100,
        message: `분석 완료: ${result.uniqueFrames}/${result.totalFrames} 프레임 유지`,
      });

      // 결과 전송
      self.postMessage({ type: "result", data: result });
    } catch (error) {
      self.postMessage({
        type: "error",
        data: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
};

export {};
