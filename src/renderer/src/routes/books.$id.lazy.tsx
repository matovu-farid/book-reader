import { ArrowBack } from '@mui/icons-material'
import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, Link } from '@tanstack/react-router'

import PageView from '@renderer/components/PageView'
import PageControls from '@renderer/components/PageControls'

export const Route = createLazyFileRoute('/books/$id')({
  component: () => <BookView />
})

function BookView(): JSX.Element {
  const { id } = Route.useParams()
  const {
    isPending,
    error,
    data: book,
    isError
  } = useQuery({
    queryKey: ['book'],
    queryFn: async () => {
      const books = await window.functions.getBooks()
      const book = books.find((book) => book.id === id) || {
        id: '',
        title: '',
        cover: '',
        spine: [],
        internalFolderName: '',
        currentBookId: 0
      }

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

      <div>
        <PageView book={book} />
      </div>
    </div>
  )
}
