import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Loader from './Loader'
import { Link } from '@tanstack/react-router'
import { Book } from 'src/shared/types'
import { toast } from 'react-toastify'
import { Button, IconButton } from '@mui/material'
import CancelIcon from '@mui/icons-material/Cancel'

function FileDrop(): JSX.Element {
  const queryClient = useQueryClient()
  const {
    isPending,
    error,
    data: books,
    isError
  } = useQuery({
    queryKey: ['books'],
    queryFn: () => window.functions.getBooks()
  })
  const deleteBook = useMutation({
    mutationFn: async ({ book }: { book: Book }) => {
      await window.functions.deleteBook(book.internalFolderName)
    },

    onError(error) {
      toast.error("Can't remove book")
      console.log({ error })
    },
    async onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['books'] })
    }
  })
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    acceptedFiles.forEach(async (file) => {
      if (file.type !== 'application/epub+zip') {
        console.error('Invalid file type')
        return
      }
      const coverImage = await window.functions.getCoverImage(file.path)
      if (coverImage === null) {
        console.error('Failed to get cover image')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['books'] })
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })
  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    )
  return (
    <div
      style={
        books
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gridAutoFlow: 'row'
            }
          : {}
      }
      className={
        books.length > 0
          ? ' w-full h-screen p-5  gap-[30px] place-items-baseline'
          : ' grid place-items-center gap-3 rounded-3xl w-[50vw] h-[50vh] p-5'
      }
      {...getRootProps()}
    >
      <input {...getInputProps()} className="p-5" />
      {books
        .flatMap((book) => book.assets)
        .flatMap((asset) => asset.css)
        .filter((cssObj) => cssObj !== undefined)
        .map((cssObj) => (
          <link key={cssObj.id} rel="stylesheet" href={cssObj.href} />
        ))}
      {isDragActive && !books ? (
        <p>Drop the files here ...</p>
      ) : books ? (
        books.map((book, idx) => (
          <div key={idx + book.cover} className="p-2 grid relative">
            <Button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              className="rounded-3xl  bg-transparent  "
            >
              <div className="absolute -top-3 -right-3">
                <IconButton
                  onClick={() => {
                    deleteBook.mutate({ book })
                  }}
                >
                  <CancelIcon color="secondary"></CancelIcon>
                </IconButton>
              </div>

              <Link
                to="/books/$id"
                params={{ id: book.id }}
                className="rounded-3xl bg-transparent shadow-2xl  overflow-hidden"
              >
                <img className="object-fill" src={book.cover} width={200} alt="cover image" />
              </Link>
            </Button>
            <div className="text-teal-500 justify-center p-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {book.title}
            </div>
          </div>
        ))
      ) : (
        <p>Drag and drop some files here, or click to select files</p>
      )}
    </div>
  )
}

export default FileDrop
