import * as pdfjs from 'pdfjs-dist'
import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export type PdfSource = ArrayBuffer | Uint8Array
export type WatermarkPattern = 'single' | 'diagonal' | 'grid'
export type SignaturePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export async function loadPdf(source: PdfSource) {
  const data = source instanceof Uint8Array ? source.slice() : new Uint8Array(source)
  return pdfjs.getDocument({ data }).promise
}

export async function renderPage(
  pdf: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * ratio)
  canvas.height = Math.floor(viewport.height * ratio)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not supported')
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  await page.render({ canvas, canvasContext: context, viewport }).promise
  return { width: viewport.width, height: viewport.height }
}

export type Annotation = {
  id: string
  page: number
  type: 'text' | 'existingText' | 'highlight' | 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'draw' | 'signature' | 'image' | 'replaceImage'
  x: number
  y: number
  width: number
  height: number
  text?: string
  color?: string
  fontFamily?: 'Courier' | 'CourierBold' | 'CourierOblique' | 'CourierBoldOblique' | 'Helvetica' | 'HelveticaBold' | 'HelveticaOblique' | 'HelveticaBoldOblique' | 'Symbol' | 'TimesRoman' | 'TimesRomanBold' | 'TimesRomanItalic' | 'TimesRomanBoldItalic' | 'ZapfDingbats'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  alignment?: 'left' | 'center' | 'right'
  textBackgroundColor?: string
  opacity?: number
  lineWidth?: number
  points?: { x: number; y: number }[]
  dataUrl?: string
  backgroundColor?: string
  pdfX?: number
  pdfY?: number
  pdfWidth?: number
  pdfHeight?: number
  fontSize?: number
}

function drawExistingTextReplacement(page: PDFPage, annotation: Annotation, font: PDFFont) {
  if (
    annotation.type !== 'existingText' ||
    !annotation.text ||
    annotation.pdfX === undefined ||
    annotation.pdfY === undefined
  ) return

  const fontSize = annotation.fontSize ?? 12
  const coverHeight = Math.max((annotation.pdfHeight ?? fontSize) * 1.35, 10)
  const coverWidth = Math.max(
    annotation.pdfWidth ?? 0,
    font.widthOfTextAtSize(annotation.text, fontSize),
  ) + 2
  page.drawRectangle({
    x: Math.max(0, annotation.pdfX - 1),
    y: annotation.pdfY - coverHeight * 0.2,
    width: coverWidth,
    height: coverHeight,
    color: rgb(1, 1, 1),
  })
  drawStyledText(page, annotation.text, annotation.pdfX, annotation.pdfY, fontSize, font, annotation, coverWidth - 2)
}

function drawStyledText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  font: PDFFont,
  annotation: Annotation,
  maxWidth?: number,
) {
  const color = hexToRgb(annotation.color ?? '#211d38')
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const width = maxWidth ?? textWidth
  const textX = annotation.alignment === 'center'
    ? x + Math.max(0, width - textWidth) / 2
    : annotation.alignment === 'right'
      ? x + Math.max(0, width - textWidth)
      : x
  if (annotation.textBackgroundColor) {
    page.drawRectangle({
      x,
      y: y - fontSize * 0.25,
      width,
      height: fontSize * 1.25,
      color: hexToRgb(annotation.textBackgroundColor),
    })
  }
  page.drawText(text, {
    x: textX,
    y,
    size: fontSize,
    font,
    color,
    maxWidth,
  })
  const decorationY = y - Math.max(1, fontSize * 0.12)
  if (annotation.underline) {
    page.drawLine({
      start: { x: textX, y: decorationY },
      end: { x: textX + textWidth, y: decorationY },
      color,
      thickness: Math.max(0.5, fontSize * 0.05),
    })
  }
  if (annotation.strikethrough) {
    const strikeY = y + fontSize * 0.32
    page.drawLine({
      start: { x: textX, y: strikeY },
      end: { x: textX + textWidth, y: strikeY },
      color,
      thickness: Math.max(0.5, fontSize * 0.05),
    })
  }
}

