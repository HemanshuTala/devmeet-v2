/**
 * @file useProctoring.ts (Edge AI Video Proctoring & Computer Vision Hook)
 * @description Advanced client-side computer vision hook implementing automated proctoring
 * directly within the candidate's browser without sending raw video feeds to external servers.
 *
 * Vision Capabilities:
 * 1. Face & Gaze Tracking: Powered by @mediapipe/tasks-vision (FaceLandmarker) with lightweight Canvas Fallback.
 *    Monitors 478 face mesh landmarks, pupil iris deviation (468/473), and head yaw rotation.
 *    Accurately detects looking left, looking right, looking away, or face absence.
 * 2. Object & Multi-Person Detection: Powered by @tensorflow-models/coco-ssd.
 *    Throttled to run every 1.5s; flags prohibited devices (e.g. smartphones) and multiple people in frame.
 * 3. Graceful Fallback / Resilience: Never blocks the candidate if CDN is slow; runs built-in canvas
 *    gaze estimator while models initialize.
 *
 * Used by: VideoPanel
 */

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

export type GazeDirection = 'aligned' | 'left' | 'right' | 'up' | 'down' | 'none';

/**
 * Interface representing the state and control handles returned by the proctoring hook.
 */
export interface ProctoringResult {
  /** Whether edge ML vision models have finished loading */
  modelsLoaded: boolean;
  /** True if running in graceful fallback mode (low-spec GPU or CDN timeout) */
  isDegraded: boolean;
  /** Active warning message to display on the video overlay */
  activeWarning: string | null;
  /** Current gaze / head direction */
  gazeDirection: GazeDirection;
  /** Non-fatal diagnostic error message encountered during model setup */
  proctorError: string | null;
  /** Whether virtual background blur is enabled */
  backgroundBlur: boolean;
  /** State setter for background blur toggle */
  setBackgroundBlur: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Performance warning string if background segmentation drops below threshold */
  blurPerformanceWarning: string | null;
  /** State setter for background blur warning */
  setBlurPerformanceWarning: (v: string | null) => void;
  /** Canvas ref used for face mesh overlays and video processing */
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * useProctoring Hook.
 *
 * @param videoRef - HTMLVideoElement displaying the candidate's live camera feed
 * @param stream - Active MediaStream containing the camera track
 * @param isActive - True if interview session is in progress
 * @param videoActive - True if camera video track is unmuted
 * @param onProctorViolation - Callback notifying parent interview studio of proctoring warnings
 * @param addLog - Logging callback for device/diagnostic logs
 */
export function useProctoring(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  isActive: boolean,
  videoActive: boolean,
  onProctorViolation?: (type: string, message: string) => void,
  addLog?: (msg: string) => void,
): ProctoringResult {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>('aligned');
  const [proctorError, setProctorError] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [blurPerformanceWarning, setBlurPerformanceWarning] = useState<string | null>(null);

  // Machine learning model refs
  const landmarkerRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);

  // Drawing canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);

  // Timers and violation debouncers
  const lastObjectDetectionTime = useRef(0);
  const lookAwayStart = useRef<number | null>(null);
  const noPersonStart = useRef<number | null>(null);
  const phoneDetectionCount = useRef(0);
  const multiPersonDetectionCount = useRef(0);
  const prevWarningRef = useRef<string | null>(null);
  const violationTriggeredRef = useRef(false);

  const log = useCallback((msg: string) => addLog?.(msg), [addLog]);

  /**
   * Resilient Model Initialization Effect:
   * Dynamically imports TensorFlow.js, COCO-SSD, and MediaPipe Vision tasks.
   * Uses a generous 25-second timeout race while the canvas fallback provides immediate coverage.
   */
  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        log('Initializing AI Proctoring vision subsystem...');

