import { useState, useRef } from 'react'
import { saveCustomGesture, loadCustomGestures, deleteCustomGesture } from '../logic/customGestureManager'

export default function GestureCreator({ currentLandmarks, onClose }) {
  const [word, setWord] = useState('')
  const [status, setStatus] = useState('idle') // idle | countdown | saved | error
  const [countdown, setCountdown] = useState(3)
  const [savedGestures, setSavedGestures] = useState(loadCustomGestures())
  const timerRef = useRef(null)

  function startRecording() {
    if (!word.trim()) { setStatus('error'); return }
    setStatus('countdown')
    setCountdown(3)
    let count = 3
    timerRef.current = setInterval(() => {
      count--
      setCountdown(count)
      if (count === 0) {
        clearInterval(timerRef.current)
        if (currentLandmarks.current && currentLandmarks.current.length === 21) {
          saveCustomGesture(word.trim().toLowerCase(), currentLandmarks.current)
          setSavedGestures(loadCustomGestures())
          setStatus('saved')
          setWord('')
        } else {
          setStatus('error')
        }
        setTimeout(() => setStatus('idle'), 2000)
      }
    }, 1000)
  }

  function handleDelete(w) {
    deleteCustomGesture(w)
    setSavedGestures(loadCustomGestures())
  }

  return (
    <div className="creator-overlay">
      <div className="creator-panel">
        <button className="creator-close" onClick={onClose}>✕</button>
        <h2 className="creator-title">Create gesture</h2>
        <p className="creator-subtitle">Type a word, hold your gesture, and press record.</p>

        <input
          className="creator-input"
          type="text"
          placeholder="e.g. chuzz, hello, stop"
          value={word}
          onChange={e => setWord(e.target.value)}
          maxLength={20}
        />

        <button
          className="creator-btn"
          onClick={startRecording}
          disabled={status === 'countdown'}
        >
          {status === 'countdown' ? `Hold still... ${countdown}` : 'Record gesture'}
        </button>

        {status === 'saved' && <p className="creator-feedback success">Gesture saved!</p>}
        {status === 'error' && <p className="creator-feedback error">No hand detected or no word entered.</p>}

        {savedGestures.length > 0 && (
          <div className="creator-saved">
            <p className="creator-saved-title">Your gestures</p>
            {savedGestures.map(g => (
              <div key={g.word} className="creator-saved-item">
                <span>{g.word}</span>
                <button onClick={() => handleDelete(g.word)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
