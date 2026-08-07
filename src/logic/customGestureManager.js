const STORAGE_KEY = 'mylingo_custom_gestures'

function normalizeLandmarks(landmarks) {
  const wrist = landmarks[0]
  const middleBase = landmarks[9]

  const scale = Math.sqrt(
    Math.pow(middleBase.x - wrist.x, 2) +
    Math.pow(middleBase.y - wrist.y, 2)
  )

  if (scale < 1e-6) return null

  return landmarks.map(lm => ({
    x: (lm.x - wrist.x) / scale,
    y: (lm.y - wrist.y) / scale,
  }))
}

export function saveCustomGesture(word, landmarks) {
  const normalized = normalizeLandmarks(landmarks)
  if (normalized === null) return false
  const existing = loadCustomGestures()
  const updated = [...existing.filter(g => g.word !== word), { word, landmarks: normalized }]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return true
}

export function loadCustomGestures() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

export function deleteCustomGesture(word) {
  const updated = loadCustomGestures().filter(g => g.word !== word)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function matchCustomGesture(liveLandmarks, threshold = 0.10) {
  const customs = loadCustomGestures()
  if (customs.length === 0) return null
  const normalized = normalizeLandmarks(liveLandmarks)
  if (normalized === null) return null
  let bestMatch = null
  let bestScore = Infinity
  customs.forEach(({ word, landmarks }) => {
    const score = landmarks.reduce((sum, lm, i) => {
      const dx = lm.x - normalized[i].x
      const dy = lm.y - normalized[i].y
      return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0) / landmarks.length
    if (score < bestScore) {
      bestScore = score
      bestMatch = { word, score }
    }
  })
  return bestScore < threshold ? bestMatch.word : null
}