        // 25-second timeout race to allow realistic model weights download
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Neural vision download timed out (using canvas edge fallback)')), 25000)
        );

        const modelLoadPromise = (async () => {
          // Step 1: Import modules dynamically
          const [vision, tf, cocoSsd] = await Promise.all([
            import('@mediapipe/tasks-vision'),
            import('@tensorflow/tfjs'),
            import('@tensorflow-models/coco-ssd'),
          ]);
          await tf.ready();
          if (!active) return;

          log('Loading MediaPipe Face Landmarker & Object Detector...');

          // Step 2: Download WASM fileset + COCO-SSD in parallel
          const filesetPromise = vision.FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
          );
          const cocoPromise = cocoSsd.load({ base: 'lite_mobilenet_v2' });

          const [filesetResolver, detector] = await Promise.all([filesetPromise, cocoPromise]);
          if (!active) return;
          detectorRef.current = detector;

          // Step 3: Instantiate FaceLandmarker (attempt GPU delegate first, fallback to CPU)
          let landmarker;
          try {
            landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU',
              },
              outputFaceBlendshapes: false,
              runningMode: 'VIDEO',
            });
          } catch {
            log('GPU delegate fallback to CPU for face tracker...');
            landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'CPU',
              },
              outputFaceBlendshapes: false,
              runningMode: 'VIDEO',
            });
          }
          if (!active) return;
          landmarkerRef.current = landmarker;
        })();

        await Promise.race([modelLoadPromise, timeoutPromise]);

        if (active) {
          setModelsLoaded(true);
          setIsDegraded(false);
          log('Proctor AI neural edge models active.');
        }
      } catch (err: any) {
        if (!active) return;
        console.warn('Proctoring advanced ML fallback enabled:', err.message);
        setProctorError(err.message || String(err));
        setModelsLoaded(true);
        setIsDegraded(true);
        log(`Proctor running with edge vision fallback (${err.message || 'fallback'})`);
      }
    }

    loadModels();
    return () => {
      active = false;
      landmarkerRef.current?.close();
    };
  }, [log]);

  /**
   * Real-Time Video Frame Analysis Loop:
   * Analyzes camera frames for:
   * 1. High-precision Head Yaw & Gaze Direction (looking left, right, up, down).
   * 2. Candidate Face Presence / Absence.
   * 3. Secondary participant / smartphone object detection.
   */
  useEffect(() => {
    // Only analyze when candidate's video is active
    if (!videoActive || !stream) {
      setGazeDirection('none');
      setActiveWarning(null);
      return;
    }

    let isRunning = true;

    async function processFrame() {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Ensure video element is playing with valid frames
      if (!video || !canvas || video.readyState < 2 || video.paused) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let currentWarning: string | null = null;
      let currentDirection: GazeDirection = 'aligned';

      try {
        // ── 1. High-Precision MediaPipe Landmark Gaze & Head-Yaw Analysis ──
        if (landmarkerRef.current) {
          const results = landmarkerRef.current.detectForVideo(video, now);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            noPersonStart.current = null;
            const landmarks = results.faceLandmarks[0];

            // Core anatomical landmark points:
            // 1: Nose tip
            // 234: Left face boundary (cheek/ear)
            // 454: Right face boundary (cheek/ear)
            // 10: Top of forehead
            // 152: Chin bottom
            // 468, 473: Left & Right iris centers
            // 33, 133: Left eye outer & inner corners
            // 362, 263: Right eye inner & outer corners
            const nose = landmarks[1];
            const leftCheek = landmarks[234];
            const rightCheek = landmarks[454];

            // Horizontal face boundary
            const minCheekX = Math.min(leftCheek.x, rightCheek.x);
            const maxCheekX = Math.max(leftCheek.x, rightCheek.x);
            const faceWidth = maxCheekX - minCheekX;

            // Ratio of nose position across horizontal span (Center is ~0.46 to 0.54)
            const noseYawRatio = faceWidth > 0.03 ? (nose.x - minCheekX) / faceWidth : 0.5;

            // Pupil / Iris deviation relative to eye sockets
            let irisRatio = 0.5;
            if (landmarks.length >= 474) {
              const leftIris = landmarks[468];
              const rightIris = landmarks[473];
              const leftEyeOuter = landmarks[33];
              const leftEyeInner = landmarks[133];
              const rightEyeInner = landmarks[362];
              const rightEyeOuter = landmarks[263];

              const leftEyeW = Math.abs(leftEyeInner.x - leftEyeOuter.x);
              const rightEyeW = Math.abs(rightEyeOuter.x - rightEyeInner.x);

              if (leftEyeW > 0.008 && rightEyeW > 0.008) {
                const lPos = (leftIris.x - Math.min(leftEyeInner.x, leftEyeOuter.x)) / leftEyeW;
                const rPos = (rightIris.x - Math.min(rightEyeInner.x, rightEyeOuter.x)) / rightEyeW;
                irisRatio = (lPos + rPos) / 2;
              }
            }

            // Vertical Head Pitch (forehead to chin)
            const forehead = landmarks[10];
            const chin = landmarks[152];
            const faceMinY = Math.min(forehead.y, chin.y);
            const faceMaxY = Math.max(forehead.y, chin.y);
            const faceHeight = faceMaxY - faceMinY;
            const nosePitchRatio = faceHeight > 0.03 ? (nose.y - faceMinY) / faceHeight : 0.5;

            // Evaluate Head Yaw + Gaze Orientation
            // Looking Left: Nose moves toward left cheek or iris shifts left
            if (noseYawRatio < 0.38 || irisRatio < 0.32) {
              currentDirection = 'left';
            } else if (noseYawRatio > 0.62 || irisRatio > 0.68) {
              currentDirection = 'right';
            } else if (nosePitchRatio < 0.36) {
              currentDirection = 'up';
            } else if (nosePitchRatio > 0.72) {
              currentDirection = 'down';
            } else {
              currentDirection = 'aligned';
            }

            // Draw subtle eye landmark points for high-tech HUD visual feedback
            if (landmarks.length >= 474) {
              ctx.fillStyle = currentDirection === 'aligned' ? 'rgba(52, 211, 153, 0.7)' : 'rgba(251, 191, 36, 0.9)';
              const lIrisX = landmarks[468].x * canvas.width;
              const lIrisY = landmarks[468].y * canvas.height;
              const rIrisX = landmarks[473].x * canvas.width;
              const rIrisY = landmarks[473].y * canvas.height;
              ctx.beginPath();
              ctx.arc(lIrisX, lIrisY, 2.5, 0, 2 * Math.PI);
              ctx.arc(rIrisX, rIrisY, 2.5, 0, 2 * Math.PI);
              ctx.fill();
            }
          } else {
            currentDirection = 'none';
          }
        } else {
          // ── Fallback Edge Face & Motion Centroid (Active while ML loads or if degraded) ──
          if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
            offscreenCanvasRef.current.width = 160;
            offscreenCanvasRef.current.height = 120;
          }
          const offCtx = offscreenCanvasRef.current.getContext('2d');
          if (offCtx) {
            offCtx.drawImage(video, 0, 0, 160, 120);
            const imgData = offCtx.getImageData(0, 0, 160, 120).data;

            let totalWeight = 0;
            let weightedX = 0;
            let activePixelCount = 0;

            // Inspect central region (where face is positioned)
            for (let y = 15; y < 90; y += 2) {
              for (let x = 20; x < 140; x += 2) {
                const idx = (y * 160 + x) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                const brightness = (r + g + b) / 3;

                // Skin-tone / face luminosity clustering
                if (brightness > 45 && r > b && (r - b) > 12) {
                  weightedX += x;
                  totalWeight++;
                  activePixelCount++;
                }
              }
            }

            if (activePixelCount > 35) {
              const centroidX = weightedX / totalWeight; // Center is 80 (normalized 0.50)
              const normalizedCentroid = centroidX / 160;

              if (normalizedCentroid < 0.38) {
                currentDirection = 'left';
              } else if (normalizedCentroid > 0.62) {
                currentDirection = 'right';
              } else {
                currentDirection = 'aligned';
              }
            } else {
              currentDirection = 'none';
            }
          }
        }

        setGazeDirection(currentDirection);

        // ── 2. Violation Warnings & Debouncing ──
        if (currentDirection === 'left' || currentDirection === 'right' || currentDirection === 'up' || currentDirection === 'down') {
          if (!lookAwayStart.current) {
            lookAwayStart.current = now;
          }
          const lookAwayDuration = now - lookAwayStart.current;

          // After 800ms of looking away: Display active warning banner
          if (lookAwayDuration > 800) {
            if (currentDirection === 'left') {
              currentWarning = 'Warning: Looking left detected. Please face the screen.';
            } else if (currentDirection === 'right') {
              currentWarning = 'Warning: Looking right detected. Please face the screen.';
            } else {
              currentWarning = 'Warning: Looking away detected. Please face the screen.';
            }
          }

          // After 3.0s of continuous looking away: Trigger proctoring violation strike
          if (lookAwayDuration > 3000 && !violationTriggeredRef.current) {
            violationTriggeredRef.current = true;
            onProctorViolation?.('tab_switch', `Sustained looking away detected (${currentDirection} for >3s).`);
          }
        } else if (currentDirection === 'none') {
          if (!noPersonStart.current) {
            noPersonStart.current = now;
          }
          const absenceDuration = now - noPersonStart.current;
          if (absenceDuration > 1500) {
            currentWarning = 'Candidate face not detected in frame';
          }
          if (absenceDuration > 4500 && !violationTriggeredRef.current) {
            violationTriggeredRef.current = true;
            onProctorViolation?.('tab_switch', 'Candidate disappeared from camera frame (>4s).');
          }
        } else {
          // Gaze is ALIGNED: Reset look-away timer and violation trigger flag
          lookAwayStart.current = null;
          noPersonStart.current = null;
          violationTriggeredRef.current = false;
        }

        // ── 3. Object Detection (Smartphones / Secondary Persons) Every 1.5s ──
        if (detectorRef.current && now - lastObjectDetectionTime.current > 1500) {
          lastObjectDetectionTime.current = now;
          const predictions = await detectorRef.current.detect(video);

          let cellPhoneFound = false;
          let peopleCount = 0;

          for (const p of predictions) {
            if (p.class === 'cell phone' && p.score > 0.55) {
              cellPhoneFound = true;
            }
            if (p.class === 'person' && p.score > 0.6) {
              peopleCount++;
            }
          }

          if (cellPhoneFound) {
            phoneDetectionCount.current++;
            if (phoneDetectionCount.current >= 2) {
              currentWarning = 'Prohibited device detected (phone)';
            }
          } else {
            phoneDetectionCount.current = 0;
          }

          if (peopleCount > 1) {
            multiPersonDetectionCount.current++;
            if (multiPersonDetectionCount.current >= 2) {
              currentWarning = 'Multiple people detected in camera frame';
            }
          } else {
            multiPersonDetectionCount.current = 0;
          }
        }

        // ── 4. Dispatch Active Warning ──
        if (currentWarning) {
          setActiveWarning(currentWarning);
          if (currentWarning !== prevWarningRef.current) {
            prevWarningRef.current = currentWarning;
          }
        } else {
          setActiveWarning(null);
          prevWarningRef.current = null;
        }
      } catch (err) {
        // Suppress frame processing errors
      }

      requestRef.current = requestAnimationFrame(processFrame);
    }

    requestRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, videoActive, stream, onProctorViolation, videoRef]);

  return {
    modelsLoaded,
    isDegraded,
    activeWarning,
    gazeDirection,
    proctorError,
    backgroundBlur,
    setBackgroundBlur,
    blurPerformanceWarning,
    setBlurPerformanceWarning,
    canvasRef,
  };
}
