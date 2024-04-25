import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'

function FileDrop(): JSX.Element {
  const [coverImages, setCoverImages] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: fetchImages,
    onSuccess: (data) => {
      setImageUrls(data)
    }
  })

  useEffect(() => {
    mutation.mutate()
  }, [coverImages])

  const onDrop = useCallback(async (acceptedFiles) => {
    // Do something with the files
    if (acceptedFiles.length === 0) {
      return
    }
    const file: File = acceptedFiles[0]
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
    setCoverImages((prev) => [...prev, coverImage])
  }, [])

  async function fetchImages(): Promise<string[]> {
    return await Promise.all(
      coverImages.map(async (imagePath) => {
        const response = await fetch(`file://${imagePath}`)
        const blob = await response.blob()
        return URL.createObjectURL(blob)
      })
    )
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div
      className="border-gray-500 border grid place-items-center rounded-3xl w-[50vw] h-[50vh]"
      {...getRootProps()}
    >
      <input
        // className="border-gray-500 border rounded-3xl w-[50vw] h-[50vh]"
        {...getInputProps()}
      />
      {isDragActive ? (
        <p>Drop the files here ...</p>
      ) : imageUrls.length > 0 ? (
        imageUrls.map((image, idx) => <img src={image} alt="cover image" key={idx + image} />)
      ) : (
        <p>Drag and drop some files here, or click to select files</p>
      )}
    </div>
  )
}

export default FileDrop
