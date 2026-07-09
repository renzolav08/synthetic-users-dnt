'use client'

interface Props {
  level: number   // 0–100
  grabando: boolean
  transcribiendo?: boolean
}

export function MicAudioBar({ level, grabando, transcribiendo }: Props) {
  if (!grabando && !transcribiendo) return null

  if (transcribiendo) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800/80">
        <span className="text-xs text-gray-400 animate-pulse">Transcribiendo...</span>
      </div>
    )
  }

  const bars = 5
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800/80">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i / bars) * 100
        const active = level > threshold
        return (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-75"
            style={{
              height: `${8 + i * 3}px`,
              backgroundColor: active ? '#3b82f6' : '#374151',
              opacity: active ? 1 : 0.4,
            }}
          />
        )
      })}
      <span className="text-xs text-gray-400 ml-1">Escuchando...</span>
    </div>
  )
}
