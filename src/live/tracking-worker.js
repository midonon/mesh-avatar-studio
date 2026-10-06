// Camera frames stay in this worker. Only the face pose and timing return to the page.
self.exports = {};
self.importScripts('/mediapipe/vision_bundle.cjs');
const { FaceLandmarker, FilesetResolver } = self.exports;
let tracker, lastFrame = -Infinity, delegate = 'GPU', frames = 0, gpuSamples = 0, gpuMs = 0;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/mediapipe');
      const options = { runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true };
      try { tracker = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate } }); }
      catch {
        delegate = 'CPU';
        tracker = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate } });
      }
      self.postMessage({ type: 'ready', delegate });
      // Also wakes the ImageBitmap fallback when video frame callbacks stop in a hidden tab.
      self.setInterval(() => self.postMessage({ type: 'tick' }), 1000 / 30);
    } catch { self.postMessage({ type: 'error' }); }
  } else if (data.type === 'frame') {
    try {
      const now = performance.now();
      if (tracker && data.timestamp - lastFrame >= 1000 / 30 - 2) {
        lastFrame = data.timestamp;
        const start = performance.now(), result = tracker.detectForVideo(data.frame, now), elapsed = performance.now() - start;
        self.postMessage({ type: 'result', elapsed, result: {
          faceLandmarks: result.faceLandmarks.length ? [[]] : [],
          faceBlendshapes: result.faceBlendshapes,
          facialTransformationMatrixes: result.facialTransformationMatrixes,
        } });
        // Some worker GPU backends initialize but run too slowly. Ignore warm-up, then
        // try CPU if sustained inference alone cannot meet the 15 fps target.
        if (delegate === 'GPU' && ++frames > 5) {
          gpuMs += elapsed;
          if (++gpuSamples === 8) {
            if (gpuMs / gpuSamples > 1000 / 15) {
              await tracker.setOptions({ baseOptions: { delegate: 'CPU' } });
              delegate = 'CPU'; self.postMessage({ type: 'delegate', delegate });
            }
            gpuMs = 0; gpuSamples = 0;
          }
        }
      }
    } catch { self.postMessage({ type: 'error' }); }
    finally { data.frame.close(); self.postMessage({ type: 'consumed' }); }
  }
};
