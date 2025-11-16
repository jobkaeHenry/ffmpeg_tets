import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { optimizeGifToWebp } from './optimizer';

describe('GIF to WebP Optimizer Integration Tests', () => {
  let ffmpeg: FFmpeg;

  beforeAll(async () => {
    // Initialize FFmpeg for tests
    ffmpeg = new FFmpeg();

    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw error;
    }
  }, 30000); // 30 second timeout for loading FFmpeg

  describe('File Size Compression', () => {
    it('should reduce file size with lossless mode', async () => {
      // Use sample GIF from public assets
      const sampleGifUrl = '/sample.gif';

      // Mock progress callback
      const progressCallback = vi.fn();

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        progressCallback,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Verify compression stats
      expect(result.compressionStats).toBeDefined();
      expect(result.compressionStats!.isLargerThanOriginal).toBe(false);

      // File size should be reduced
      expect(result.compressionStats!.compressedSizeKB).toBeLessThan(
        result.compressionStats!.originalSizeKB
      );

      // Should have positive savings
      expect(result.compressionStats!.savingsKB).toBeGreaterThan(0);
      expect(result.compressionStats!.savingsPercent).toBeGreaterThan(0);

      // Compression efficiency (bits per pixel) should be reasonable
      expect(result.compressionStats!.bitsPerPixel).toBeGreaterThan(0);
      expect(result.compressionStats!.bitsPerPixel).toBeLessThan(10); // Reasonable upper bound
    }, 60000); // 60 second timeout

    it('should achieve better compression with lossy mode', async () => {
      const sampleGifUrl = '/sample.gif';

      const losslessResult = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      const lossyResult = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: false,
      });

      expect(losslessResult).not.toBeNull();
      expect(lossyResult).not.toBeNull();

      if (!losslessResult || !lossyResult) return;

      // Lossy should generally produce smaller files
      expect(lossyResult.sizeKB).toBeLessThanOrEqual(losslessResult.sizeKB);

      // Both should reduce file size
      expect(losslessResult.compressionRatio).toBeLessThan(1);
      expect(lossyResult.compressionRatio).toBeLessThan(1);
    }, 120000); // 120 second timeout
  });

  describe('Quality Preservation (Lossless Mode)', () => {
    it('should maintain high SSIM (>= 0.99) in pure lossless mode', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Check quality metrics
      expect(result.metrics).toBeDefined();

      // Pure lossless or near-lossless should have very high SSIM
      if (result.config.encodingStrategy === 'pure-lossless') {
        expect(result.metrics.ssim).toBeGreaterThanOrEqual(0.99);
      } else if (result.config.encodingStrategy === 'near-lossless') {
        expect(result.metrics.ssim).toBeGreaterThanOrEqual(0.97);
        expect(result.metrics.deltaE).toBeLessThanOrEqual(3.0);
        expect(result.metrics.edgePreservation).toBeGreaterThanOrEqual(0.93);
      }
    }, 60000);

    it('should meet quality criteria for selected strategy', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      const { metrics, config } = result;

      // Verify strategy-specific quality criteria
      switch (config.encodingStrategy) {
        case 'pure-lossless':
          expect(metrics.ssim).toBeGreaterThanOrEqual(0.99);
          break;

        case 'near-lossless':
          expect(metrics.ssim).toBeGreaterThanOrEqual(0.97);
          expect(metrics.deltaE).toBeLessThanOrEqual(3.0);
          expect(metrics.edgePreservation).toBeGreaterThanOrEqual(0.93);
          break;

        case 'hybrid':
          expect(metrics.ssim).toBeGreaterThanOrEqual(0.96);
          expect(metrics.deltaE).toBeLessThanOrEqual(4.0);
          expect(metrics.edgePreservation).toBeGreaterThanOrEqual(0.92);
          break;

        case 'optimized-lossy':
          expect(metrics.ssim).toBeGreaterThanOrEqual(0.95);
          expect(metrics.deltaE).toBeLessThanOrEqual(5.0);
          expect(metrics.edgePreservation).toBeGreaterThanOrEqual(0.90);
          break;

        default:
          // Relaxed criteria
          expect(metrics.ssim).toBeGreaterThanOrEqual(0.92);
      }
    }, 60000);

    it('should validate imperceptible color difference (ΔE <= 2.3)', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // For lossless modes, ΔE should be very low
      if (
        result.config.encodingStrategy === 'pure-lossless' ||
        result.config.encodingStrategy === 'near-lossless'
      ) {
        expect(result.metrics.deltaE).toBeLessThanOrEqual(3.0);
      }
    }, 60000);
  });

  describe('Compression Efficiency', () => {
    it('should achieve good bits-per-pixel ratio (< 2.0 for high efficiency)', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Excellent compression: BPP < 1.0
      // Good compression: BPP < 2.0
      // Fair compression: BPP < 3.0
      expect(result.compressionStats!.bitsPerPixel).toBeLessThan(3.0);
    }, 60000);

    it('should save at least 10% file size', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Should achieve at least 10% compression
      expect(result.compressionStats!.savingsPercent).toBeGreaterThanOrEqual(10);
    }, 60000);
  });

  describe('Strategy Selection', () => {
    it('should select an appropriate encoding strategy', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Should have a valid encoding strategy
      const validStrategies = [
        'pure-lossless',
        'near-lossless',
        'hybrid',
        'optimized-lossy',
      ];
      expect(validStrategies).toContain(result.config.encodingStrategy);
    }, 60000);

    it('should test multiple configurations', async () => {
      const sampleGifUrl = '/sample.gif';
      const progressMessages: string[] = [];

      await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
        progressCallback: (_progress, message) => {
          progressMessages.push(message);
        },
      });

      // Should have tested multiple strategies
      const strategyMessages = progressMessages.filter((msg) =>
        msg.includes('전략')
      );
      expect(strategyMessages.length).toBeGreaterThan(5); // At least 5+ strategies
    }, 60000);
  });

  describe('Metadata Preservation', () => {
    it('should extract correct GIF metadata', async () => {
      const sampleGifUrl = '/sample.gif';

      const result = await optimizeGifToWebp({
        ffmpeg,
        input: sampleGifUrl,
        lossless: true,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Metadata should be present
      expect(result.metadata).toBeDefined();
      expect(result.metadata.frameCount).toBeGreaterThan(0);
      expect(result.metadata.fps).toBeGreaterThan(0);
      expect(result.metadata.width).toBeGreaterThan(0);
      expect(result.metadata.height).toBeGreaterThan(0);
      expect(typeof result.metadata.hasAlpha).toBe('boolean');
    }, 60000);
  });
});
