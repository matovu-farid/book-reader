import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import ErrorIcon from '@mui/icons-material/Error'
import CloseIcon from '@mui/icons-material/Close'
import BugReportIcon from '@mui/icons-material/BugReport'
import { useEffect, useState } from 'react'
import { PlayingState } from '@renderer/stores/ttsStore'
import { Player, PlayerEvent } from '@renderer/models/Player'
import type { Rendition } from '@epubjs'
import { useDebug } from '@renderer/hooks/useDebug'
interface TTSControlsProps {
  bookId: string
  rendition: Rendition
  disabled?: boolean
}

export function TTSControls({ bookId, rendition, disabled = false }: TTSControlsProps) {
  const [showError, setShowError] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [hasShownError, setHasShownError] = useState(false)

  const error = errors.join('\n')
  const [player] = useState<Player>(new Player(rendition, bookId))
  const [playingState, setPlayingState] = useState<PlayingState>(player.getPlayingState())
  const { setIsDebugging, shouldDebug } = useDebug(player)

  useEffect(() => {
    player.on(PlayerEvent.PLAYING_STATE_CHANGED, setPlayingState)
  }, [player])

  // Check for errors using setTimeout to avoid cascading renders
  useEffect(() => {
    const checkForErrors = () => {
      const currentErrors = player.getErrors()
      if (currentErrors.length !== 0 && !hasShownError) {
        setShowError(true)
        setErrors(currentErrors)
        setHasShownError(true)
      } else if (currentErrors.length === 0 && hasShownError) {
        setHasShownError(false)
      }
    }

    // Use setTimeout to defer the state update
    const timeoutId = setTimeout(checkForErrors, 0)
    return () => clearTimeout(timeoutId)
  }, [player, hasShownError])

  // Show error snackbar when error occurs
  const handleErrorClose = () => {
    setShowError(false)
    // Clear error from store
    if (player) {
      player.cleanup()
    }
  }

  const handlePlay = () => {
    if (playingState === PlayingState.Playing) {
      player.pause()
      return
    }
    if (playingState === PlayingState.Paused) {
      player.resume()
      return
    }
    return player.play()
  }

  const handleStop = async () => {
    await player.stop()
  }

  const handlePrev = async () => {
    await player.prev()
  }

  const handleNext = async () => {
    await player.next()
  }

  const getPlayIcon = () => {
    if (playingState === PlayingState.Loading) {
      return <CircularProgress size={24} color="inherit" />
    }
    if (playingState === PlayingState.Playing) {
      return <PauseIcon sx={{ fontSize: 24 }} />
    }
    return <PlayArrowIcon sx={{ fontSize: 24 }} />
  }

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '12px 24px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '24px',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Volume Icon */}
        <VolumeUpIcon
          sx={{
            fontSize: 20,
            color: playingState === PlayingState.Playing ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
          }}
        />

        {/* Previous Button */}

        <IconButton
          size="large"
          onClick={handlePrev}
          disabled={disabled || playingState === PlayingState.Loading}
          sx={{
            padding: 1,
            color: '#ffffff',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '&:disabled': {
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          <SkipPreviousIcon sx={{ fontSize: 24 }} />
        </IconButton>

        {/* Play/Pause Button */}

        <IconButton
          size="large"
          onClick={handlePlay}
          disabled={disabled}
          sx={{
            padding: 1,
            color: playingState === PlayingState.Playing ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '&:disabled': {
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          {getPlayIcon()}
        </IconButton>

        {/* Next Button */}

        <IconButton
          size="large"
          onClick={handleNext}
          disabled={disabled || playingState === PlayingState.Loading}
          sx={{
            padding: 1,
            color: '#ffffff',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '&:disabled': {
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          <SkipNextIcon sx={{ fontSize: 24 }} />
        </IconButton>

        {/* Stop Button */}

        <IconButton
          size="large"
          onClick={handleStop}
          disabled={disabled || playingState !== PlayingState.Playing}
          sx={{
            padding: 1,
            color: '#ffffff',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '&:disabled': {
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          <StopIcon sx={{ fontSize: 24 }} />
        </IconButton>

        {/* Debug Button */}
        {shouldDebug && (
          <IconButton
            size="large"
            onClick={() => setIsDebugging((isDebugging) => !isDebugging)}
            disabled={disabled || playingState !== PlayingState.Playing}
            sx={{
              padding: 1,
              color: '#ffffff',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              },
              '&:disabled': {
                color: 'rgba(255, 255, 255, 0.3)'
              }
            }}
          >
            <BugReportIcon sx={{ fontSize: 24 }} />
          </IconButton>
        )}

        {/* Error Icon (if there's an error) */}
        {errors.length > 0 && (
          <ErrorIcon
            sx={{
              fontSize: 20,
              color: '#ff6b6b'
            }}
          />
        )}
      </Box>

      {/* Error Snackbar */}
      <Snackbar
        open={showError && !!error}
        autoHideDuration={6000}
        onClose={handleErrorClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={handleErrorClose}
          severity="error"
          sx={{ width: '100%' }}
          action={
            <IconButton size="small" aria-label="close" color="inherit" onClick={handleErrorClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  )
}
