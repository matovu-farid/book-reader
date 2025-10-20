import { IconButton, Tooltip, Box, CircularProgress, Alert, Snackbar } from '@mui/material'
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  SkipPrevious as PrevIcon,
  SkipNext as NextIcon,
  VolumeUp as VolumeIcon,
  Error as ErrorIcon,
  Close as CloseIcon
} from '@mui/icons-material'
import { useState } from 'react'
import { PlayingState } from '@renderer/stores/ttsStore'
import { Player } from '@renderer/models/Player'
import type { Rendition } from '@epubjs'

interface TTSControlsProps {
  bookId: string
  rendition: Rendition
  disabled?: boolean
}

export function TTSControls({ bookId, rendition, disabled = false }: TTSControlsProps) {
  // const tts = useTTS({
  //   bookId: book?.id || '',
  //   rendition: renditionState,
  //   onNavigateToPreviousPage: (playingState: PlayingState) => {
  //     // Navigate to previous page
  //     if (rendition.current) {
  //       rendition.current.prev().then(() => {
  //         if (playingState === PlayingState.Playing) {
  //           setToLastParagraphIndex()
  //         }
  //       })
  //     }
  //   },
  //   onNavigateToNextPage: () => {
  //     // Navigate to next page
  //     if (rendition.current) {
  //       rendition.current.next()
  //     }
  //   }
  // })
  const [showError, setShowError] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const error = errors.join('\n')
  const [player] = useState<Player>(new Player(rendition, bookId))
  const [playingState, setPlayingState] = useState<PlayingState>(player.getPlayingState())
  player.on('playingStateChanged', setPlayingState)

  // Show error snackbar when error occurs
  const handleErrorClose = () => {
    setShowError(false)
    // Clear error from store
    if (player) {
      player.cleanup()
    }
  }
  if (player.getErrors().length !== 0) {
    setShowError(true)
    setErrors(player.getErrors())
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

  const handleStop = () => {
    player.stop()
  }

  const handlePrev = () => {
    player.prev()
  }

  const handleNext = () => {
    player.next()
  }

  const getPlayIcon = () => {
    if (playingState === PlayingState.Loading) {
      return <CircularProgress size={24} color="inherit" />
    }
    if (playingState === PlayingState.Playing) {
      return <PauseIcon sx={{ fontSize: 24 }} />
    }
    return <PlayIcon sx={{ fontSize: 24 }} />
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
        <VolumeIcon
          sx={{
            fontSize: 20,
            color: playingState === PlayingState.Playing ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
          }}
        />

        {/* Previous Button */}
        <Tooltip title="Previous Paragraph">
          <span>
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
              <PrevIcon sx={{ fontSize: 24 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* Play/Pause Button */}
        <Tooltip
          title={
            playingState === PlayingState.Playing
              ? 'Pause'
              : playingState === PlayingState.Paused
                ? 'Resume'
                : 'Play'
          }
        >
          <span>
            <IconButton
              size="large"
              onClick={handlePlay}
              disabled={disabled}
              sx={{
                padding: 1,
                color:
                  playingState === PlayingState.Playing ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
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
          </span>
        </Tooltip>
        {/* Next Button */}
        <Tooltip title="Next Paragraph">
          <span>
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
              <NextIcon sx={{ fontSize: 24 }} />
            </IconButton>
          </span>
        </Tooltip>
        {/* Stop Button */}
        <Tooltip title="Stop">
          <span>
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
          </span>
        </Tooltip>

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
