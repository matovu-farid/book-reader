import { Book } from 'src/shared/types'
import XMLViewer from 'react-xml-viewer'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import Loader from './Loader'

function PageView({ book }: { book: Book }): JSX.Element {
  const { data, error, isPending, isError } = useQuery({
    queryKey: ['pageView'],
    queryFn: async () => axios.get(book.spine[book.currentBookId].route)
  })
  if (isError && error) return <div>{error.message}</div>
  if (isPending) return <Loader />
  return (
    <div>
      <XMLViewer xml={data.data} />
    </div>
  )
}

export default PageView
