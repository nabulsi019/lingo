// Prevents gesture flickering and controls when TTS is triggered using a frame-consistency check

export function createStabilityFilter(threshold = 12) {
  let history = []
  let lastConfirmed = null
  let cooldown = 0

  return {
    update(gesture) {
      if (cooldown > 0) { cooldown--; return null }
      if (gesture === null) return null

      history.push(gesture)
      if (history.length > 15) history.shift()

      const count = history.filter(g => g === gesture).length
      if (count >= threshold) {
        if (gesture === lastConfirmed) return null
        lastConfirmed = gesture
        cooldown = 20
        history = []
        return gesture
      }

      return null
    }
  }
}
