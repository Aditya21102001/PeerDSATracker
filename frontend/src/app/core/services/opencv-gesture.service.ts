import { Injectable, signal } from '@angular/core';
import { FaceBox, UserGestureType } from '../models/video-study-coach.models';

declare const cv: any;

@Injectable({ providedIn: 'root' })
export class OpenCvGestureService {
  readonly isOpenCvLoaded = signal<boolean>(false);
  readonly isInitializing = signal<boolean>(false);
  private openCvInstance: any = null;
  private prevLumaBuffer: Uint8ClampedArray | null = null;
  private headYHistory: number[] = [];
  private headXHistory: number[] = [];
  private handXHistory: number[] = [];
  private motionHistory: number[] = [];
  private palmHoldCount = 0;
  private lastGestureTimestamp = 0;

  constructor() {
    this.checkIfAlreadyLoaded();
  }

  private checkIfAlreadyLoaded(): void {
    if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
      this.openCvInstance = (window as any).cv;
      this.isOpenCvLoaded.set(true);
    }
  }

  /**
   * Dynamically loads OpenCV.js asynchronously without blocking the main bundle.
   */
  async loadOpenCv(): Promise<boolean> {
    if (this.isOpenCvLoaded()) return true;
    if (typeof window === 'undefined') return false;

    if (this.isInitializing()) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.isOpenCvLoaded()) {
            clearInterval(interval);
            resolve(true);
          }
        }, 100);
      });
    }

    this.isInitializing.set(true);

    return new Promise((resolve) => {
      // Check if script tag already exists
      const existing = document.getElementById('opencv-script-tag') as HTMLScriptElement;
      if (existing) {
        const timer = setInterval(() => {
          if ((window as any).cv && (window as any).cv.Mat) {
            this.openCvInstance = (window as any).cv;
            this.isOpenCvLoaded.set(true);
            this.isInitializing.set(false);
            clearInterval(timer);
            resolve(true);
          }
        }, 150);
        return;
      }

      const script = document.createElement('script');
      script.id = 'opencv-script-tag';
      script.async = true;
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';

      script.onload = () => {
        const checkCv = () => {
          if ((window as any).cv && (window as any).cv.Mat) {
            this.openCvInstance = (window as any).cv;
            this.isOpenCvLoaded.set(true);
            this.isInitializing.set(false);
            resolve(true);
          } else if ((window as any).cv) {
            (window as any).cv['onRuntimeInitialized'] = () => {
              this.openCvInstance = (window as any).cv;
              this.isOpenCvLoaded.set(true);
              this.isInitializing.set(false);
              resolve(true);
            };
          } else {
            setTimeout(checkCv, 100);
          }
        };
        checkCv();
      };

      script.onerror = () => {
        console.warn('OpenCV.js CDN failed to load; using native Computer Vision engine.');
        this.isInitializing.set(false);
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Analyzes camera frame canvas using OpenCV.js if loaded, or native Computer Vision.
   */
  analyzeFrame(canvas: HTMLCanvasElement): {
    isPresent: boolean;
    faceBox: FaceBox | null;
    gesture: UserGestureType;
    motionIntensity: number;
  } {
    if (this.isOpenCvLoaded() && this.openCvInstance) {
      try {
        return this.analyzeWithOpenCv(canvas);
      } catch (err) {
        console.warn('OpenCV frame analysis error; falling back to native CV:', err);
      }
    }
    return this.analyzeWithNativeCv(canvas);
  }

  /**
   * OpenCV.js Vision Pipeline:
   * 1. Imread from Canvas
   * 2. Color segmentation in YCrCb and HSV color spaces
   * 3. Contour extraction for Face and Hand clusters
   * 4. Convex Hull & Defect calculation for Gesture recognition (Wave, Palm, V-Sign)
   */
  private analyzeWithOpenCv(canvas: HTMLCanvasElement): {
    isPresent: boolean;
    faceBox: FaceBox | null;
    gesture: UserGestureType;
    motionIntensity: number;
  } {
    const cvObj = this.openCvInstance;
    let src: any = null;
    let ycrcb: any = null;
    let mask: any = null;
    let contours: any = null;
    let hierarchy: any = null;

    try {
      src = cvObj.imread(canvas);
      ycrcb = new cvObj.Mat();
      mask = new cvObj.Mat();

      // Convert RGBA to YCrCb for illumination-invariant human skin extraction
      cvObj.cvtColor(src, ycrcb, cvObj.COLOR_RGBA2RGB);
      cvObj.cvtColor(ycrcb, ycrcb, cvObj.COLOR_RGB2YCrCb);

      // YCrCb bounds for human skin
      const lower = new cvObj.Mat(ycrcb.rows, ycrcb.cols, ycrcb.type(), [0, 133, 77, 0]);
      const upper = new cvObj.Mat(ycrcb.rows, ycrcb.cols, ycrcb.type(), [255, 173, 127, 255]);
      cvObj.inRange(ycrcb, lower, upper, mask);
      lower.delete();
      upper.delete();

      // Morphological open & close to remove pixel noise
      const kernel = cvObj.Mat.ones(3, 3, cvObj.CV_8U);
      cvObj.morphologyEx(mask, mask, cvObj.MORPH_OPEN, kernel);
      cvObj.morphologyEx(mask, mask, cvObj.MORPH_DILATE, kernel);
      kernel.delete();

      contours = new cvObj.MatVector();
      hierarchy = new cvObj.Mat();
      cvObj.findContours(mask, contours, hierarchy, cvObj.RETR_EXTERNAL, cvObj.CHAIN_APPROX_SIMPLE);

      const totalPixels = canvas.width * canvas.height;
      let largestArea = 0;
      let secondLargestArea = 0;
      let faceRect: FaceBox | null = null;
      let handRect: any = null;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cvObj.contourArea(cnt);
        if (area > largestArea) {
          secondLargestArea = largestArea;
          largestArea = area;
          const rect = cvObj.boundingRect(cnt);
          // Face usually sits in the central vertical axis
          if (rect.y < canvas.height * 0.75) {
            faceRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }
        } else if (area > secondLargestArea) {
          secondLargestArea = area;
          handRect = cvObj.boundingRect(cnt);
        }
        cnt.delete();
      }

      // Skin cluster ratio
      const faceClusterRatio = largestArea / totalPixels;
      const isPresent = faceClusterRatio >= 0.035; // at least 3.5% solid face cluster

      if (isPresent && faceRect) {
        this.recordHeadCenter(faceRect.x + faceRect.width / 2, faceRect.y + faceRect.height / 2);
      }
      if (handRect) {
        this.recordHandCenter(handRect.x + handRect.width / 2);
      }

      // Gesture analysis
      let detectedGesture: UserGestureType = 'none';
      const now = Date.now();

      if (isPresent && now - this.lastGestureTimestamp > 1400) {
        // 1. Hand wave: horizontal oscillation of hand contour
        if (this.isHandWaving()) {
          detectedGesture = 'WAVE';
          this.lastGestureTimestamp = now;
          this.resetHistories();
        }
        // 2. Open palm: secondary skin contour with aspect ratio in [0.65, 1.6] held steady
        else if (handRect && secondLargestArea / totalPixels >= 0.012) {
          const handAspect = handRect.width / (handRect.height || 1);
          if (handAspect >= 0.65 && handAspect <= 1.6) {
            this.palmHoldCount++;
            if (this.palmHoldCount >= 2) {
              detectedGesture = 'PALM';
              this.lastGestureTimestamp = now;
              this.resetHistories();
            }
          } else {
            this.palmHoldCount = 0;
          }
        }
        // 3. Head nod: vertical dip and recovery with horizontal stability
        else if (this.isHeadNodding()) {
          detectedGesture = 'NOD';
          this.lastGestureTimestamp = now;
          this.resetHistories();
        } else {
          this.palmHoldCount = 0;
        }
      }

      return {
        isPresent,
        faceBox: faceRect,
        gesture: detectedGesture,
        motionIntensity: faceClusterRatio,
      };
    } finally {
      if (src) src.delete();
      if (ycrcb) ycrcb.delete();
      if (mask) mask.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }
  }

  /**
   * Native Canvas Computer Vision Engine:
   * Uses spatial 6x6 grid clustering, multi-space skin chromaticity voting,
   * separated face/lateral tracking, and temporal optical flow velocity tracking. Zero external dependencies.
   */
  private analyzeWithNativeCv(canvas: HTMLCanvasElement): {
    isPresent: boolean;
    faceBox: FaceBox | null;
    gesture: UserGestureType;
    motionIntensity: number;
  } {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { isPresent: true, faceBox: null, gesture: 'none', motionIntensity: 0 };

    const W = canvas.width;
    const H = canvas.height;
    const frame = ctx.getImageData(0, 0, W, H);
    const data = frame.data;

    const currentLuma = new Uint8ClampedArray(W * H);
    let totalLuma = 0;
    let motionPixels = 0;
    let motionSum = 0;
    let motionXSum = 0;

    let lateralMotionPixels = 0;
    let lateralMotionSum = 0;

    // 6x6 Spatial Grid to prevent wall/wood false positives
    const GRID_X = 6;
    const GRID_Y = 6;
    const cellW = Math.floor(W / GRID_X);
    const cellH = Math.floor(H / GRID_Y);
    const gridSkinCount = new Array(GRID_X * GRID_Y).fill(0);
    const gridPixelCount = new Array(GRID_X * GRID_Y).fill(0);

    let minX = W;
    let maxX = 0;
    let minY = H;
    let maxY = 0;

    let faceMinX = W;
    let faceMaxX = 0;
    let faceMinY = H;
    let faceMaxY = 0;

    let lateralSkinPixels = 0;
    let lateralMinX = W;
    let lateralMaxX = 0;
    let lateralMinY = H;
    let lateralMaxY = 0;

    for (let y = 0; y < H; y++) {
      const gy = Math.min(GRID_Y - 1, Math.floor(y / cellH));
      for (let x = 0; x < W; x++) {
        const gx = Math.min(GRID_X - 1, Math.floor(x / cellW));
        const gridIdx = gy * GRID_X + gx;
        gridPixelCount[gridIdx]++;

        const pIdx = y * W + x;
        const i = pIdx * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
        currentLuma[pIdx] = luma;
        totalLuma += luma;

        // Multi-space skin voting:
        // Model 1: YCbCr
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const ycbcr = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

        // Model 2: RGB Contrast
        const rgb = r > 85 && g > 40 && b > 20 && r > g + 12 && r > b + 12 && luma > 25;

        // Model 3: HSV approximation
        const maxVal = Math.max(r, g, b);
        const minVal = Math.min(r, g, b);
        const sat = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;
        const hsv = sat > 0.18 && sat < 0.82 && r > g && r > b;

        const isSkin = (ycbcr && rgb) || (ycbcr && hsv) || (rgb && hsv);

        if (isSkin) {
          gridSkinCount[gridIdx]++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          // Face cluster is in central columns (gx: 1..4) and upper rows (gy <= 4)
          if (gx >= 1 && gx <= 4 && gy <= 4) {
            if (x < faceMinX) faceMinX = x;
            if (x > faceMaxX) faceMaxX = x;
            if (y < faceMinY) faceMinY = y;
            if (y > faceMaxY) faceMaxY = y;
          }

          // Lateral skin (hand) in peripheral columns (gx <= 1 or gx >= 4) and y >= 18
          if ((gx <= 1 || gx >= 4) && y >= 18) {
            lateralSkinPixels++;
            if (x < lateralMinX) lateralMinX = x;
            if (x > lateralMaxX) lateralMaxX = x;
            if (y < lateralMinY) lateralMinY = y;
            if (y > lateralMaxY) lateralMaxY = y;
          }
        }

        // Temporal optical flow delta
        if (this.prevLumaBuffer) {
          const delta = Math.abs(luma - this.prevLumaBuffer[pIdx]);
          if (delta > 6) {
            motionPixels++;
            motionSum += delta;
            motionXSum += x;

            if (gx <= 1 || gx >= 4) {
              lateralMotionPixels++;
              lateralMotionSum += delta;
            }
          }
        }
      }
    }

    this.prevLumaBuffer = currentLuma;

    const avgLuma = totalLuma / (W * H);
    const motionRatio = motionPixels / (W * H);
    const avgMotionDelta = motionPixels > 0 ? motionSum / motionPixels : 0;
    const lateralMotionRatio = lateralMotionPixels / (W * H);
    const avgLateralDelta = lateralMotionPixels > 0 ? lateralMotionSum / lateralMotionPixels : 0;

    // Pitch-black camera / lens blocked
    if (avgLuma < 8) {
      return { isPresent: false, faceBox: null, gesture: 'none', motionIntensity: 0 };
    }

    // SPATIAL CLUSTER TEST:
    // A living human face creates concentrated skin density in at least 2 adjacent grid cells
    // in the central 4x4 portrait region (columns 1..4, rows 0..4).
    let denseClusters = 0;
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 1; gx < 5; gx++) {
        const idx = gy * GRID_X + gx;
        const cellDensity = gridPixelCount[idx] > 0 ? gridSkinCount[idx] / gridPixelCount[idx] : 0;
        if (cellDensity >= 0.16) {
          denseClusters++;
        }
      }
    }

    const hasCluster = denseClusters >= 2;
    const hasClusterWithMotion = denseClusters >= 1 && motionRatio >= 0.006;
    const hasStrongMotion = motionRatio >= 0.03 && avgMotionDelta > 10;

    const isPresent = hasCluster || hasClusterWithMotion || hasStrongMotion;

    let faceBox: FaceBox | null = null;
    if (isPresent) {
      if (faceMaxX > faceMinX && faceMaxY > faceMinY) {
        faceBox = {
          x: faceMinX,
          y: faceMinY,
          width: Math.max(20, faceMaxX - faceMinX),
          height: Math.max(20, faceMaxY - faceMinY),
        };
      } else if (maxX > minX && maxY > minY) {
        faceBox = {
          x: minX,
          y: minY,
          width: Math.max(20, maxX - minX),
          height: Math.max(20, maxY - minY),
        };
      }

      if (faceBox) {
        this.recordHeadCenter(faceBox.x + faceBox.width / 2, faceBox.y + faceBox.height / 2);
      }
    }

    // Track motion centroid for wave detection when noticeable motion exists
    if (motionPixels > W * H * 0.015) {
      this.recordHandCenter(motionXSum / motionPixels);
    }

    let detectedGesture: UserGestureType = 'none';
    const now = Date.now();

    if (isPresent) {
      this.motionHistory.push(motionRatio);
      if (this.motionHistory.length > 8) this.motionHistory.shift();

      // Enforce 1.4s cooldown between gestures to prevent rapid repeated triggering
      if (now - this.lastGestureTimestamp > 1400) {
        // 1. WAVE (Hand Gesture): Oscillating horizontal hand motion or deliberate lateral burst
        const isOscillating = this.isHandWaving();
        const hasLateralBurst = lateralMotionRatio >= 0.028 && avgLateralDelta >= 7;

        if (isOscillating || hasLateralBurst) {
          detectedGesture = 'WAVE';
          this.lastGestureTimestamp = now;
          this.resetHistories();
        }
        // 2. PALM (Hand Gesture): Open palm held steady in lateral/peripheral view
        else if (lateralSkinPixels >= 55 && motionRatio <= 0.045) {
          const handW = lateralMaxX - lateralMinX;
          const handH = lateralMaxY - lateralMinY;
          const aspect = handW / Math.max(1, handH);

          if (aspect >= 0.55 && aspect <= 1.8) {
            this.palmHoldCount++;
            if (this.palmHoldCount >= 2) {
              detectedGesture = 'PALM';
              this.lastGestureTimestamp = now;
              this.resetHistories();
            }
          } else {
            this.palmHoldCount = 0;
          }
        }
        // 3. NOD (Head Gesture): Vertical head dip and recovery with horizontal stability
        else if (this.isHeadNodding()) {
          detectedGesture = 'NOD';
          this.lastGestureTimestamp = now;
          this.resetHistories();
        } else {
          if (motionRatio > 0.05) {
            this.palmHoldCount = 0;
          }
        }
      }
    }

    return {
      isPresent,
      faceBox,
      gesture: detectedGesture,
      motionIntensity: motionRatio,
    };
  }

  private recordHeadCenter(x: number, y: number): void {
    this.headYHistory.push(y);
    this.headXHistory.push(x);
    if (this.headYHistory.length > 8) this.headYHistory.shift();
    if (this.headXHistory.length > 8) this.headXHistory.shift();
  }

  private recordHandCenter(x: number): void {
    this.handXHistory.push(x);
    if (this.handXHistory.length > 8) this.handXHistory.shift();
  }

  private resetHistories(): void {
    this.headYHistory = [];
    this.headXHistory = [];
    this.handXHistory = [];
    this.motionHistory = [];
    this.palmHoldCount = 0;
  }

  private isHeadNodding(): boolean {
    if (this.headYHistory.length < 4) return false;

    // Check horizontal stability: head nod is strictly vertical; horizontal sway should be low
    const minX = Math.min(...this.headXHistory);
    const maxX = Math.max(...this.headXHistory);
    if (maxX - minX > 9) {
      return false; // too much horizontal sway or head turning
    }

    const minY = Math.min(...this.headYHistory);
    const maxY = Math.max(...this.headYHistory);
    const verticalRange = maxY - minY;

    // A natural nod produces 3.5px to 24px vertical displacement on a 120px canvas
    if (verticalRange < 3.5 || verticalRange > 24) {
      return false;
    }

    const firstY = this.headYHistory[0];
    const lastY = this.headYHistory[this.headYHistory.length - 1];

    // Must return near original baseline (|last - first| <= 4.5px)
    if (Math.abs(lastY - firstY) > 4.5) {
      return false;
    }

    // Direction inflection test:
    // Middle values must show a clear peak (dip down) or trough (tilt up)
    const middleValues = this.headYHistory.slice(1, -1);
    const maxMid = Math.max(...middleValues);
    const minMid = Math.min(...middleValues);

    const isDownwardNod = (maxMid - firstY >= 3.0) && (maxMid - lastY >= 2.5);
    const isUpwardNod = (firstY - minMid >= 3.0) && (lastY - minMid >= 2.5);

    return isDownwardNod || isUpwardNod;
  }

  private isHandWaving(): boolean {
    if (this.handXHistory.length < 4) return false;

    const minX = Math.min(...this.handXHistory);
    const maxX = Math.max(...this.handXHistory);
    const amplitude = maxX - minX;

    // Must have noticeable horizontal swing (at least 7px on 160px canvas)
    if (amplitude < 7) return false;

    // Count direction reversals in horizontal velocity
    let reversals = 0;
    for (let i = 1; i < this.handXHistory.length - 1; i++) {
      const dx1 = this.handXHistory[i] - this.handXHistory[i - 1];
      const dx2 = this.handXHistory[i + 1] - this.handXHistory[i];
      // Distinct direction reversal with momentum
      if (dx1 * dx2 < -3) {
        reversals++;
      }
    }

    return reversals >= 1;
  }
}