async function getAnnotationFont(
  pdf: PDFDocument,
  annotation: Annotation,
  cache: Map<string, Promise<PDFFont>>,
) {
  const family = annotation.fontFamily ?? 'Helvetica'
  const isCourier = family.startsWith('Courier')
  const isTimes = family.startsWith('TimesRoman')
  const baseFamily = isCourier ? 'Courier' : isTimes ? 'TimesRoman' : 'Helvetica'
  const isBold = annotation.bold || family.includes('Bold')
  const isItalic = annotation.italic || family.includes('Italic') || family.includes('Oblique')
  const fontName = family === 'Symbol' || family === 'ZapfDingbats'
    ? family === 'Symbol' ? StandardFonts.Symbol : StandardFonts.ZapfDingbats
    : baseFamily === 'TimesRoman'
      ? isBold
        ? isItalic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold
        : isItalic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman
      : baseFamily === 'Courier'
        ? isBold
          ? isItalic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold
          : isItalic ? StandardFonts.CourierOblique : StandardFonts.Courier
        : isBold
          ? isItalic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold
          : isItalic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica
  let font = cache.get(fontName)
  if (!font) {
    font = pdf.embedFont(fontName)
    cache.set(fontName, font)
  }
  return font
}

async function getAnnotationTextFont(
  pdf: PDFDocument,
  annotation: Annotation,
  cache: Map<string, Promise<PDFFont>>,
  text: string,
) {
  const font = await getAnnotationFont(pdf, annotation, cache)
  try {
    font.encodeText(text)
    return font
  } catch (error) {
    if (annotation.fontFamily !== 'Symbol' && annotation.fontFamily !== 'ZapfDingbats') throw error

    const fallbackFont = await getAnnotationFont(pdf, { ...annotation, fontFamily: 'Helvetica' }, cache)
    fallbackFont.encodeText(text)
    return fallbackFont
  }
}

type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star'

function isShapeType(type: Annotation['type']): type is ShapeType {
  return ['rectangle', 'circle', 'ellipse', 'line', 'arrow', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star'].includes(type)
}

function drawShapeAnnotation(page: PDFPage, annotation: Annotation, x: number, top: number, width: number, height: number) {
  const color = hexToRgb(annotation.color ?? '#7059e8')
  const thickness = annotation.lineWidth ?? 1.5
  const bottom = top - height

  if (annotation.type === 'rectangle') {
    page.drawRectangle({ x, y: bottom, width, height, borderColor: color, borderWidth: thickness })
  } else if (annotation.type === 'circle' || annotation.type === 'ellipse') {
    const diameter = annotation.type === 'circle' ? Math.min(width, height) : undefined
    page.drawEllipse({
      x: x + (width - (diameter ?? width)) / 2 + (diameter ?? width) / 2,
      y: bottom + (height - (diameter ?? height)) / 2 + (diameter ?? height) / 2,
      xScale: (diameter ?? width) / 2,
      yScale: (diameter ?? height) / 2,
      borderColor: color,
      borderWidth: thickness,
    })
  } else if (annotation.type === 'line' || annotation.type === 'arrow') {
    const end = { x: x + width, y: bottom }
    page.drawLine({ start: { x, y: top }, end, color, thickness })
    if (annotation.type === 'arrow') {
      const angle = Math.atan2(end.y - top, end.x - x)
      const headLength = Math.max(8, thickness * 4)
      for (const offset of [-Math.PI / 6, Math.PI / 6]) {
        page.drawLine({
          start: end,
          end: {
            x: end.x - headLength * Math.cos(angle + offset),
            y: end.y - headLength * Math.sin(angle + offset),
          },
          color,
          thickness,
        })
      }
    }
  } else {
    const count = annotation.type === 'triangle' ? 3 : annotation.type === 'diamond' ? 4 : annotation.type === 'pentagon' ? 5 : annotation.type === 'hexagon' ? 6 : 10
    const points = Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
      const radius = annotation.type === 'star' && index % 2 === 1 ? 0.42 : 1
      return {
        x: x + width / 2 + Math.cos(angle) * width * 0.48 * radius,
        y: bottom + height / 2 + Math.sin(angle) * height * 0.48 * radius,
      }
    })
    for (let index = 0; index < points.length; index++) {
      page.drawLine({
        start: points[index],
        end: points[(index + 1) % points.length],
        color,
        thickness,
      })
    }
  }
}

