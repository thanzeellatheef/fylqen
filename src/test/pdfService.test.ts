import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  addWatermark,
  compressPdf,
  exportAnnotatedPdf,
  mergePdfFiles,
  signPdfWithImage,
} from '../services/pdfService'

describe('PDF image annotations', () => {
  it('embeds a newly added image in the exported PDF', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 200])
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII='

    const output = await exportAnnotatedPdf(await source.save(), [{
      id: 'image-1',
      page: 1,
      type: 'image',
      x: 0.2,
      y: 0.2,
      width: 0.3,
      height: 0.3,
      dataUrl: png,
    }])

    const exported = await PDFDocument.load(output)
    const xObjects = exported.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
    expect(xObjects?.keys()).toHaveLength(1)
  })
})

describe('PDF text styling', () => {
  it('embeds the selected font variant when exporting styled text', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 200])

    const output = await exportAnnotatedPdf(await source.save(), [{
      id: 'text-1',
      page: 1,
      type: 'text',
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.1,
      text: 'Styled text',
      fontFamily: 'TimesRoman',
      fontSize: 18,
      bold: true,
      italic: true,
      underline: true,
      color: '#334455',
    }])

    const exported = await PDFDocument.load(output)
    const fonts = exported.getPage(0).node.Resources()?.lookup(PDFName.of('Font'), PDFDict)
    expect(fonts?.keys()[0].toString()).toContain('Times-BoldItalic')
  })

  it('uses Helvetica for ordinary text that Symbol cannot encode', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 200])

    const output = await exportAnnotatedPdf(await source.save(), [{
      id: 'symbol-text',
      page: 1,
      type: 'text',
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.1,
      text: 'T',
      fontFamily: 'Symbol',
      fontSize: 18,
    }])

    const exported = await PDFDocument.load(output)
    const fonts = exported.getPage(0).node.Resources()?.lookup(PDFName.of('Font'), PDFDict)
    expect(fonts?.keys()[0].toString()).toContain('Helvetica')
  })
})

describe('PDF merging', () => {
  it('requires multiple files and preserves the selected file order', async () => {
    const firstPdf = await PDFDocument.create()
    firstPdf.addPage([100, 120])
    const secondPdf = await PDFDocument.create()
    secondPdf.addPage([240, 260])
    const firstFile = new File([new Uint8Array(await firstPdf.save()).buffer], 'first.pdf', { type: 'application/pdf' })
    const secondFile = new File([new Uint8Array(await secondPdf.save()).buffer], 'second.pdf', { type: 'application/pdf' })

    await expect(mergePdfFiles([firstFile])).rejects.toThrow('Select at least two PDF files to combine.')
    const merged = await PDFDocument.load(await mergePdfFiles([firstFile, secondFile]))
    expect(merged.getPageCount()).toBe(2)
    expect(merged.getPage(0).getSize()).toEqual({ width: 100, height: 120 })
    expect(merged.getPage(1).getSize()).toEqual({ width: 240, height: 260 })
  })
})

describe('PDF compression', () => {
  it('keeps pages and page dimensions in preservation mode', async () => {
    const source = await PDFDocument.create()
    source.addPage([210, 297])
    source.addPage([300, 200])

    const result = await compressPdf(await source.save(), 'lossless')
    const output = await PDFDocument.load(result.bytes)
    expect(output.getPageCount()).toBe(2)
    expect(output.getPage(0).getSize()).toEqual({ width: 210, height: 297 })
    expect(output.getPage(1).getSize()).toEqual({ width: 300, height: 200 })
  })
})

describe('PDF image signatures', () => {
  it('adds the signature only to the selected page and rejects invalid pages', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 200])
    source.addPage([300, 300])
    const signature = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))

    const bytes = await signPdfWithImage(await source.save(), signature, 'png', 2, 'bottom-right')
    const signed = await PDFDocument.load(bytes)
    const firstXObjects = signed.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    const secondXObjects = signed.getPage(1).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    expect(firstXObjects?.keys() ?? []).toHaveLength(0)
    expect(secondXObjects?.keys()).toHaveLength(1)
    await expect(signPdfWithImage(bytes, signature, 'png', 3, 'bottom-right')).rejects.toThrow('Choose a page number from 1 to 2.')
  })
})

describe('PDF watermarks', () => {
  it('supports repeated grid and single watermark patterns', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 200])
    const sourceBytes = await source.save()

    const single = await addWatermark(sourceBytes, 'SAMPLE', 'single')
    const grid = await addWatermark(sourceBytes, 'SAMPLE', 'grid')
    expect((await PDFDocument.load(single)).getPageCount()).toBe(1)
    expect(grid.byteLength).toBeGreaterThan(single.byteLength)
    await expect(addWatermark(sourceBytes, '  ', 'single')).rejects.toThrow('Enter watermark text.')
  })
})
