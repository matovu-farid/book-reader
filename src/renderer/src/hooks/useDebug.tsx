import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Player } from '@renderer/models/Player'

export const useDebug = (player: Player) => {
  const debugPlayingState = useRef<string[]>([])
  const [isDebugging, setIsDebugging] = useState(false)
  const [shouldDebug, setShouldDebug] = useState(false)

  const onPlayingStateChanged = useEffectEvent(async () => {
    player.on('playingStateChanged', (state) => {
      window.functions.shouldDebug().then((shouldDebugPlayer) => {
        setShouldDebug(shouldDebugPlayer)
        if (shouldDebugPlayer) {
          debugPlayingState.current.push(state)
        }
      })
    })
  })

  useEffect(() => {
    onPlayingStateChanged()
  }, [])
  useEffect(() => {
    if (isDebugging) return
    console.log(debugPlayingState.current.join('->'))
  }, [isDebugging])
  return {
    isDebugging,
    setIsDebugging,
    shouldDebug
  }
}