export async function exportAnnotatedPdf(source: Uint8Array, annotations: Annotation[]) {
  if (annotations.some((annotation) => annotation.type === 'existingText' || annotation.type === 'replaceImage')) {
    return exportFlattenedAnnotatedPdf(source, annotations)
  }

  const pdf = await PDFDocument.load(source)
  const fontCache = new Map<string, Promise<PDFFont>>()
  for (const annotation of annotations) {
    const page = pdf.getPage(annotation.page - 1)
    const { width, height } = page.getSize()
    const x = annotation.x * width
    const y = height - annotation.y * height
    const w = annotation.width * width
    const h = annotation.height * height
    const color = hexToRgb(annotation.color ?? '#7059e8')
    if ((annotation.type === 'image' || annotation.type === 'replaceImage') && annotation.dataUrl) {
      await drawImageAnnotation(pdf, page, annotation)
    } else if (annotation.type === 'existingText' && annotation.text) {
      drawExistingTextReplacement(page, annotation, await getAnnotationTextFont(pdf, annotation, fontCache, annotation.text))
    } else if (annotation.type === 'text' && annotation.text) {
      const fontSize = annotation.fontSize ?? 12
      drawStyledText(page, annotation.text, x, y - fontSize, fontSize, await getAnnotationTextFont(pdf, annotation, fontCache, annotation.text), annotation, w)
    } else if (annotation.type === 'highlight') {
      page.drawRectangle({ x, y: y - h, width: w, height: h, color: hexToRgb(annotation.color ?? '#ffe066'), opacity: annotation.opacity ?? 0.55 })
    } else if (isShapeType(annotation.type)) {
      drawShapeAnnotation(page, annotation, x, y, w, h)
    } else if (annotation.type === 'draw' && annotation.points?.length) {
      for (let i = 1; i < annotation.points.length; i++) {
        const a = annotation.points[i - 1]
        const b = annotation.points[i]
        page.drawLine({
          start: { x: a.x * width, y: height - a.y * height },
          end: { x: b.x * width, y: height - b.y * height },
          color,
          thickness: 2,
        })
      }
    } else if (annotation.type === 'signature' && annotation.dataUrl) {
      const embedded = annotation.dataUrl.startsWith('data:image/png')
        ? await pdf.embedPng(annotation.dataUrl)
        : await pdf.embedJpg(annotation.dataUrl)
      page.drawImage(embedded, { x, y: y - h, width: w, height: h })
    }
  }
  return pdf.save()
}

async function exportFlattenedAnnotatedPdf(source: Uint8Array, annotations: Annotation[]) {
  const renderedPdf = await loadPdf(source)
  const pdf = await PDFDocument.create()
  const fontCache = new Map<string, Promise<PDFFont>>()

  for (let pageNumber = 1; pageNumber <= renderedPdf.numPages; pageNumber++) {
    const sourcePage = await renderedPdf.getPage(pageNumber)
    const sourceViewport = sourcePage.getViewport({ scale: 1 })
    const renderViewport = sourcePage.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(renderViewport.width)
    canvas.height = Math.ceil(renderViewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not supported')

    await sourcePage.render({
      canvas,
      canvasContext: context,
      viewport: renderViewport,
    }).promise

    const image = await pdf.embedPng(canvas.toDataURL('image/png'))
    const page = pdf.addPage([sourceViewport.width, sourceViewport.height])
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: sourceViewport.width,
      height: sourceViewport.height,
    })

    const pageAnnotations = annotations.filter((annotation) => annotation.page === pageNumber)
    for (const annotation of pageAnnotations) {
      const { width, height } = page.getSize()
      const x = annotation.x * width
      const y = height - annotation.y * height
      const w = annotation.width * width
      const h = annotation.height * height
      const color = hexToRgb(annotation.color ?? '#7059e8')

      if ((annotation.type === 'image' || annotation.type === 'replaceImage') && annotation.dataUrl) {
        await drawImageAnnotation(pdf, page, annotation)
      } else if (annotation.type === 'existingText' && annotation.text && annotation.pdfX !== undefined && annotation.pdfY !== undefined) {
        drawExistingTextReplacement(page, annotation, await getAnnotationTextFont(pdf, annotation, fontCache, annotation.text))
      } else if (annotation.type === 'text' && annotation.text) {
        const fontSize = annotation.fontSize ?? 12
        drawStyledText(page, annotation.text, x, y - fontSize, fontSize, await getAnnotationTextFont(pdf, annotation, fontCache, annotation.text), annotation, w)
      } else if (annotation.type === 'highlight') {
        page.drawRectangle({ x, y: y - h, width: w, height: h, color: hexToRgb(annotation.color ?? '#ffe066'), opacity: annotation.opacity ?? 0.55 })
      } else if (isShapeType(annotation.type)) {
        drawShapeAnnotation(page, annotation, x, y, w, h)
      } else if (annotation.type === 'draw' && annotation.points?.length) {
        for (let i = 1; i < annotation.points.length; i++) {
          const a = annotation.points[i - 1]
          const b = annotation.points[i]
          page.drawLine({
            start: { x: a.x * width, y: height - a.y * height },
            end: { x: b.x * width, y: height - b.y * height },
            color,
            thickness: 2,
          })
        }
      } else if (annotation.type === 'signature' && annotation.dataUrl) {
        const embedded = annotation.dataUrl.startsWith('data:image/png')
          ? await pdf.embedPng(annotation.dataUrl)
          : await pdf.embedJpg(annotation.dataUrl)
        page.drawImage(embedded, { x, y: y - h, width: w, height: h })
      }
    }
  }

  return pdf.save()
}

