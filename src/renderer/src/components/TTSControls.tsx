import {
  IconButton,
  Tooltip,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material'
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
import type { TTSControls as TTSControlsType } from '../hooks/useTTS'

interface TTSControlsProps {
  tts: TTSControlsType
  disabled?: boolean
}

export function TTSControls({ tts, disabled = false }: TTSControlsProps) {
  const { state } = tts
  const { isPlaying, isPaused, currentParagraphIndex, paragraphs, isLoading, hasApiKey, error } =
    state
  const [showError, setShowError] = useState(false)

  // Show error snackbar when error occurs
  const handleErrorClose = () => {
    setShowError(false)
    // Clear error from store
    tts.state.error && tts.state.error === error && setShowError(false)
  }

  // Show error when it changes
  if (error && !showError) {
    setShowError(true)
  }

  // Don't render if no API key or no paragraphs
  if (!hasApiKey || paragraphs.length === 0) {
    return null
  }

  const handlePlay = () => {
    if (isPlaying && isPaused) {
      tts.resume()
    } else if (isPlaying) {
      tts.pause()
    } else {
      tts.play()
    }
  }

  const handleStop = () => {
    tts.stop()
  }

  const handlePrev = () => {
    tts.prev()
  }

  const handleNext = () => {
    tts.next()
  }

  const getPlayIcon = () => {
    if (isLoading) {
      return <CircularProgress size={24} color="inherit" />
    }
    if (isPlaying && !isPaused) {
      return <PauseIcon sx={{ fontSize: 24 }} />
    }
    return <PlayIcon sx={{ fontSize: 24 }} />
  }

  const progressText =
    paragraphs.length > 0 ? `${currentParagraphIndex + 1} / ${paragraphs.length}` : '0 / 0'

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
            color: isPlaying ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
          }}
        />

        {/* Previous Button */}
        <Tooltip title="Previous Paragraph">
          <span>
            <IconButton
              size="large"
              onClick={handlePrev}
              disabled={disabled || isLoading}
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
          title={isPlaying && !isPaused ? 'Pause' : isPlaying && isPaused ? 'Resume' : 'Play'}
        >
          <span>
            <IconButton
              size="large"
              onClick={handlePlay}
              disabled={disabled}
              sx={{
                padding: 1,
                color: isPlaying ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
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

        {/* Stop Button */}
        <Tooltip title="Stop">
          <span>
            <IconButton
              size="large"
              onClick={handleStop}
              disabled={disabled || !isPlaying}
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

        {/* Next Button */}
        <Tooltip title="Next Paragraph">
          <span>
            <IconButton
              size="large"
              onClick={handleNext}
              disabled={disabled || isLoading}
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

        {/* Progress Indicator */}
        <Typography
          variant="caption"
          sx={{
            fontSize: 14,
            color: 'rgba(255, 255, 255, 0.8)',
            minWidth: '50px',
            textAlign: 'center',
            fontWeight: 500
          }}
        >
          {progressText}
        </Typography>

        {/* Error Icon (if there's an error) */}
        {error && (
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
