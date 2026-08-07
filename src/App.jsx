// Root component: wires together Camera, GestureDisplay, gesture classification, and speech output
import { useState, useRef, useCallback, useEffect } from 'react'
import Camera from './components/Camera.jsx'
import GestureDisplay from './components/GestureDisplay.jsx'
import GestureCreator from './components/GestureCreator.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import { createStabilityFilter } from './logic/stabilityFilter.js'
import { matchCustomGesture } from './logic/customGestureManager.js'
import { loadASLModel, classifyASL } from './logic/aslClassifier.js'
import './App.css'

// "Open_Palm" -> "Open palm"
function formatGoogleLabel(name) {
  const label = name.replace(/_/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
}

export default function App() {
  const [detectedGesture, setDetectedGesture] = useState(null)
  const [showCreator, setShowCreator] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [skeletonVisible, setSkeletonVisible] = useState(true)
  const [voiceRate, setVoiceRate] = useState(0.9)
  const [lastFiveGestures, setLastFiveGestures] = useState([])
  const filterRef = useRef(createStabilityFilter())
  const aslFilterRef = useRef(createStabilityFilter(5))
  const currentLandmarks = useRef(null)
  const customMatchCount = useRef(0)
  const lastCustomMatch = useRef(null)
  const handleGestureResultsRef = useRef(null)

  useEffect(() => {
    loadASLModel().catch(err => console.error('ASL model load failed:', err))
  }, [])

  function fire(word) {
    setDetectedGesture(null)
    setTimeout(() => {
      setDetectedGesture(word)
      speak(word)
      setLastFiveGestures(prev => [...prev.slice(-4), word])
    }, 50)
  }

  function speak(text) {
    window.speechSynthesis.cancel()
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = voiceRate
      utterance.pitch = 1.0
      utterance.volume = 1.0
      window.speechSynthesis.speak(utterance)
    }, 100)
  }

  handleGestureResultsRef.current = (results) => {
    if (!results.landmarks || results.landmarks.length === 0) {
      filterRef.current.update(null)
      aslFilterRef.current = createStabilityFilter(5)
      return
    }

    const landmarks = results.landmarks?.[0] ?? currentLandmarks.current
    if (!landmarks) return
    currentLandmarks.current = landmarks

    // Tier 1: ASL letter classifier (trained model)
    const aslResult = classifyASL(landmarks, 0.85)
    if (aslResult) {
      const confirmed = aslFilterRef.current.update(aslResult.letter)
      if (confirmed !== null) {
        const displayText = confirmed
        const spokenText = `Letter ${confirmed}`
        setDetectedGesture(displayText)
        speak(spokenText)
      }
      return
    } else {
      aslFilterRef.current.update(null)
    }

    // Tier 2: custom gesture matching
    const customMatch = matchCustomGesture(landmarks)
    if (customMatch) {
      if (customMatch !== lastCustomMatch.current) {
        customMatchCount.current++
        if (customMatchCount.current >= 5) {
          lastCustomMatch.current = customMatch
          customMatchCount.current = 0
          fire(customMatch)
        }
      }
      return
    } else {
      customMatchCount.current = 0
      lastCustomMatch.current = null
    }

    // Tier 3: MediaPipe built-in gesture recognizer — only when nothing above matched
    if (results.gestures && results.gestures.length > 0) {
      const topGesture = results.gestures[0][0]
      if (topGesture && topGesture.score >= 0.7) {
        const gestureName = topGesture.categoryName
        const confirmed = filterRef.current.update(gestureName)
        if (confirmed !== null && confirmed !== 'None') {
          fire(formatGoogleLabel(confirmed))
          return
        }
      } else {
        filterRef.current.update(null)
      }
    } else {
      filterRef.current.update(null)
    }
  }

  const handleFaceResults = useCallback((results) => {
    // Face results stored for future emotion detection
    // Will be used in V3 to affect TTS personality
  }, [])

  return (
    <div className="app">
      <Camera
        onGestureResults={(r) => handleGestureResultsRef.current(r)}
        onHandResults={(r) => { currentLandmarks.current = r.landmarks?.[0] }}
        onFaceResults={handleFaceResults}
        showSkeleton={skeletonVisible}
      />
      <div className="bottom-area">
        <GestureDisplay gesture={detectedGesture} history={lastFiveGestures} />
        <div className="bottom-nav">
          <button className="nav-btn" onClick={() => setShowSettings(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
          <button className="nav-btn" onClick={() => setShowCreator(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {showCreator && (
        <GestureCreator
          currentLandmarks={currentLandmarks}
          onClose={() => setShowCreator(false)}
        />
      )}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          skeletonVisible={skeletonVisible}
          onToggleSkeleton={() => setSkeletonVisible(v => !v)}
          voiceRate={voiceRate}
          onVoiceRate={setVoiceRate}
        />
      )}
    </div>
  )
}
