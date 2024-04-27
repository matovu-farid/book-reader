import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Loader from './Loader'

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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    acceptedFiles.forEach(async (file) => {
      if (file.type !== 'application/epub+zip') {
        console.error('Invalid file type')
        return
      }
      console.log({ path: file.path })
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
        books
          ? 'border-gray-500 border min-w-[100vw] min-h-[100vh] '
          : 'border-gray-500 border grid place-items-center rounded-3xl w-[50vw] h-[50vh]'
      }
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      {isDragActive && !books ? (
        <p>Drop the files here ...</p>
      ) : books ? (
        books.map((book, idx) => (
          <div className="p-2 " key={idx + book.cover}>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              className="rounded-3xl bg-transparent shadow-2xl overflow-hidden"
            >
              <img className="object-fill" src={book.cover} width={150} alt="cover image" />
            </button>

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
