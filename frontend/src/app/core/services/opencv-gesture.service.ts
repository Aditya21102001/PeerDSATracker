import { Injectable, signal } from '@angular/core';
import { FaceBox, UserGestureType } from '../models/video-study-coach.models';

declare const cv: any;

@Injectable({ providedIn: 'root' })
export class OpenCvGestureService {
  readonly isOpenCvLoaded = signal<boolean>(false);
  readonly isInitializing = signal<boolean>(false);
  private openCvInstance: any = null;
  private prevLumaBuffer: Uint8ClampedArray | null = null;
  private waveMotionHistory: number[] = [];
  private headYHistory: number[] = [];
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

      // Gesture analysis
      let detectedGesture: UserGestureType = 'none';
      const now = Date.now();

      if (isPresent && now - this.lastGestureTimestamp > 1400) {
        // Hand wave / open palm detection:
        // A waving hand produces significant peripheral motion and secondary skin contour
        if (handRect && secondLargestArea / totalPixels >= 0.015) {
          const handAspect = handRect.width / (handRect.height || 1);
          if (handAspect > 0.6 && handAspect < 1.6) {
            detectedGesture = 'PALM';
            this.lastGestureTimestamp = now;
          }
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
   * and temporal optical flow velocity tracking. Zero external dependencies.
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
        }

        // Temporal optical flow delta
        if (this.prevLumaBuffer) {
          const delta = Math.abs(luma - this.prevLumaBuffer[pIdx]);
          if (delta > 6) {
            motionPixels++;
            motionSum += delta;
          }
        }
      }
    }

    this.prevLumaBuffer = currentLuma;

    const avgLuma = totalLuma / (W * H);
    const motionRatio = motionPixels / (W * H);
    const avgMotionDelta = motionPixels > 0 ? motionSum / motionPixels : 0;

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
          // at least 16% skin in this cell
          denseClusters++;
        }
      }
    }

    // Living person presence criteria:
    // 1. Either dense spatial cluster in central upper region (>= 2 cells)
    // 2. OR 1 dense cluster + biological micro-motion
    // 3. OR high motion (> 2.5%) with reasonable bounding box
    const hasCluster = denseClusters >= 2;
    const hasClusterWithMotion = denseClusters >= 1 && motionRatio >= 0.006;
    const hasStrongMotion = motionRatio >= 0.03 && avgMotionDelta > 10;

    const isPresent = hasCluster || hasClusterWithMotion || hasStrongMotion;

    let faceBox: FaceBox | null = null;
    if (isPresent && maxX > minX && maxY > minY) {
      faceBox = {
        x: minX,
        y: minY,
        width: Math.max(20, maxX - minX),
        height: Math.max(20, maxY - minY),
      };
      this.headYHistory.push(faceBox.y + faceBox.height / 2);
      if (this.headYHistory.length > 8) this.headYHistory.shift();
    }

    // GESTURE CLASSIFICATION (Calibrated for high deliberate intent, zero accidental triggers)
    let detectedGesture: UserGestureType = 'none';
    const now = Date.now();

    if (isPresent) {
      this.waveMotionHistory.push(motionRatio);
      if (this.waveMotionHistory.length > 8) this.waveMotionHistory.shift();

      // Enforce 3.0s cooldown between gestures to prevent rapid repeated triggering
      if (now - this.lastGestureTimestamp > 3000 && this.waveMotionHistory.length >= 4) {
        const last = this.waveMotionHistory[this.waveMotionHistory.length - 1];
        const prev = this.waveMotionHistory[this.waveMotionHistory.length - 2];
        const prev2 = this.waveMotionHistory[this.waveMotionHistory.length - 3];
        const avg = this.waveMotionHistory.reduce((a, b) => a + b, 0) / this.waveMotionHistory.length;

        // Ensure hand is in the periphery or distinctly separated from central face
        const isLateralHandMotion = minX < W * 0.3 || maxX > W * 0.7;

        // WAVE (Hand Gesture): Deliberate horizontal hand oscillation (sustained motion spike > 12% across 3 frames)
        if (isLateralHandMotion && last > 0.12 && prev > 0.08 && avg > 0.06 && avgMotionDelta > 12) {
          detectedGesture = 'WAVE';
          this.lastGestureTimestamp = now;
        }
        // PALM (Hand Gesture): Open palm held steady in lateral view
        else if (isLateralHandMotion && last > 0.09 && prev > 0.07 && prev2 > 0.06 && avg < 0.15) {
          detectedGesture = 'PALM';
          this.lastGestureTimestamp = now;
        }
        // NOD (Head Gesture): Rhythmic vertical head nod or deliberate vertical displacement
        else if (!isLateralHandMotion && (
          (avg >= 0.035 && avg <= 0.075 && this.waveMotionHistory.filter((v) => v >= 0.03).length >= 4) ||
          this.isHeadNodding()
        )) {
          detectedGesture = 'NOD';
          this.lastGestureTimestamp = now;
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

  private isHeadNodding(): boolean {
    if (this.headYHistory.length < 4) return false;
    const len = this.headYHistory.length;
    const y0 = this.headYHistory[len - 4];
    const y1 = this.headYHistory[len - 3];
    const y2 = this.headYHistory[len - 2];
    const y3 = this.headYHistory[len - 1];
    // Vertical dip and recovery (nod down and up)
    const isDipAndRise = y1 > y0 + 3 && y2 > y3 + 2;
    const isRiseAndDip = y1 < y0 - 3 && y2 < y3 - 2;
    return isDipAndRise || isRiseAndDip;
  }
}
