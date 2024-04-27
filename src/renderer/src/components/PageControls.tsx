import { Button } from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Book } from 'src/shared/types'

const PageControls = ({ book }: { book: Book }): JSX.Element => {
  const queryClient = useQueryClient()
  const updateBookId = useMutation({
    mutationFn: async (bookId: number) => {
      await window.functions.updateCurrentBookId(book.internalFolderName, bookId)
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
  

  return (
    <div className="flex gap-3">
      <Button
        disabled={book.currentBookId === 0}
        onClick={() => {
          updateBookId.mutate(Math.max(0, book.currentBookId - 1))
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
          updateBookId.mutate(Math.min(book.spine.length - 1, book.currentBookId + 1))
        }}
        variant="text"
      >
        Next
      </Button>
    </div>
  )
}

export default PageControls
