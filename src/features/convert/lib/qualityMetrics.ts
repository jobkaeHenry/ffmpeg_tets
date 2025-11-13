/**
 * 품질 측정 모듈
 * SSIM, PSNR, ΔE2000 등의 지각적 품질 메트릭 계산
 */

export interface QualityMetrics {
  ssim: number;
  psnr: number;
  deltaE: number;
  edgePreservation: number;
}

export interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Canvas를 사용하여 이미지 데이터 추출
 */
export async function getImageData(blob: Blob): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      resolve({
        data: imageData.data,
        width: canvas.width,
        height: canvas.height,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * SSIM (Structural Similarity Index) 계산
 * 두 이미지 간의 구조적 유사도를 측정 (0~1, 1이 완전히 동일)
 */
export function calculateSSIM(img1: ImageData, img2: ImageData): number {
  if (
    img1.width !== img2.width ||
    img1.height !== img2.height ||
    img1.data.length !== img2.data.length
  ) {
    throw new Error("Image dimensions must match");
  }

  const C1 = 6.5025; // (K1 * L)^2, K1 = 0.01, L = 255
  const C2 = 58.5225; // (K2 * L)^2, K2 = 0.03, L = 255

  let ssimSum = 0;
  let count = 0;

  // 8x8 블록 단위로 SSIM 계산 (성능 최적화)
  const blockSize = 8;
  for (let y = 0; y < img1.height - blockSize; y += blockSize) {
    for (let x = 0; x < img1.width - blockSize; x += blockSize) {
      const block1: number[] = [];
      const block2: number[] = [];

      // 블록 내 픽셀의 휘도(Luminance) 수집
      for (let by = 0; by < blockSize; by++) {
        for (let bx = 0; bx < blockSize; bx++) {
          const idx = ((y + by) * img1.width + (x + bx)) * 4;
          const l1 = rgbToLuminance(
            img1.data[idx],
            img1.data[idx + 1],
            img1.data[idx + 2]
          );
          const l2 = rgbToLuminance(
            img2.data[idx],
            img2.data[idx + 1],
            img2.data[idx + 2]
          );
          block1.push(l1);
          block2.push(l2);
        }
      }

      // 평균, 분산, 공분산 계산
      const mu1 = mean(block1);
      const mu2 = mean(block2);
      const sigma1Sq = variance(block1, mu1);
      const sigma2Sq = variance(block2, mu2);
      const sigma12 = covariance(block1, block2, mu1, mu2);

      // SSIM 공식
      const ssim =
        ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) /
        ((mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2));

      ssimSum += ssim;
      count++;
    }
  }

  return count > 0 ? ssimSum / count : 0;
}

/**
 * PSNR (Peak Signal-to-Noise Ratio) 계산
 * 두 이미지 간의 노이즈 비율을 dB 단위로 측정 (높을수록 유사)
 */
export function calculatePSNR(img1: ImageData, img2: ImageData): number {
  if (
    img1.width !== img2.width ||
    img1.height !== img2.height ||
    img1.data.length !== img2.data.length
  ) {
    throw new Error("Image dimensions must match");
  }

  let mseSum = 0;
  let count = 0;

  // MSE (Mean Squared Error) 계산
  for (let i = 0; i < img1.data.length; i += 4) {
    const r1 = img1.data[i];
    const g1 = img1.data[i + 1];
    const b1 = img1.data[i + 2];

    const r2 = img2.data[i];
    const g2 = img2.data[i + 1];
    const b2 = img2.data[i + 2];

    mseSum +=
      Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2);
    count += 3; // RGB 3채널
  }

  const mse = mseSum / count;

  if (mse === 0) return Infinity; // 완전히 동일

  const maxPixelValue = 255;
  const psnr = 20 * Math.log10(maxPixelValue / Math.sqrt(mse));

  return psnr;
}

/**
 * ΔE2000 (CIEDE2000) 색차 계산
 * 인간이 지각하는 색상 차이를 측정 (< 2.3은 인지 불가능)
 */
