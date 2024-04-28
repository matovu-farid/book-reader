import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

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
    queryFn: () => window.functions.getBooks()
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
        .map((cssObj) => (
          <link key={cssObj.id} rel="stylesheet" href={cssObj.href} />
        ))}

      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
