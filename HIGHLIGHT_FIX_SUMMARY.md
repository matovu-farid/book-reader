# Highlight Range Functionality Fix

## Problem

The `highlightRange` functionality in `rendition.ts` was not working properly for two reasons:

1. **Missing Visual Rendering**: It only stored the highlight annotation in memory but never actually rendered the highlight visually on the page.
2. **API Incompatibility**: The function signature was changed from the original implementation, breaking existing code that relied on the `data` parameter.

## Root Cause

The previous implementation had these issues:

1. **Wrong Function Signature**: The `highlightRange` method was missing the `data` parameter that existed in the original working code, causing type errors and breaking backward compatibility.

2. **No Visual Rendering**: The method only called `annotations.highlight()`, which stored the annotation data but didn't create any visual elements on the page.

3. **No Persistence**: Even if highlights were stored, they wouldn't reappear when navigating between pages or sections.

4. **Incomplete Removal**: The `removeHighlight` method only removed the annotation from storage but didn't remove any visual elements (though none existed).

## Solution

### 1. Fixed API Signature

Restored the correct function signature to match the original working code:

```typescript
highlightRange(
  cfiRange: string,
  data: Partial<HighlightData> = {},  // ✅ Restored missing parameter
  cb?: (...args: unknown[]) => void,
  className: string = 'epubjs-hl',
  styles: Record<string, unknown> = {}
)
```

This ensures:

- Backward compatibility with existing code
- Proper data can be associated with highlights (text, notes, colors)
- The `data` parameter is correctly passed to the annotations module

### 2. Visual Rendering Implementation

Added SVG-based highlighting that creates visual overlay elements:

```typescript
private _createHighlightElement(
  range: Range,
  cfi: string,
  className: string,
  styles: Record<string, unknown>,
  contents: Contents
): void
```

This method:

- Creates an SVG container if it doesn't exist
- Generates SVG rectangles for each line of highlighted text using `range.getClientRects()`
- Applies the highlight styles (default yellow with 30% opacity)
- Appends the SVG elements to the document

### 3. Highlight Persistence

Added automatic re-rendering when views are displayed:

```typescript
private _rerenderHighlightsForView(view: View): void
```

This method:

- Is called in `afterDisplayed()` when a view is rendered
- Checks all stored highlights
- Re-renders any highlights that belong to the current view
- Ensures highlights persist when navigating between pages

### 4. Complete Removal

Enhanced the removal functionality:

```typescript
private _removeHighlightFromViews(cfi: string): void
```

This method:

- Removes the visual SVG elements from all views
- Works in conjunction with the annotation store removal

### 5. Additional Utility Methods

Added convenience methods:

- `getAllHighlights()`: Returns all stored highlights
- `clearAllHighlights()`: Removes all highlights (both data and visual elements)

## Technical Details

### SVG Overlay Approach

The implementation uses SVG overlays because:

- They don't modify the original document structure
- They support transparency and blend modes
- They work well with multi-line selections
- They're easy to add/remove dynamically

### Highlight Structure

```
<svg id="epubjs-highlights-container">
  <g id="epubjs-hl-{encoded-cfi}" class="epubjs-hl" data-cfi="{cfi}">
    <rect x="..." y="..." width="..." height="..." fill="yellow" fill-opacity="0.3" />
    <rect ... /> <!-- Additional rects for multi-line highlights -->
  </g>
</svg>
```

### Default Styles

```typescript
{
  fill: 'yellow',
  'fill-opacity': '0.3',
  'mix-blend-mode': 'multiply'
}
```

## Usage

### Create a Highlight

```typescript
// Simple usage (with defaults)
rendition.highlightRange(cfiRange)

// With custom data
const data = {
  text: 'Selected text',
  note: 'My note',
  color: 'blue'
}
rendition.highlightRange(cfiRange, data)

// Full API usage
rendition
  .highlightRange(cfiRange, data, callback, className, customStyles)
  .then((annotation) => {
    console.log('Highlight created:', annotation)
  })
  .catch((error) => {
    console.error('Failed to create highlight:', error)
  })
```

**Parameters:**

- `cfiRange` (string): The CFI range string to highlight
- `data` (Partial<HighlightData>, optional): Custom data object with properties:
  - `text` (string): The highlighted text
  - `note` (string): An optional note
  - `color` (HighlightColor): Color for the highlight ('yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange')
  - `type` (AnnotationType): Type of annotation
- `cb` (function, optional): Callback function when annotation is clicked
- `className` (string, default: 'epubjs-hl'): CSS class name for the highlight
- `styles` (object, optional): Custom SVG styles to apply

### Remove a Highlight

```typescript
rendition
  .removeHighlight(cfiRange)
  .then((existed) => {
    console.log('Highlight removed:', existed)
  })
  .catch((error) => {
    console.error('Failed to remove highlight:', error)
  })
```

### Get All Highlights

```typescript
const highlights = rendition.getAllHighlights()
```

### Clear All Highlights

```typescript
rendition.clearAllHighlights()
```

## Testing Recommendations

1. **Single-line highlights**: Test highlighting a single word or short phrase
2. **Multi-line highlights**: Test highlighting text that spans multiple lines
3. **Cross-page highlights**: Test highlighting text near page boundaries
4. **Navigation**: Navigate away and back to ensure highlights persist
5. **Multiple highlights**: Create several highlights in different locations
6. **Removal**: Test removing individual and all highlights
7. **Custom styles**: Test with different colors and styles

## Files Modified

- `src/shared/epubjs/src/rendition.ts`: Main implementation
  - Enhanced `highlightRange()` method
  - Enhanced `removeHighlight()` method
  - Added `_renderHighlightOnVisibleViews()` method
  - Added `_createHighlightElement()` method
  - Added `_removeHighlightFromViews()` method
  - Added `_rerenderHighlightsForView()` method
  - Added `getAllHighlights()` method
  - Added `clearAllHighlights()` method
  - Modified `afterDisplayed()` to trigger highlight re-rendering

## Future Enhancements

Potential improvements for the future:

1. **Click Handlers**: Add click handlers to highlights for note-taking or removal
2. **Style Persistence**: Store custom styles with annotations
3. **Performance**: Optimize for books with many highlights
4. **Animation**: Add subtle animations when highlights are added/removed
5. **Touch Support**: Add touch/gesture support for mobile devices
6. **Highlight Groups**: Support for categorizing highlights by color or type
