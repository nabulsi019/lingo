export default function SettingsPanel({ onClose, skeletonVisible, onToggleSkeleton, voiceRate, onVoiceRate }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-row">
          <span className="settings-label">Skeleton overlay</span>
          <div className={`toggle ${skeletonVisible ? 'on' : ''}`} onClick={onToggleSkeleton}>
            <div className="toggle-thumb" />
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Voice speed</span>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={voiceRate}
            onChange={e => onVoiceRate(parseFloat(e.target.value))}
            className="settings-slider"
          />
          <span className="settings-value">{voiceRate}x</span>
        </div>
      </div>
    </div>
  )
}
