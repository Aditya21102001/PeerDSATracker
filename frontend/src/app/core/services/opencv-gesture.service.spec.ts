import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenCvGestureService } from './opencv-gesture.service';

function createMockCanvas(
  width: number,
  height: number,
  pixelGenerator: (x: number, y: number) => [number, number, number]
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b] = pixelGenerator(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  const mockCtx = {
    getImageData: () => ({ data, width, height }),
  };
  canvas.getContext = (() => mockCtx) as any;
  return canvas;
}

describe('OpenCvGestureService', () => {
  let service: OpenCvGestureService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OpenCvGestureService],
    });
    service = TestBed.inject(OpenCvGestureService);
  });

  it('initializes and reports initial state', () => {
    expect(service.isOpenCvLoaded()).toBe(false);
    expect(service.isInitializing()).toBe(false);
  });

  it('handles pitch black frames as absent', () => {
    const canvas = createMockCanvas(160, 120, () => [0, 0, 0]);
    const result = service.analyzeFrame(canvas);
    expect(result.isPresent).toBe(false);
    expect(result.gesture).toBe('none');
  });

  it('detects presence when human skin tones form spatial cluster in portrait region', () => {
    // Background: dark room [30, 30, 35]
    // Human face cluster: central region (x: 50..110, y: 15..75) with skin tones [210, 155, 125]
    const canvas = createMockCanvas(160, 120, (x, y) => {
      if (x >= 50 && x <= 110 && y >= 15 && y <= 75) {
        return [210, 155, 125];
      }
      return [30, 30, 35];
    });

    const result = service.analyzeFrame(canvas);
    expect(result.isPresent).toBe(true);
    expect(result.faceBox).not.toBeNull();
    if (result.faceBox) {
      expect(result.faceBox.width).toBeGreaterThan(20);
      expect(result.faceBox.height).toBeGreaterThan(20);
    }
  });

  it('distinguishes empty room with scattered warm noise from real face cluster', () => {
    // Empty room with a couple of isolated warm pixels (< 0.1%)
    const canvas = createMockCanvas(160, 120, (x, y) => {
      if ((x === 5 && y === 5) || (x === 150 && y === 110)) {
        return [200, 150, 120];
      }
      return [30, 30, 35];
    });

    const result = service.analyzeFrame(canvas);
    expect(result.isPresent).toBe(false);
  });

  it('detects head nod (NOD) when face vertically dips and returns to baseline with horizontal stability', () => {
    (service as any).headYHistory = [40, 42, 47, 48, 43, 40];
    (service as any).headXHistory = [80, 80, 81, 80, 80, 80];

    const isNod = (service as any).isHeadNodding();
    expect(isNod).toBe(true);
  });

  it('detects upward head nod (tilt up and recover)', () => {
    (service as any).headYHistory = [45, 43, 38, 37, 42, 45];
    (service as any).headXHistory = [80, 80, 80, 81, 80, 80];

    const isNod = (service as any).isHeadNodding();
    expect(isNod).toBe(true);
  });

  it('rejects head nod when horizontal sway is excessive (e.g. head turning/shaking)', () => {
    (service as any).headYHistory = [40, 42, 47, 48, 43, 40];
    (service as any).headXHistory = [70, 75, 82, 86, 78, 72]; // > 9px horizontal drift

    const isNod = (service as any).isHeadNodding();
    expect(isNod).toBe(false);
  });

  it('rejects head nod when head slumps and does not return to baseline', () => {
    (service as any).headYHistory = [40, 43, 46, 50, 52, 53];
    (service as any).headXHistory = [80, 80, 80, 80, 80, 80];

    const isNod = (service as any).isHeadNodding();
    expect(isNod).toBe(false);
  });

  it('detects hand wave (WAVE) when hand position oscillates horizontally with direction reversal', () => {
    (service as any).handXHistory = [100, 115, 125, 112, 98];

    const isWave = (service as any).isHandWaving();
    expect(isWave).toBe(true);
  });

  it('rejects hand wave when movement is unidirectional without reversal', () => {
    (service as any).handXHistory = [100, 105, 112, 120, 126];

    const isWave = (service as any).isHandWaving();
    expect(isWave).toBe(false);
  });
});

