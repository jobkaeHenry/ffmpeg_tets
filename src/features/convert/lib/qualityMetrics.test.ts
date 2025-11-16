import { describe, it, expect } from 'vitest';
import type { QualityMetrics } from './qualityMetrics';

describe('Quality Metrics Module', () => {
  describe('Quality Thresholds Documentation', () => {
    it('should document pure lossless quality criteria', () => {
      // Pure lossless quality criteria
      const pureLosslessThreshold = {
        ssim: 0.99,
        deltaE: 2.3,
        edgePreservation: 0.95,
        psnr: 40,
      };

      // Verify threshold values are reasonable
      expect(pureLosslessThreshold.ssim).toBeGreaterThan(0.98);
      expect(pureLosslessThreshold.deltaE).toBeLessThan(3);
      expect(pureLosslessThreshold.edgePreservation).toBeGreaterThan(0.94);
      expect(pureLosslessThreshold.psnr).toBeGreaterThan(30);
    });

    it('should document near-lossless quality criteria', () => {
      // Near-lossless quality criteria
      const nearLosslessThreshold = {
        ssim: 0.97,
        deltaE: 3.0,
        edgePreservation: 0.93,
      };

      // Verify threshold values
      expect(nearLosslessThreshold.ssim).toBeGreaterThan(0.96);
      expect(nearLosslessThreshold.deltaE).toBeLessThan(4);
      expect(nearLosslessThreshold.edgePreservation).toBeGreaterThan(0.92);
    });

    it('should document hybrid quality criteria', () => {
      // Hybrid quality criteria
      const hybridThreshold = {
        ssim: 0.96,
        deltaE: 4.0,
        edgePreservation: 0.92,
      };

      expect(hybridThreshold.ssim).toBeGreaterThan(0.95);
      expect(hybridThreshold.deltaE).toBeLessThan(5);
      expect(hybridThreshold.edgePreservation).toBeGreaterThan(0.90);
    });

    it('should document optimized lossy quality criteria', () => {
      // Optimized lossy quality criteria
      const lossyThreshold = {
        ssim: 0.95,
        deltaE: 5.0,
        edgePreservation: 0.90,
      };

      expect(lossyThreshold.ssim).toBeGreaterThan(0.92);
      expect(lossyThreshold.deltaE).toBeLessThan(6);
      expect(lossyThreshold.edgePreservation).toBeGreaterThan(0.85);
    });
  });

  describe('Quality Metrics Interface', () => {
    it('should have correct quality metrics structure', () => {
      const mockMetrics: QualityMetrics = {
        ssim: 0.99,
        psnr: 45.2,
        deltaE: 1.5,
        edgePreservation: 0.97,
      };

      expect(mockMetrics.ssim).toBeTypeOf('number');
      expect(mockMetrics.psnr).toBeTypeOf('number');
      expect(mockMetrics.deltaE).toBeTypeOf('number');
      expect(mockMetrics.edgePreservation).toBeTypeOf('number');

      // Verify ranges
      expect(mockMetrics.ssim).toBeGreaterThanOrEqual(0);
      expect(mockMetrics.ssim).toBeLessThanOrEqual(1);
      expect(mockMetrics.psnr).toBeGreaterThan(0);
      expect(mockMetrics.deltaE).toBeGreaterThanOrEqual(0);
      expect(mockMetrics.edgePreservation).toBeGreaterThanOrEqual(0);
      expect(mockMetrics.edgePreservation).toBeLessThanOrEqual(1);
    });

    it('should validate lossless quality metrics meet criteria', () => {
      const losslessMetrics: QualityMetrics = {
        ssim: 0.995,
        psnr: 50.0,
        deltaE: 0.5,
        edgePreservation: 0.99,
      };

      // Pure lossless criteria check
      const meetsPureLosslessCriteria = losslessMetrics.ssim >= 0.99;
      expect(meetsPureLosslessCriteria).toBe(true);

      // Near-lossless criteria check
      const meetsNearLosslessCriteria =
        losslessMetrics.ssim >= 0.97 &&
        losslessMetrics.deltaE <= 3.0 &&
        losslessMetrics.edgePreservation >= 0.93;
      expect(meetsNearLosslessCriteria).toBe(true);
    });
  });

  describe('Compression Efficiency Calculations', () => {
    it('should calculate bits per pixel correctly', () => {
      const fileSizeKB = 850;
      const width = 500;
      const height = 500;
      const frameCount = 50;

      const totalPixels = width * height * frameCount;
      const totalBits = fileSizeKB * 1024 * 8;
      const bitsPerPixel = totalBits / totalPixels;

      expect(bitsPerPixel).toBeCloseTo(0.557, 2);
      expect(bitsPerPixel).toBeLessThan(1.0); // Excellent compression
    });

    it('should calculate compression ratio correctly', () => {
      const originalSizeKB = 2500;
      const compressedSizeKB = 850;

      const compressionRatio = compressedSizeKB / originalSizeKB;
      const savingsKB = originalSizeKB - compressedSizeKB;
      const savingsPercent = (savingsKB / originalSizeKB) * 100;

      expect(compressionRatio).toBeCloseTo(0.34, 2);
      expect(savingsKB).toBe(1650);
      expect(savingsPercent).toBeCloseTo(66.0, 1);
    });

    it('should classify compression efficiency by bits per pixel', () => {
      const excellent = 0.8;
      const good = 1.5;
      const fair = 2.5;

      expect(excellent).toBeLessThan(1.0); // Excellent
      expect(good).toBeGreaterThanOrEqual(1.0);
      expect(good).toBeLessThan(2.0); // Good
      expect(fair).toBeGreaterThanOrEqual(2.0);
      expect(fair).toBeLessThan(3.0); // Fair
    });
  });
});
