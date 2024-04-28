import React from 'react'
import Loader from '@renderer/components/Loader'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { createGlobalStyle } from 'styled-components'
import { Book } from 'src/shared/types'

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

  if (isError) return <div className="w-full h-full place-items-center grid"> {error.message}</div>
  if (isPending)
    return (
      <div className="w-full h-screen place-items-center grid">
        <Loader />
      </div>
    )

  const GlobalFonts = createGlobalStyle`
 
  ${books && createStyles(books)}
`
  function createStyles(books: Book[]) {
    return books
      .flatMap((book) => book.assets)
      .flatMap((asset) => asset.font)
      .filter((font) => font !== undefined)
      .map((font) => {
        console.log(font)
        const fontFace = `@font-face {
            font-family: '${font.properties['name'] || 'font'}';
            src: url('${font.href}')');
          }`
        return fontFace
      })
  }
  return (
    <>
      <GlobalFonts />
      {books
        .flatMap((book) => book.assets)
        .flatMap((asset) => asset.css)
        .filter((cssObj) => cssObj !== undefined)
        .map((cssObj) => (
          <link key={cssObj.id} rel="stylesheet" href={cssObj.href} />
        ))}

      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{' '}
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
