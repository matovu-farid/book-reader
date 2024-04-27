import DOMPurify from 'dompurify' // to sanitize the HTML

const XMLToHTMLComponent = ({ xmlString }: { xmlString: string }): JSX.Element => {
  // Assuming xmlString is a valid XHTML string
  const createMarkup = (htmlString: string) => {
    return { __html: DOMPurify.sanitize(htmlString) }
  }

  return <div dangerouslySetInnerHTML={createMarkup(xmlString)} />
}

export default XMLToHTMLComponent
