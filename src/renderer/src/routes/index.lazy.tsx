import FileDrop from '@renderer/components/FileComponent'
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/')({
  component: Index
})

function Index(): JSX.Element {
  return (
    <div className="grid place-items-center h-screen">
      <FileDrop />
    </div>
  )
}