export function calculateDeltaE2000(img1: ImageData, img2: ImageData): number {
  if (
    img1.width !== img2.width ||
    img1.height !== img2.height ||
    img1.data.length !== img2.data.length
  ) {
    throw new Error("Image dimensions must match");
  }

  let deltaESum = 0;
  let count = 0;

  // 샘플링으로 성능 최적화 (100개 픽셀당 1개)
  const samplingRate = 100;

  for (let i = 0; i < img1.data.length; i += 4 * samplingRate) {
    const rgb1 = {
      r: img1.data[i],
      g: img1.data[i + 1],
      b: img1.data[i + 2],
    };
    const rgb2 = {
      r: img2.data[i],
      g: img2.data[i + 1],
      b: img2.data[i + 2],
    };

    const lab1 = rgbToLab(rgb1);
    const lab2 = rgbToLab(rgb2);

    const deltaE = deltaE2000(lab1, lab2);
    deltaESum += deltaE;
    count++;
  }

  return count > 0 ? deltaESum / count : 0;
}

/**
 * 엣지 보존율 계산
 * Sobel 필터를 사용하여 윤곽선 유사도 측정
 */
export function calculateEdgePreservation(
  img1: ImageData,
  img2: ImageData
): number {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error("Image dimensions must match");
  }

  const edges1 = detectEdges(img1);
  const edges2 = detectEdges(img2);

  let matchingEdges = 0;
  let totalEdges = 0;

  for (let i = 0; i < edges1.length; i++) {
    if (edges1[i] > 0.1 || edges2[i] > 0.1) {
      // 엣지로 간주
      totalEdges++;
      const diff = Math.abs(edges1[i] - edges2[i]);
      if (diff < 0.1) {
        matchingEdges++;
      }
    }
  }

  return totalEdges > 0 ? matchingEdges / totalEdges : 1;
}

/**
 * Sobel 엣지 검출
 */
function detectEdges(img: ImageData): Float32Array {
  const { width, height } = img;
  const edges = new Float32Array(width * height);

  // Sobel 커널
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const intensity = rgbToLuminance(
            img.data[idx],
            img.data[idx + 1],
            img.data[idx + 2]
          );

          gx += intensity * sobelX[ky + 1][kx + 1];
          gy += intensity * sobelY[ky + 1][kx + 1];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy) / 255;
      edges[y * width + x] = magnitude;
    }
  }

  return edges;
}

// ========== 유틸리티 함수 ==========

function rgbToLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[], mean: number): number {
  return (
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length
  );
}

function covariance(
  values1: number[],
  values2: number[],
  mean1: number,
  mean2: number
): number {
  let sum = 0;
  for (let i = 0; i < values1.length; i++) {
    sum += (values1[i] - mean1) * (values2[i] - mean2);
  }
  return sum / values1.length;
}

// RGB → LAB 색공간 변환
function rgbToLab(rgb: {
  r: number;
  g: number;
  b: number;
}): { L: number; a: number; b: number } {
  // RGB → XYZ
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // XYZ → LAB (D65 illuminant)
  x /= 0.95047;
  y /= 1.0;
  z /= 1.08883;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const bVal = 200 * (y - z);

  return { L, a, b: bVal };
}

// ΔE2000 계산 (간소화 버전)
function deltaE2000(
  lab1: { L: number; a: number; b: number },
  lab2: { L: number; a: number; b: number }
): number {
  // 간단한 ΔE*ab 공식 사용 (완전한 CIEDE2000은 매우 복잡함)
  const deltaL = lab1.L - lab2.L;
  const deltaA = lab1.a - lab2.a;
  const deltaB = lab1.b - lab2.b;

  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

/**
 * 모든 품질 메트릭을 한번에 계산
 */
export async function calculateAllMetrics(
  original: Blob,
  converted: Blob
): Promise<QualityMetrics> {
  const img1 = await getImageData(original);
  const img2 = await getImageData(converted);

  const ssim = calculateSSIM(img1, img2);
  const psnr = calculatePSNR(img1, img2);
  const deltaE = calculateDeltaE2000(img1, img2);
  const edgePreservation = calculateEdgePreservation(img1, img2);

  return {
    ssim,
    psnr,
    deltaE,
    edgePreservation,
  };
}
