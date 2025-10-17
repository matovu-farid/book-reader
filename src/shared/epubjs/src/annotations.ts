/**
 * Annotations module for EPUB highlighting and notes
 */

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'underline'

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange'

export interface Annotation {
  readonly cfi: string
  text: string
  note?: string
  color?: HighlightColor
  type?: AnnotationType
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export interface HighlightData {
  text: string
  note?: string
  color?: HighlightColor
  type?: AnnotationType
}

export interface HighlightOptions {
  className?: string
  styles?: Record<string, string | number>
  data?: HighlightData
}

export type AnnotationCallback = (annotation?: Annotation, error?: Error) => void

export interface AnnotationResult {
  success: boolean
  annotation?: Annotation
  error?: string
}

export class AnnotationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cfi?: string
  ) {
    super(message)
    this.name = 'AnnotationError'
  }
}

class Annotations {
  private readonly _annotations: Map<string, Annotation> = new Map()
  private readonly _annotationTypes: Set<AnnotationType> = new Set([
    'highlight',
    'note',
    'bookmark',
    'underline'
  ])

  constructor() {
    // Initialize annotations
  }

  /**
   * Add a new annotation
   * @param annotation - The annotation to add
   * @returns Promise<AnnotationResult>
   */
  add(annotation: Annotation): AnnotationResult {
    try {
      if (!this.isValidCFI(annotation.cfi)) {
        throw new AnnotationError('Invalid CFI format', 'INVALID_CFI', annotation.cfi)
      }

      const hash = this.generateHash(annotation.cfi, annotation.type || 'highlight')

      const newAnnotation: Annotation = {
        ...annotation,
        createdAt: annotation.createdAt || new Date(),
        updatedAt: new Date()
      }

      this._annotations.set(hash, newAnnotation)

      return {
        success: true,
        annotation: newAnnotation
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Remove an annotation by CFI
   * @param cfi - The CFI string
   * @param type - The annotation type (defaults to 'highlight')
   * @returns Promise<boolean>
   */
  remove(cfi: string, type: AnnotationType = 'highlight'): boolean {
    if (!this.isValidCFI(cfi)) {
      return false
    }

    const hash = this.generateHash(cfi, type)
    return this._annotations.delete(hash)
  }

  /**
   * Get an annotation by CFI
   * @param cfi - The CFI string
   * @param type - The annotation type (defaults to 'highlight')
   * @returns The annotation or undefined
   */
  get(cfi: string, type: AnnotationType = 'highlight'): Annotation | undefined {
    if (!this.isValidCFI(cfi)) {
      return undefined
    }

    const hash = this.generateHash(cfi, type)
    return this._annotations.get(hash)
  }

  /**
   * Get all annotations as an array
   * @returns Array of all annotations
   */
  getAll(): readonly Annotation[] {
    return Array.from(this._annotations.values())
  }

  /**
   * Get all annotations as a Map
   * @returns Map of all annotations
   */
  getAnnotations(): ReadonlyMap<string, Annotation> {
    return this._annotations
  }

  /**
   * Get annotations by type
   * @param type - The annotation type
   * @returns Array of annotations of the specified type
   */
  getByType(type: AnnotationType): readonly Annotation[] {
    return this.getAll().filter((annotation) => annotation.type === type)
  }

  /**
   * Check if an annotation exists
   * @param cfi - The CFI string
   * @param type - The annotation type (defaults to 'highlight')
   * @returns boolean
   */
  has(cfi: string, type: AnnotationType = 'highlight'): boolean {
    if (!this.isValidCFI(cfi)) {
      return false
    }

    const hash = this.generateHash(cfi, type)
    return this._annotations.has(hash)
  }

  /**
   * Clear all annotations
   */
  clear(): void {
    this._annotations.clear()
  }

  /**
   * Get the count of annotations
   * @returns number of annotations
   */
  get size(): number {
    return this._annotations.size
  }

  /**
   * Highlight text with proper typing
   * @param cfi - The CFI string
   * @param options - Highlight options
   * @param callback - Optional callback function
   * @returns AnnotationResult
   */
  highlight(
    cfi: string,
    options: HighlightOptions = {},
    callback?: AnnotationCallback
  ): AnnotationResult {
    try {
      if (!this.isValidCFI(cfi)) {
        throw new AnnotationError('Invalid CFI format', 'INVALID_CFI', cfi)
      }

      if (typeof cfi !== 'string') {
        throw new AnnotationError('CFI must be a string', 'INVALID_CFI_TYPE', cfi)
      }

      const annotation: Annotation = {
        cfi,
        text: options.data?.text || '',
        note: options.data?.note,
        color: options.data?.color,
        type: options.data?.type || 'highlight',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = this.add(annotation)

      if (callback) {
        callback(result.annotation, result.error ? new Error(result.error) : undefined)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      if (callback) {
        callback(undefined, new AnnotationError(errorMessage, 'HIGHLIGHT_ERROR', cfi))
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Generate a hash for the annotation key
   * @private
   */
  private generateHash(cfi: string, type: AnnotationType): string {
    return encodeURIComponent(`${cfi}_${type}`)
  }

  /**
   * Validate CFI format
   * @private
   */
  private isValidCFI(cfi: string): boolean {
    return typeof cfi === 'string' && cfi.length > 0 && cfi.startsWith('epubcfi(')
  }
}

export default Annotations
