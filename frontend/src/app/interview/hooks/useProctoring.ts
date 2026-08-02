import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

interface ProctoringResult {
  modelsLoaded: boolean;
  activeWarning: string | null;
  proctorError: string | null;
  backgroundBlur: boolean;
  setBackgroundBlur: (v: boolean | ((prev: boolean) => boolean)) => void;
  blurPerformanceWarning: string | null;
  setBlurPerformanceWarning: (v: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function useProctoring(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  isActive: boolean,
  videoActive: boolean,
  onProctorViolation?: (type: string, message: string) => void,
  addLog?: (msg: string) => void,
): ProctoringResult {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [proctorError, setProctorError] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [blurPerformanceWarning, setBlurPerformanceWarning] = useState<string | null>(null);

  const landmarkerRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurDurationsRef = useRef<number[]>([]);
  const requestRef = useRef<number | null>(null);
  const lastObjectDetectionTime = useRef(0);
  const lookAwayStart = useRef<number | null>(null);
  const noPersonStart = useRef<number | null>(null);
  const phoneDetectionCount = useRef(0);
  const multiPersonDetectionCount = useRef(0);
  const prevWarningRef = useRef<string | null>(null);

  const log = useCallback((msg: string) => addLog?.(msg), [addLog]);

  // Load proctoring models (parallelized for speed)
  useEffect(() => {
    let active = true;
    async function loadModels() {
      try {
        log('Loading Proctoring modules...');

        // Step 1: Import all JS modules in parallel
        const [vision, tf, cocoSsd] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          import('@tensorflow/tfjs'),
          import('@tensorflow-models/coco-ssd'),
        ]);
        await tf.ready();
        if (!active) return;

        log('Downloading AI models...');

        // Step 2: Download WASM fileset + both ML models in parallel
        const filesetPromise = vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm',
        );
        const cocoPromise = cocoSsd.load({ base: 'lite_mobilenet_v2' });

        const [filesetResolver, detector] = await Promise.all([filesetPromise, cocoPromise]);
        if (!active) return;
        detectorRef.current = detector;

        // Step 3: FaceLandmarker needs fileset first, but runs concurrent with nothing else now
        let landmarker;
        try {
          landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
            outputFaceBlendshapes: false, runningMode: 'VIDEO',
          });
        } catch {
          log('GPU delegate failed, falling back to CPU...');
          landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
            outputFaceBlendshapes: false, runningMode: 'VIDEO',
          });
        }
        if (!active) return;
        landmarkerRef.current = landmarker;

        setModelsLoaded(true);
        log('Proctor AI models fully loaded and active.');
      } catch (err: any) {
        console.error('Failed to load proctor models:', err);
        setProctorError(err.message || String(err));
        log(`Proctor models failed to load: ${err.message || err}`);
      }
    }
    loadModels();
    return () => { active = false; landmarkerRef.current?.close(); };
  }, [log]);

  // Frame processing loop
  useEffect(() => {
    if (!isActive || !videoActive || !stream || !modelsLoaded) {
      if (requestRef.current) { cancelAnimationFrame(requestRef.current); requestRef.current = null; }
      setActiveWarning(null);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    let running = true;

    const detectFrame = async () => {
      if (!running) return;
      if (video.paused || video.ended || video.readyState < 2) {
        requestRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      try {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const now = performance.now();
        const startTime = performance.now();
        let lookAwayViolated = false;
        let phoneViolated = false;
        let multiPersonViolated = false;
        let noPersonViolated = false;

        if (backgroundBlur && canvas && ctx) {
          ctx.save();
          ctx.filter = 'blur(12px)';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        // MediaPipe gaze tracking
        if (landmarkerRef.current) {
          const results = landmarkerRef.current.detectForVideo(video, now);
          if (results.faceLandmarks?.length > 0) {
            const lm = results.faceLandmarks[0];
            const noseTip = lm[4];
            const leftEdge = lm[234], rightEdge = lm[454];
            const faceWidth = Math.abs(rightEdge.x - leftEdge.x);
            const nosePosRatio = faceWidth > 0 ? (noseTip.x - leftEdge.x) / faceWidth : 0.5;

            const leftPupil = lm[468], rightPupil = lm[473];
            const leftEyeInner = lm[133], leftEyeOuter = lm[33];
            const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
            const leftEyeCenter = (leftEyeInner.x + leftEyeOuter.x) / 2;
            const leftPupilDev = leftEyeWidth > 0 ? (leftPupil.x - leftEyeCenter) / leftEyeWidth : 0;

            const rightEyeInner = lm[362], rightEyeOuter = lm[263];
            const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
            const rightEyeCenter = (rightEyeInner.x + rightEyeOuter.x) / 2;
            const rightPupilDev = rightEyeWidth > 0 ? (rightPupil.x - rightEyeCenter) / rightEyeWidth : 0;

            const averagePupilDev = (leftPupilDev + rightPupilDev) / 2;
            if (nosePosRatio < 0.33 || nosePosRatio > 0.67 || averagePupilDev < -0.25 || averagePupilDev > 0.25) {
              lookAwayViolated = true;
            }

            // Background blur foreground compositing
            if (backgroundBlur && canvas && ctx) {
              if (!maskCanvasRef.current) maskCanvasRef.current = document.createElement('canvas');
              const maskCanvas = maskCanvasRef.current;
              if (maskCanvas.width !== canvas.width || maskCanvas.height !== canvas.height) {
                maskCanvas.width = canvas.width; maskCanvas.height = canvas.height;
              }
              const maskCtx = maskCanvas.getContext('2d')!;
              maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
              maskCtx.fillStyle = 'black';
              maskCtx.beginPath();
              maskCtx.moveTo(lm[10].x * canvas.width, lm[10].y * canvas.height);
              const leftContour = [109,67,103,54,21,162,127,234,93,132,58,172,136,150,149,176,148];
              for (const idx of leftContour) { if (lm[idx]) maskCtx.lineTo(lm[idx].x * canvas.width, lm[idx].y * canvas.height); }
              maskCtx.lineTo(Math.max(0, (lm[148].x - faceWidth * 1.5) * canvas.width), canvas.height);
              maskCtx.lineTo(0, canvas.height);
              maskCtx.lineTo(canvas.width, canvas.height);
              maskCtx.lineTo(Math.min(canvas.width, (lm[377].x + faceWidth * 1.5) * canvas.width), canvas.height);
              const rightContour = [377,400,378,379,365,397,288,361,323,454,356,389,251,284,332,297,338];
              for (const idx of rightContour) { if (lm[idx]) maskCtx.lineTo(lm[idx].x * canvas.width, lm[idx].y * canvas.height); }
              maskCtx.closePath();
              maskCtx.fill();

              if (!fgCanvasRef.current) fgCanvasRef.current = document.createElement('canvas');
              const fgCanvas = fgCanvasRef.current;
              if (fgCanvas.width !== canvas.width || fgCanvas.height !== canvas.height) {
                fgCanvas.width = canvas.width; fgCanvas.height = canvas.height;
              }
              const fgCtx = fgCanvas.getContext('2d')!;
              fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
              fgCtx.drawImage(video, 0, 0, fgCanvas.width, fgCanvas.height);
              fgCtx.globalCompositeOperation = 'destination-in';
              fgCtx.filter = 'blur(8px)';
              fgCtx.drawImage(maskCanvas, 0, 0);
              fgCtx.filter = 'none';
              fgCtx.globalCompositeOperation = 'source-over';
              ctx.drawImage(fgCanvas, 0, 0);
            }

            // Draw pupil/nose markers
            if (canvas && ctx) {
              ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
              ctx.beginPath();
              ctx.arc(leftPupil.x * canvas.width, leftPupil.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.arc(rightPupil.x * canvas.width, rightPupil.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = 'rgba(124, 58, 237, 0.7)';
              ctx.beginPath();
              ctx.arc(noseTip.x * canvas.width, noseTip.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.fill();
            }
          } else {
            noPersonViolated = true;
          }
        }

        // Performance monitoring for blur
        if (backgroundBlur) {
          const duration = performance.now() - startTime;
          blurDurationsRef.current.push(duration);
          if (blurDurationsRef.current.length > 10) blurDurationsRef.current.shift();
          if (blurDurationsRef.current.length === 10) {
            const avg = blurDurationsRef.current.reduce((a, b) => a + b, 0) / 10;
            if (avg > 50) {
              setBackgroundBlur(false);
              blurDurationsRef.current = [];
              log('Background blur disabled automatically to optimize performance.');
              setBlurPerformanceWarning('Background blur disabled automatically to optimize performance.');
            }
          }
        }

        // COCO-SSD object detection (every 1.5s)
        if (detectorRef.current && now - lastObjectDetectionTime.current >= 1500) {
          lastObjectDetectionTime.current = now;
          const predictions = await detectorRef.current.detect(video);
          let personCount = 0;
          let cellPhoneDetected = false;

          predictions.forEach((pred: any) => {
            if (pred.score > 0.4) {
              if (pred.class === 'person') personCount++;
              else if (pred.class === 'cell phone') cellPhoneDetected = true;
              if (canvas && ctx && (pred.class === 'cell phone' || pred.class === 'book' || (pred.class === 'person' && personCount > 1))) {
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
                ctx.lineWidth = 3;
                ctx.strokeRect(pred.bbox[0], pred.bbox[1], pred.bbox[2], pred.bbox[3]);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`${pred.class} (${Math.round(pred.score * 100)}%)`, pred.bbox[0] + 5, pred.bbox[1] + 15);
              }
            }
          });

          if (cellPhoneDetected) {
            phoneDetectionCount.current++;
            if (phoneDetectionCount.current >= 2) { phoneViolated = true; phoneDetectionCount.current = 0; }
          } else { phoneDetectionCount.current = 0; }

          if (personCount > 1) {
            multiPersonDetectionCount.current++;
            if (multiPersonDetectionCount.current >= 2) { multiPersonViolated = true; multiPersonDetectionCount.current = 0; }
          } else { multiPersonDetectionCount.current = 0; }

          if (personCount === 0) noPersonViolated = true;
        }

        // Process warnings & violations
        const timeLimit = 2000;
        let currentWarning: string | null = null;

        if (lookAwayViolated) {
          if (!lookAwayStart.current) lookAwayStart.current = Date.now();
          if (Date.now() - lookAwayStart.current >= timeLimit) {
            onProctorViolation?.('tab_switch', 'Warning: Eye gaze deviation detected. Please keep your eyes focused on the screen.');
            lookAwayStart.current = null;
          } else { currentWarning = 'Looking Away Detected - Keep eyes on screen'; }
        } else { lookAwayStart.current = null; }

        if (phoneViolated) {
          onProctorViolation?.('paste', 'Warning: Prohibited device (cell phone) detected in camera frame.');
        }
        if (phoneDetectionCount.current > 0) currentWarning = 'Warning: Cell Phone Detected!';

        if (multiPersonViolated) {
          onProctorViolation?.('paste', 'Warning: Multiple people detected in front of the camera.');
        }
        if (multiPersonDetectionCount.current > 0) currentWarning = 'Warning: Multiple People Detected!';

        if (noPersonViolated) {
          if (!noPersonStart.current) noPersonStart.current = Date.now();
          if (Date.now() - noPersonStart.current >= timeLimit) {
            onProctorViolation?.('tab_switch', 'Warning: Candidate not detected. Please remain in front of the camera.');
            noPersonStart.current = null;
          } else { currentWarning = 'No Face Detected - Position yourself in camera frame'; }
        } else { noPersonStart.current = null; }

        if (currentWarning !== prevWarningRef.current) {
          prevWarningRef.current = currentWarning;
          setActiveWarning(currentWarning);
        }
      } catch (err) {
        console.error('Proctoring frame calculation error:', err);
      }

      if (running) requestRef.current = requestAnimationFrame(detectFrame);
    };

    requestRef.current = requestAnimationFrame(detectFrame);
    return () => {
      running = false;
      if (requestRef.current) { cancelAnimationFrame(requestRef.current); requestRef.current = null; }
    };
  }, [isActive, videoActive, stream, modelsLoaded, backgroundBlur, onProctorViolation, log]);

  return {
    modelsLoaded, activeWarning, proctorError,
    backgroundBlur, setBackgroundBlur,
    blurPerformanceWarning, setBlurPerformanceWarning,
    canvasRef,
  };
}
