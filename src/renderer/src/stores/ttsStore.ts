import { create } from 'zustand'
import type { ParagraphWithCFI } from '../../../shared/types'

interface TTSState {
  // Playback control
  isPlaying: boolean
  isPaused: boolean
  isLoading: boolean
  hasApiKey: boolean

  // Navigation state
  currentParagraphIndex: number
  paragraphs: ParagraphWithCFI[]

  // Book context
  currentBookId: string
  currentPage: string // CFI of current page

  // Cache management
  audioCache: Map<string, string>

  // Error handling
  error: string | null

  // Actions with proper error handling
  setPlaying: (playing: boolean) => void
  setPaused: (paused: boolean) => void
  setLoading: (loading: boolean) => void
  setHasApiKey: (hasKey: boolean) => void
  setError: (error: string | null) => void
  setCurrentParagraphIndex: (index: number) => void
  setParagraphs: (paragraphs: ParagraphWithCFI[]) => void
  setCurrentBookId: (bookId: string) => void
  setCurrentPage: (page: string) => void
  addToAudioCache: (cfiRange: string, audioPath: string) => void
  removeFromAudioCache: (cfiRange: string) => void
  reset: () => void // Clear all state
}

export const useTTSStore = create<TTSState>((set, get) => ({
  // Initial state
  isPlaying: false,
  isPaused: false,
  isLoading: false,
  hasApiKey: false,
  currentParagraphIndex: 0,
  paragraphs: [],
  currentBookId: '',
  currentPage: '',
  audioCache: new Map(),
  error: null,

  // Actions
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPaused: (paused) => set({ isPaused: paused }),
  setLoading: (loading) => set({ isLoading: loading }),
  setHasApiKey: (hasKey) => set({ hasApiKey: hasKey }),
  setError: (error) => set({ error }),

  setCurrentParagraphIndex: (index) => {
    const state = get()
    if (index >= 0 && index < state.paragraphs.length) {
      set({ currentParagraphIndex: index })
    } else {
      console.warn(
        `Invalid paragraph index ${index}. Valid range: 0-${state.paragraphs.length - 1}`
      )
    }
  },

  setParagraphs: (paragraphs) =>
    set({
      paragraphs: [...paragraphs], // Create a shallow copy
      currentParagraphIndex: 0,
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      error: null
    }),

  setCurrentBookId: (bookId) => {
    const state = get()
    if (state.currentBookId !== bookId) {
      // Clear cache when switching books
      set({
        currentBookId: bookId,
        audioCache: new Map(),
        currentParagraphIndex: 0,
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        error: null
      })
    }
  },

  setCurrentPage: (page) => {
    const state = get()
    if (state.currentPage !== page) {
      set({ currentPage: page })
    }
  },

  addToAudioCache: (cfiRange, audioPath) => {
    const newCache = new Map(get().audioCache)
    newCache.set(cfiRange, audioPath)
    set({ audioCache: newCache })
  },

  removeFromAudioCache: (cfiRange) => {
    const newCache = new Map(get().audioCache)
    newCache.delete(cfiRange)
    set({ audioCache: newCache })
  },

  reset: () =>
    set({
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      currentParagraphIndex: 0,
      currentBookId: '',
      currentPage: '',
      audioCache: new Map(),
      error: null
    })
}))
