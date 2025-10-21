import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => <RootComponent />
})

function RootComponent(): JSX.Element {
  const {
    isPending,
    error,
    data: books,
    isError
  } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      // Wait for Electron context to be ready
      let retries = 0
      const maxRetries = 10

      while (retries < maxRetries) {
        if (window.functions?.getBooks) {
          return await window.functions.getBooks()
        }

        // Wait 100ms before retrying
        await new Promise((resolve) => setTimeout(resolve, 100))
        retries++
      }

      throw new Error('Electron functions not available after retries')
    },
    retry: 3,
    retryDelay: 1000
  })

  if (isError)
    return <div className="w-full h-screen place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-screen place-items-center grid">
        <Loader />
      </div>
    )

  return (
    <>
      {/* <GlobalFonts /> */}
      {books
        .flatMap((book) => book.assets)
        .flatMap((asset) => asset.css)
        .filter((cssObj) => cssObj !== undefined)
        .map((cssObj) => cssObj && <link key={cssObj.id} rel="stylesheet" href={cssObj.href} />)}

      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