async function drawImageAnnotation(pdf: PDFDocument, page: PDFPage, annotation: Annotation) {
  if (!annotation.dataUrl) return
  const image = annotation.dataUrl.startsWith('data:image/png')
    ? await pdf.embedPng(annotation.dataUrl)
    : await pdf.embedJpg(annotation.dataUrl)
  const { width, height } = page.getSize()
  const boxX = annotation.x * width
  const boxY = height - (annotation.y + annotation.height) * height
  const boxWidth = annotation.width * width
  const boxHeight = annotation.height * height

  if (annotation.type === 'replaceImage') {
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: hexToRgb(annotation.backgroundColor ?? '#ffffff'),
    })
  }

  const fit = Math.min(boxWidth / image.width, boxHeight / image.height)
  const drawWidth = image.width * fit
  const drawHeight = image.height * fit
  page.drawImage(image, {
    x: boxX + (boxWidth - drawWidth) / 2,
    y: boxY + (boxHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  })
}

export async function mergePdfFiles(files: File[]) {
  if (files.length < 2) throw new Error('Select at least two PDF files to combine.')
  const output = await PDFDocument.create()
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer())
    const pages = await output.copyPages(source, source.getPageIndices())
    pages.forEach((page) => output.addPage(page))
  }
  return output.save()
}

export async function compressPdf(
  source: PdfSource,
  mode: 'lossless' | 'lossy',
  options: { quality?: number; scale?: number } = {},
) {
  const original = source instanceof Uint8Array ? source.slice() : new Uint8Array(source)
  const losslessPdf = await PDFDocument.load(original)
  const lossless = await losslessPdf.save({ useObjectStreams: true, addDefaultPage: false })
  const candidates: { bytes: Uint8Array; strategy: 'original' | 'lossless' | 'lossy' }[] = [
    { bytes: original, strategy: 'original' as const },
    { bytes: lossless, strategy: 'lossless' as const },
  ]

  if (mode === 'lossy') {
    const sourcePdf = await loadPdf(original.slice())
    const output = await PDFDocument.create()
    const quality = Math.max(0.2, Math.min(0.9, options.quality ?? 0.68))
    const preferredScale = Math.max(0.5, Math.min(2, options.scale ?? 1.4))

    try {
      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber++) {
        const sourcePage = await sourcePdf.getPage(pageNumber)
        const pageViewport = sourcePage.getViewport({ scale: 1 })
        const scale = Math.min(
          preferredScale,
          4000 / Math.max(pageViewport.width, pageViewport.height),
        )
        const viewport = sourcePage.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is not supported')

        await sourcePage.render({ canvas, canvasContext: context, viewport }).promise
        const jpeg = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to encode a compressed PDF page')), 'image/jpeg', quality)
        })
        const image = await output.embedJpg(await jpeg.arrayBuffer())
        const outputPage = output.addPage([pageViewport.width, pageViewport.height])
        outputPage.drawImage(image, {
          x: 0,
          y: 0,
          width: pageViewport.width,
          height: pageViewport.height,
        })
        canvas.width = 0
        canvas.height = 0
      }

      candidates.push({ bytes: await output.save({ useObjectStreams: true }), strategy: 'lossy' })
    } finally {
      await sourcePdf.cleanup()
    }
  }

  const smallest = candidates.reduce((best, candidate) =>
    candidate.bytes.length < best.bytes.length ? candidate : best,
  )
  return smallest
}

