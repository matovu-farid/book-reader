import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Loader from './Loader'

function FileDrop(): JSX.Element {
  const [coverImages, setCoverImages] = useState<string[]>([])
  const queryClient = useQueryClient()
  const {
    isPending,
    error,
    data: books,
    isError
  } = useQuery({
    queryKey: ['books'],
    queryFn: () => window.functions.getBooks()
  }) // const bookQuery = useQuery(['books'], async () => {})

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
  console.log({ books })
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
      <input
        // className="border-gray-500 border rounded-3xl w-[50vw] h-[50vh]"
        {...getInputProps()}
      />
      {isDragActive && !books ? (
        <p>Drop the files here ...</p>
      ) : books ? (
        books
          .map((book) => book.cover)
          .map((image, idx) => (
            <div className=" p-2" key={idx + image}>
              <div className="rounded-3xl shadow-2xl overflow-hidden">
                <img className="object-fill" src={image} width={150} alt="cover image" />
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
