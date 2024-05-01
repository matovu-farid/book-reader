import { formatBookDatails } from 'src/main/modules/formatBookDatails'
import { PORT } from 'src/main/modules/PORT'
import { OPFFileObj } from 'src/shared/types'
import { it, describe, expect, beforeEach } from 'vitest'
interface Context {
  bookDetails: ReturnType<typeof formatBookDatails>
  pathToBook: string
}
describe('formatBookDatails', () => {
  beforeEach<Context>((context) => {
    const manifest = [
      {
        id: 'id1',
        href: 'file1',
        'media-type': 'text/plain'
      },
      {
        id: 'id2',
        href: 'file2',
        'media-type': 'text/plain'
      }
    ]
    const opfFileObj: OPFFileObj = {
      metadata: {
        'dc:title': {
          _text: 'title'
        }
      },
      spine: {
        itemref: [
          {
            _attributes: {
              idref: 'id1'
            }
          },
          {
            _attributes: {
              idref: 'id2'
            }
          }
        ]
      },
      manifest: {
        item: [
          {
            _attributes: {
              id: 'id1',
              href: 'file1',
              'media-type': 'text/plain'
            }
          },
          {
            _attributes: {
              id: 'id2',
              href: 'file2',
              'media-type': 'text/plain'
            }
          }
        ]
      },
      guide: {}
    }
    const opfFilePath = 'path/to/opf'
    const pathToBook = 'path/to/book'
    const absoluteBookPath = `public/${pathToBook}`
    context.bookDetails = formatBookDatails(manifest, opfFileObj, opfFilePath, absoluteBookPath)
    context.pathToBook = pathToBook
  })
  it('should return spine and title', ({ bookDetails, pathToBook }: Context) => {
    expect(bookDetails).toEqual({
      spine: [
        {
          idref: 'id1',
          route: `http://localhost:${PORT}/${pathToBook}/path/to/file1`,
          mediaType: 'text/plain'
        },
        {
          idref: 'id2',
          route: `http://localhost:${PORT}/${pathToBook}/path/to/file2`,
          mediaType: 'text/plain'
        }
      ],
      title: 'title'
    })
  })
})
