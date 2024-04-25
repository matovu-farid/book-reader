import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

function FileDrop(): JSX.Element {
  const [coverImages, setCoverImages] = useState<string[]>([])

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
      ) : coverImages.length > 0 ? (
        coverImages.map((image, idx) => <img src={image} alt="cover image" key={idx + image} />)
      ) : (
        <p>Drag and drop some files here, or click to select files</p>
      )}
    </div>
  )
}

export default FileDrop