export async function signPdfWithImage(
  source: PdfSource,
  signatureBytes: ArrayBuffer | Uint8Array,
  imageType: 'png' | 'jpeg',
  pageNumber: number,
  position: SignaturePosition,
) {
  const pdf = await PDFDocument.load(source)
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.getPageCount()) {
    throw new Error(`Choose a page number from 1 to ${pdf.getPageCount()}.`)
  }

  const bytes = signatureBytes instanceof Uint8Array
    ? signatureBytes
    : new Uint8Array(signatureBytes)
  const image = imageType === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const page = pdf.getPage(pageNumber - 1)
  const { width, height } = page.getSize()
  const maxWidth = Math.min(180, width * 0.3)
  const maxHeight = Math.min(72, height * 0.12)
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  const signatureWidth = image.width * scale
  const signatureHeight = image.height * scale
  const margin = Math.min(32, width * 0.05, height * 0.05)
  const x = position.endsWith('left') ? margin : width - signatureWidth - margin
  const y = position.startsWith('top') ? height - signatureHeight - margin : margin

  page.drawImage(image, { x, y, width: signatureWidth, height: signatureHeight })
  return pdf.save()
}

export async function addWatermark(
  source: PdfSource,
  text: string,
  pattern: WatermarkPattern,
) {
  const label = text.trim()
  if (!label) throw new Error('Enter watermark text.')

  const pdf = await PDFDocument.load(source)
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    if (pattern === 'single') {
      let size = Math.min(42, width * 0.08, height * 0.06)
      const maxTextWidth = width * 0.85
      size = Math.min(size, maxTextWidth / font.widthOfTextAtSize(label, 1))
      const textWidth = font.widthOfTextAtSize(label, size)
      page.drawText(label, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.6, 0.58, 0.68),
        opacity: 0.28,
        rotate: degrees(-35),
      })
      continue
    }

    const columns = pattern === 'grid' ? 3 : Math.max(2, Math.ceil(width / 230))
    const rows = pattern === 'grid' ? 3 : Math.max(2, Math.ceil(height / 180))
    const size = pattern === 'grid' ? 24 : 30
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const centerX = ((column + 0.5) * width) / columns
        const centerY = ((row + 0.5) * height) / rows
        const textWidth = font.widthOfTextAtSize(label, size)
        page.drawText(label, {
          x: centerX - textWidth / 2,
          y: centerY,
          size,
          font,
          color: rgb(0.6, 0.58, 0.68),
          opacity: 0.24,
          rotate: degrees(pattern === 'diagonal' ? -35 : 0),
        })
      }
    }
  }
  return pdf.save()
}

export async function extractPdfPages(file: File, pageIndices: number[]) {
  const source = await PDFDocument.load(await file.arrayBuffer())
  const output = await PDFDocument.create()
  const pages = await output.copyPages(source, pageIndices)
  pages.forEach((page) => output.addPage(page))
  return output.save()
}

export async function rotatePdf(file: File, rotations: number[]) {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  pdf.getPages().forEach((page, index) => page.setRotation(degrees(rotations[index] ?? 0)))
  return pdf.save()
}

export async function extractPdfText(file: File) {
  const pdf = await loadPdf(await file.arrayBuffer())
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    parts.push(`Page ${i}\n${content.items.map((item) => 'str' in item ? item.str : '').join(' ')}`)
  }
  return parts.join('\n\n')
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  )
}
