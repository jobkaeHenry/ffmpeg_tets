// Vitest setup file
import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
if (typeof globalThis !== 'undefined') {
  globalThis.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as Console;
}
