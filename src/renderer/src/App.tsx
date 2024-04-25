import FileDrop from './components/FileComponent'
import Providers from './components/providers'

function App(): JSX.Element {
  return (
    <div className="grid place-items-center h-screen">
      <Providers>
        <FileDrop />
      </Providers>
    </div>
  )
}

export default App
