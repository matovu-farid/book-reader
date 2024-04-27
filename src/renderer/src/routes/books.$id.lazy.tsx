import { ArrowBack } from '@mui/icons-material'
import { Button } from '@mui/material'
import Loader from '@renderer/components/Loader'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLazyFileRoute, Link } from '@tanstack/react-router'

import PageView from '@renderer/components/PageView'

export const Route = createLazyFileRoute('/books/$id')({
  component: () => <BookView />
})

function BookView(): JSX.Element {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
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
  const mutation = useMutation({
    mutationFn: async (bookId: number) => {
      await window.functions.updateCurrentBookId(id, bookId)
      queryClient.invalidateQueries({ queryKey: ['book'] })
    }
  })

  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    )

  console.log(book)
  return (
    <div>
      <div className="flex justify-between">
        <Link to="/">
          <ArrowBack />
        </Link>
        <div className="flex gap-3">
          <Button
            disabled={book.currentBookId === 0}
            onClick={() => {
              mutation.mutate(Math.max(0, book.currentBookId - 1))
            }}
            variant="text"
            className="disabled:invisible"
          >
            Back
          </Button>
          <Button
            disabled={book.currentBookId === book.spine.length - 1}
            className="disabled:invisible"
            onClick={() => {
              mutation.mutate(Math.min(book.spine.length - 1, book.currentBookId + 1))
            }}
            variant="text"
          >
            Next
          </Button>
        </div>
      </div>

      <div>
        <PageView book={book} />
      </div>
    </div>
  )
}
