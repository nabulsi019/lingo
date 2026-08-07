// Handles webcam feed and passes video frames to MediaPipe for landmark detection
import { useRef, useEffect, useState } from 'react'
import { HandLandmarker, FaceLandmarker, GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision'

export default function Camera({ onHandResults, onFaceResults, onGestureResults, showSkeleton = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const handLandmarkerRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const gestureRecognizerRef = useRef(null)
  const rafIdRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream

    async function init() {
      // 1. Start webcam
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
      } catch (err) {
        setError('Camera access denied. Please allow camera permissions and refresh.')
        return
      }

      // 2. Initialize all three models
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
        )

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        })

        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
          numFaces: 1
        })

        gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        })
        console.log('GestureRecognizer initialized:', gestureRecognizerRef.current)
      } catch (err) {
        setError('Failed to load hand tracking model.')
        return
      }

      // 3. All three models and webcam are ready
      console.log('ready')
      setReady(true)
      startLoop()
    }

    function startLoop() {
      function detect() {
        if (!rafIdRef.current) return

        const video = videoRef.current
        const handLandmarker = handLandmarkerRef.current
        const faceLandmarker = faceLandmarkerRef.current
        const gestureRecognizer = gestureRecognizerRef.current

        if (!video || !handLandmarker || !faceLandmarker || !gestureRecognizer || video.readyState < 2) {
          rafIdRef.current = requestAnimationFrame(detect)
          return
        }

        const now = performance.now()
        const handResults = handLandmarker.detectForVideo(video, now)
        const faceResults = faceLandmarker.detectForVideo(video, now)
        const gestureResults = gestureRecognizer.recognizeForVideo(video, now)

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (handResults.landmarks.length > 0) {
          onHandResults?.(handResults)

          if (showSkeleton) {
            ctx.save()
            ctx.scale(-1, 1)
            ctx.translate(-canvas.width, 0)

            const connections = [
              [0,1],[1,2],[2,3],[3,4],
              [0,5],[5,6],[6,7],[7,8],
              [0,9],[9,10],[10,11],[11,12],
              [0,13],[13,14],[14,15],[15,16],
              [0,17],[17,18],[18,19],[19,20],
              [5,9],[9,13],[13,17]
            ]

            handResults.landmarks.forEach(landmarks => {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
              ctx.lineWidth = 2
              connections.forEach(([a, b]) => {
                const lmA = landmarks[a]
                const lmB = landmarks[b]
                ctx.beginPath()
                ctx.moveTo(lmA.x * canvas.width, lmA.y * canvas.height)
                ctx.lineTo(lmB.x * canvas.width, lmB.y * canvas.height)
                ctx.stroke()
              })

              ctx.fillStyle = 'rgba(0, 255, 170, 0.9)'
              landmarks.forEach(lm => {
                ctx.beginPath()
                ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2)
                ctx.fill()
              })
            })

            ctx.restore()
          }
        }

        onFaceResults?.(faceResults)
        onGestureResults?.(gestureResults)

        rafIdRef.current = requestAnimationFrame(detect)
      }

      rafIdRef.current = requestAnimationFrame(detect)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && handLandmarkerRef.current && faceLandmarkerRef.current && gestureRecognizerRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        startLoop()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    init()

    return () => {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
      document.removeEventListener('visibilitychange', handleVisibility)
      if (stream) stream.getTracks().forEach(track => track.stop())
      handLandmarkerRef.current?.close()
      faceLandmarkerRef.current?.close()
      gestureRecognizerRef.current?.close()
    }
  }, [])

  if (error) {
    return <div className="camera-error">{error}</div>
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {!ready && (
        <div className="loading-screen">
          <div className="loading-icon">🤚</div>
          <p className="loading-text">Setting up hand tracking...</p>
          <div className="loading-bar">
            <div className="loading-bar-fill" />
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="camera-feed"
        autoPlay
        playsInline
        muted
        style={{ opacity: ready ? 1 : 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  )
}
