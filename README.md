# Fylqen

Browser-first PDF editing SaaS frontend.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

The application includes browser PDF rendering, selectable embedded-text replacement, overlay annotations, PDF export, browser PDF tools, IndexedDB document storage, authentication APIs, and deployment configuration.

Existing-text replacement exports a flattened PDF: every page is rasterized and the original embedded text streams are removed. Replacement text and other annotations are redrawn on the flattened pages. This workflow is browser-local and works only for selectable text; scanned text, unsupported font encodings, and complex character shaping require OCR or external PDF tooling.

## Additional Features

- Password protection is performed locally with PDF 128-bit RC4 encryption and permission flags.
- OCR uses Tesseract.js to recognize scanned pages and export extracted text.
- P12/PFX certificate signing uses LibPDF PAdES signing. Certificate chain trust remains the verifier's responsibility.
- PDF compression offers a content-preserving re-save and an explicitly lossy JPEG mode. Lossy mode rasterizes pages, so text is no longer selectable/searchable; the compressor keeps whichever of the original, re-saved, or rasterized files is smallest and reports the result.
- Sign PDF accepts a PDF and PNG/JPEG signature in either selection order, preserves the image aspect ratio, and allows choosing a page and corner. This is an electronic image signature, not a certified digital signature.
- Watermark PDF supports one diagonal watermark, repeated diagonal watermarks, or a repeated grid on every page.
- Annotation drag and resize controls work with mouse and touch pointer input.
- Mobile layouts use a collapsible navigation menu, bottom editor toolbar, fit-to-width preview, and a toggled properties drawer.
- Highlight selectable PDF text by dragging across the words or letters; choose a highlight color. Document search marks matching text in the page and lets you jump to result pages. The Shapes panel is collapsed by default.
- Add images by choosing a file and clicking the page; replace an image by dragging over its area, then choosing the replacement file (or choose the file first). The replacement cover samples the surrounding page color, and works for an image region inside a larger flattened label. Replacements flatten pages to remove the original image content.
- Text annotations and existing-text replacements support all 14 PDF standard fonts, size, color, bold, italic, underline, strikethrough, alignment, and text highlighting. Symbol and Zapf Dingbats fall back to Helvetica for text they cannot encode. The Shapes section includes rectangle, circle, ellipse, line, arrow, triangle, diamond, pentagon, hexagon, and star tools with color and stroke-thickness settings.
