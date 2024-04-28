import { ArrowBack } from '@mui/icons-material'
import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, Link } from '@tanstack/react-router'
import { ReactReader } from 'react-reader'
import PageView from '@renderer/components/PageView'
import PageControls from '@renderer/components/PageControls'
import { useState } from 'react'

export const Route = createLazyFileRoute('/books/$id')({
  component: () => <BookView />
})

function BookView(): JSX.Element {
  const { id } = Route.useParams()
  const [location, setLocation] = useState<string | number>(0)
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

  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    )

  //   console.log(book)
  return (
    <div>
      <div className="flex justify-between">
        <Link to="/">
          <ArrowBack />
        </Link>
        <PageControls book={book} />
      </div>

      <div style={{ height: '100vh' }}>
        <ReactReader
          url={book.epubUrl}
          location={location}
          locationChanged={(epubcfi: string) => {
            console.log({ epubcfi })
            setLocation(epubcfi)
          }}
          swipeable={true}
        />
      </div>
    </div>
  )
}
