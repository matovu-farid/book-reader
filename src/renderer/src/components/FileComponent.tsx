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
  const hasData = coverImages.length > 0

  return (
    <div
      style={
        hasData
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gridAutoFlow: 'row'
            }
          : {}
      }
      className={
        hasData
          ? 'border-gray-500 border min-w-[100vw] min-h-[100vh] '
          : 'border-gray-500 border grid place-items-center rounded-3xl w-[50vw] h-[50vh]'
      }
      {...getRootProps()}
    >
      <input
        // className="border-gray-500 border rounded-3xl w-[50vw] h-[50vh]"
        {...getInputProps()}
      />
      {isDragActive && !hasData ? (
        <p>Drop the files here ...</p>
      ) : hasData ? (
        coverImages.map((image, idx) => (
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
