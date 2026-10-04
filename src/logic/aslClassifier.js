import * as tf from '@tensorflow/tfjs'

let model = null
let labelMap = null

// MUST stay bit-for-bit equivalent to normalize_landmarks() in
// ~/Desktop/mylingo-ml/train.py — the model silently predicts nonsense
// if the two diverge.
function normalizeLandmarks(lms) {
  const wrist = lms[0]
  const midBase = lms[9]
  const scale = Math.sqrt(
    (midBase.x - wrist.x) ** 2 +
    (midBase.y - wrist.y) ** 2
  )
  if (scale < 1e-6) return null
  const out = []
  for (const lm of lms) {
    out.push(
      (lm.x - wrist.x) / scale,
      (lm.y - wrist.y) / scale,
      (lm.z - wrist.z) / scale,
    )
  }
  return out
}

export async function loadASLModel() {
  const [loadedModel, labelsRes] = await Promise.all([
    tf.loadGraphModel('/asl_model/model.json'),
    fetch('/asl_model/labels.json').then(r => r.json())
  ])
  model = loadedModel
  labelMap = labelsRes
  console.log('ASL model loaded, labels:', labelMap)
}

export function classifyASL(landmarks, threshold = 0.7) {
  if (!model || !landmarks || landmarks.length !== 21) return null

  const input = normalizeLandmarks(landmarks)
  if (input === null) return null

  const tensor = tf.tensor2d([input], [1, 63])
  const prediction = model.predict(tensor)
  const scores = prediction.dataSync()
  tensor.dispose()
  prediction.dispose()

  let bestIdx = 0
  let bestScore = 0
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i]
      bestIdx = i
    }
  }

  if (bestScore < threshold) return null
  return { letter: labelMap[String(bestIdx)], score: bestScore }
}
