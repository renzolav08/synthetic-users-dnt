export function beep(tipo: 'inicio' | 'fin') {
  try {
    const ctx = new AudioContext()
    const play = () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (tipo === 'inicio') {
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.12)
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.15)
      } else {
        osc.frequency.setValueAtTime(800, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.18)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.2)
      }
      osc.onended = () => ctx.close()
    }
    // resume() por si el contexto arranca suspendido (política de autoplay)
    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {})
    } else {
      play()
    }
  } catch {
    // AudioContext no disponible
  }
}
