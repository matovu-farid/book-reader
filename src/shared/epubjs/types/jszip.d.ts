declare module 'jszip' {
  interface JSZipObject {
    async(type: string): Promise<any>
    async(type: 'string'): Promise<string>
    async(type: 'blob'): Promise<Blob>
    async(type: 'arraybuffer'): Promise<ArrayBuffer>
    name: string
  }

  interface JSZipLoadOptions {
    base64?: boolean
    checkCRC32?: boolean
    optimizedBinaryString?: boolean
    createFolders?: boolean
  }

  interface JSZip {
    file(name: string): JSZipObject | null
    loadAsync(data: ArrayBuffer | string, options?: JSZipLoadOptions): Promise<JSZip>
  }

  class JSZip {
    constructor()
    file(name: string): JSZipObject | null
    loadAsync(data: ArrayBuffer | string, options?: JSZipLoadOptions): Promise<JSZip>
  }

  export = JSZip
}
