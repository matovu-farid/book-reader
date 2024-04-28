import ListIcon from '@mui/icons-material/List'
import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, Link } from '@tanstack/react-router'
import { IReactReaderStyle, ReactReader, ReactReaderStyle } from 'react-reader'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Book } from 'src/shared/types'
import { useEffect, useRef, useState } from 'react'
import { Button, FormControlLabel, IconButton, Radio, RadioGroup } from '@mui/material'
import { Rendition } from 'epubjs'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { usePopupState, bindTrigger, bindMenu } from 'material-ui-popup-state/hooks'
import { Label } from '@mui/icons-material'

export const Route = createLazyFileRoute('/books/$id')({
  component: () => <BookView />
})

type ITheme = 'light' | 'dark'

const darkColor = 'rgb(48 48 50)'
const darkTextColor = 'rgb(184 184 185)'
const lightColor = 'rgb(246 240 226)'
const lightTextColor = 'rgb(43 42 40)'

function updateTheme(rendition: Rendition, theme: ITheme) {
  const themes = rendition.themes

  switch (theme) {
    case 'dark': {
      themes.override('color', darkTextColor)
      themes.override('background', darkColor)
      themes.override('font-size', '1.2em')

      break
    }
    case 'light': {
      themes.override('color', lightTextColor)
      themes.override('background', lightColor)
      themes.override('font-size', '1.2em')
      break
    }
  }
}

function BookView(): JSX.Element {
  const { id } = Route.useParams()
  const rendition = useRef<Rendition | undefined>(undefined)
  const [theme, setTheme] = useState<ITheme>('dark')
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

  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    )

  //   console.log(book)
  return (
    <div className="relative">
      <div className="absolute right-10 top-10 z-10">
        <Link to="/">
          <Button disabled={book.currentBookId === 0} variant="text" className="disabled:invisible">
            Back
          </Button>
        </Link>
        <IconButton {...bindTrigger(popupState)}>
          <ListIcon color="primary" />
        </IconButton>
        <Menu {...bindMenu(popupState)}>
          <RadioGroup
            aria-labelledby="demo-radio-buttons-group-label"
            defaultValue={theme}
            name="radio-buttons-group"
            sx={{ padding: '10px' }}
            onChange={(e) => {
              setTheme(e.target.value as ITheme)
              popupState.close()
            }}
          >
            <FormControlLabel value="light" control={<Radio />} label="light" />
            <FormControlLabel value="dark" control={<Radio />} label="dark" />
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
          readerStyles={theme === 'dark' ? darkReaderTheme : lightReaderTheme}
          getRendition={(_rendition) => {
            updateTheme(_rendition, theme)
            rendition.current = _rendition
          }}
          epubInitOptions={{
            openAs: 'epub'
          }}
        />
      </div>
    </div>
  )
}
const lightReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  readerArea: {
    ...ReactReaderStyle.readerArea,
    background: lightColor
  },
  tocArea: {
    ...ReactReaderStyle.tocArea,
    background: lightColor
  },
  arrow: {
    ...ReactReaderStyle.arrow,
    // color: 'rgb(246 240 226)'
    color: 'rgb(99 97 92)',
    background: 'rgb(220 216 205)',
    padding: '0px 5px',
    borderRadius: '10px',
    opacity: '0.3'
  },
  arrowHover: {
    ...ReactReaderStyle.arrowHover,
    ...ReactReaderStyle.arrow,
    color: 'rgb(99 97 92)',
    padding: '10px',
    visibility: 'visible',
    opacity: '1'
    // background: 'rgb(220 216 205)'
  }
}

const darkReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  arrow: {
    ...ReactReaderStyle.arrow,
    color: darkTextColor
  },
  arrowHover: {
    ...ReactReaderStyle.arrowHover,
    color: darkTextColor
  },
  readerArea: {
    ...ReactReaderStyle.readerArea,
    backgroundColor: darkColor
  },
  titleArea: {
    ...ReactReaderStyle.titleArea,
    color: darkColor
  },
  tocArea: {
    ...ReactReaderStyle.tocArea,
    background: darkColor
  },
  tocButtonExpanded: {
    ...ReactReaderStyle.tocButtonExpanded,
    background: '#222'
  },
  tocButtonBar: {
    ...ReactReaderStyle.tocButtonBar,
    background: '#fff'
  },
  tocButton: {
    ...ReactReaderStyle.tocButton,
    color: 'white'
  },
  toc: {
    ...ReactReaderStyle.toc,
    color: 'white'
  }
}
