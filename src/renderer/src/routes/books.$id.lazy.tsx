import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, Link } from '@tanstack/react-router'
import { ReactReader } from '@renderer/components/react-reader'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Book } from 'src/shared/types'
import { useEffect, useRef, useState } from 'react'
import { Button, FormControlLabel, IconButton, Radio, RadioGroup } from '@mui/material'
import { Rendition } from '@epubjs'
import Menu from '@mui/material/Menu'
import { usePopupState, bindTrigger, bindMenu } from 'material-ui-popup-state/hooks'
import { ThemeType } from '@renderer/themes/common'
import { themes } from '@renderer/themes/themes'
import createIReactReaderTheme from '@renderer/themes/readerThemes'
import { ThemeProvider, THEME_ID, createTheme } from '@mui/material/styles'
import PaletteIcon from '@mui/icons-material/Palette'
import { TTSControls } from '@renderer/components/TTSControls'

export const Route = createLazyFileRoute('/books/$id')({
  component: () => <BookView />
})

function updateTheme(rendition: Rendition, theme: ThemeType) {
  const reditionThemes = rendition.themes
  reditionThemes.override('color', themes[theme].color)
  reditionThemes.override('background', themes[theme].background)
  reditionThemes.override('font-size', '1.2em')
}

function BookView(): JSX.Element {
  const { id } = Route.useParams()
  const rendition = useRef<Rendition | undefined>(undefined)
  const [renditionState, setRenditionState] = useState<Rendition | null>(null)
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White)
  const popupState = usePopupState({ variant: 'popover', popupId: 'demoMenu' })
  useEffect(() => {
    if (rendition.current) {
      updateTheme(rendition.current, theme)
    }
  }, [theme])
  const {
    isPending,
    error,
    data: book,
    isError
  } = useQuery({
    queryKey: ['book'],
    queryFn: async () => {
      const books = await window.functions.getBooks()
      const book = books.find((book) => book.id === id)
      if (!book) throw new Error('Book not found')

      return book
    }
  })
  const materialTheme = createTheme({
    palette: {
      primary: {
        main: themes[theme].color,
        contrastText: themes[theme].background
      }
    },
    components: {
      MuiMenu: {
        styleOverrides: {
          list: {
            '&[role="menu"]': {
              backgroundColor: themes[theme].background,
              color: themes[theme].color
            }
          }
        }
      }
    }
  })
  const queryClient = useQueryClient()
  const updateBookId = useMutation({
    mutationFn: async ({ book, newId }: { book: Book; newId: string }) => {
      await window.functions.updateCurrentBookId(book.internalFolderName, newId)
    },

    onError(error) {
      toast.error('Can not change book page')
      console.log({ error })
    },
    async onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['book'] })
      queryClient.invalidateQueries({ queryKey: ['pageView'] })
    }
  })

  // TTS hook - use state variable instead of ref
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

  // Update rendition state when ref becomes available
  useEffect(() => {
    if (rendition.current && !renditionState) {
      setRenditionState(rendition.current)
    }
  }, [renditionState])

  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    )

  return (
    <ThemeProvider theme={{ [THEME_ID]: materialTheme }}>
      <div className="relative">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
          <Link to="/">
            <Button
              disabled={book.currentBookId === 0}
              variant="text"
              className="disabled:invisible"
            >
              Back
            </Button>
          </Link>

          <IconButton {...bindTrigger(popupState)}>
            <PaletteIcon color="primary" />
          </IconButton>
          <Menu {...bindMenu(popupState)}>
            <RadioGroup
              aria-labelledby="demo-radio-buttons-group-label"
              defaultValue={theme}
              name="radio-buttons-group"
              sx={{ padding: '10px' }}
              onChange={(e) => {
                setTheme(e.target.value as ThemeType)
                popupState.close()
              }}
            >
              {(Object.keys(themes) as Array<keyof typeof themes>).map((theme) => (
                <FormControlLabel key={theme} value={theme} control={<Radio />} label={theme} />
              ))}
            </RadioGroup>
          </Menu>
        </div>

        <div style={{ height: '100vh' }}>
          <ReactReader
            loadingView={
              <div className="w-full h-screen grid items-center">
                <Loader />
              </div>
            }
            url={book.epubUrl}
            title={book.title}
            location={book.currentBookId || 0}
            locationChanged={(epubcfi: string) => {
              updateBookId.mutate({ book, newId: epubcfi })
            }}
            swipeable={true}
            readerStyles={createIReactReaderTheme(themes[theme].readerTheme)}
            getRendition={(_rendition) => {
              updateTheme(_rendition, theme)
              rendition.current = _rendition
              setRenditionState(_rendition)
            }}
          />
        </div>

        {/* TTS Controls - Bottom Center */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
          {renditionState && <TTSControls bookId={book.id} rendition={renditionState} />}
        </div>
      </div>
    </ThemeProvider>
  )
}
