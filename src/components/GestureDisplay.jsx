// Shows the confirmed detected gesture as large text on screen
import { useState, useEffect } from 'react'

export default function GestureDisplay({ gesture, history = [] }) {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [showIcon, setShowIcon] = useState(true)

  useEffect(() => {
    if (!gesture) return
    setVisible(true)
    setFading(false)
    setShowIcon(false)
    const fadeOutTimer = setTimeout(() => {
      setFading(true)
      setTimeout(() => {
        setVisible(false)
        setTimeout(() => setShowIcon(true), 400)
      }, 400)
    }, 2500)
    return () => clearTimeout(fadeOutTimer)
  }, [gesture])

  return (
    <div className="gesture-display">
      {history.length > 0 && (
        <div className="gesture-history">
          {history.slice().reverse().slice(1).map((g, i) => (
            <span key={i} className="history-pill" style={{ opacity: 0.5 - i * 0.1 }}>{g}</span>
          ))}
        </div>
      )}
      {showIcon && !visible && (
        <span className="gesture-icon">🤚</span>
      )}
      {visible && gesture && (
        <span className={`gesture-name ${fading ? 'gesture-fade-out' : 'gesture-fade-in'}`} key={gesture}>
          {gesture}
        </span>
      )}
    </div>
  )
}
