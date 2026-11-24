import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Download, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import { PDFDocument, degrees } from 'pdf-lib'
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite'
import Header from '../components/Header'
import {
  addWatermark,
  compressPdf,
  loadPdf,
  mergePdfFiles,
  extractPdfPages,
  rotatePdf,
  extractPdfText,
  renderPage,
  signPdfWithImage,
  type SignaturePosition,
  type WatermarkPattern,
} from '../services/pdfService'

const titles: Record<string, { title: string; description: string }> = {
  merge: { title: 'Merge PDF', description: 'Combine multiple PDF documents into one file.' },
  split: { title: 'Split PDF', description: 'Extract selected pages or page ranges.' },
  compress: { title: 'Compress PDF', description: 'Reduce PDF size with preservation-focused or lossy compression.' },
  rotate: { title: 'Rotate PDF', description: 'Rotate all pages or selected pages.' },
  organize: { title: 'Organize PDF', description: 'Reorder, delete, duplicate or rotate pages.' },
  'pdf-to-image': { title: 'PDF to Image', description: 'Export PDF pages as PNG or JPEG images.' },
  'image-to-pdf': { title: 'Image to PDF', description: 'Create a PDF from reordered image files.' },
  watermark: { title: 'Watermark PDF', description: 'Add a single or repeated text watermark to every page.' },
  sign: { title: 'Sign PDF', description: 'Place an uploaded electronic signature image on a chosen page.' },
  protect: { title: 'Protect PDF', description: 'Add password protection and PDF permissions.' },
  ocr: { title: 'OCR PDF', description: 'Convert scanned PDF pages into searchable text.' },
  'sign-certified': { title: 'Certified Sign PDF', description: 'Create a cryptographic PAdES digital signature using a P12 certificate.' },
  'pdf-to-text': { title: 'PDF to Text', description: 'Extract selectable text while preserving page order.' },
  search: { title: 'Search PDF', description: 'Search and navigate text found in a document.' },
}

function downloadBytes(bytes: Uint8Array, name: string, type = 'application/pdf') {
  const blob = new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function ToolPage() {
  const { tool = '' } = useParams()
  const copy = titles[tool] ?? { title: 'PDF Tool', description: 'Process a PDF in your browser.' }
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [pageRange, setPageRange] = useState('')
  const [rotation, setRotation] = useState(90)
  const [watermark, setWatermark] = useState('CONFIDENTIAL')
  const [watermarkPattern, setWatermarkPattern] = useState<WatermarkPattern>('single')
  const [compressionMode, setCompressionMode] = useState<'lossless' | 'lossy'>('lossless')
  const [compressionQuality, setCompressionQuality] = useState(0.7)
  const [signaturePage, setSignaturePage] = useState(1)
  const [signaturePosition, setSignaturePosition] = useState<SignaturePosition>('bottom-right')
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg'>('png')
  const [quality, setQuality] = useState(0.9)
  const [password, setPassword] = useState('')
  const [certificatePassword, setCertificatePassword] = useState('')
  const [signatureReason, setSignatureReason] = useState('I approve this document')
  const isImageToPdf = tool === 'image-to-pdf'
  const isImageSigning = tool === 'sign'
  const isCertifiedSigning = tool === 'sign-certified'
  const isMultiFileTool = tool === 'merge' || isImageSigning || isCertifiedSigning
  const selectedPdf = files.find((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  const selectedSignature = files.find((file) => file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/i.test(file.name))
  const selectedCertificate = files.find((file) => /\.(p12|pfx)$/i.test(file.name))
  const accepts = isImageToPdf ? 'image/png,image/jpeg,image/webp' : isImageSigning ? '.pdf,application/pdf,image/png,image/jpeg' : isCertifiedSigning ? '.pdf,.p12,.pfx,application/pdf,application/x-pkcs12' : '.pdf,application/pdf'

  const acceptFiles = (selected: FileList | null) => {
    if (!selected?.length) return
    const valid = isImageToPdf
      ? Array.from(selected).filter((file) => file.type.startsWith('image/'))
      : isCertifiedSigning
        ? Array.from(selected).filter((file) =>
            file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf') ||
            /\.(p12|pfx)$/i.test(file.name),
          )
        : isImageSigning
          ? Array.from(selected).filter((file) =>
              file.type === 'application/pdf' ||
              file.name.toLowerCase().endsWith('.pdf') ||
              file.type === 'image/png' ||
              file.type === 'image/jpeg' ||
              /\.(png|jpe?g)$/i.test(file.name),
            )
        : Array.from(selected).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (!valid.length) {
      setError(isImageToPdf ? 'Please choose image files.' : isImageSigning ? 'Choose a PDF and a PNG or JPEG signature image.' : 'Please choose PDF or certificate files.')
      return
    }
    setError('')
    setStatus('')
    setFiles((current) => isMultiFileTool ? [...current, ...valid] : valid)
  }

  const parseRange = (range: string, count: number) => {
    const indices = new Set<number>()
    range.split(',').forEach((part) => {
      const token = part.trim()
      if (!token) return
      if (token.includes('-')) {
        const [start, end] = token.split('-').map((value) => Number(value.trim()))
        if (Number.isInteger(start) && Number.isInteger(end)) {
          for (let page = Math.max(1, start); page <= Math.min(count, end); page++) indices.add(page - 1)
        }
      } else {
        const page = Number(token)
        if (Number.isInteger(page) && page >= 1 && page <= count) indices.add(page - 1)
      }
    })
    return [...indices]
  }

  const process = async () => {
    if (!files.length) { setError('Choose a file first.'); return }
    setBusy(true)
    setError('')
    setStatus('Processing locally...')
    let completionMessage = 'Download ready'
    try {
      if (tool === 'merge') {
        const bytes = await mergePdfFiles(files)
        downloadBytes(bytes, 'merged.pdf')
      } else if (tool === 'split') {
        const loaded = await loadPdf(await files[0].arrayBuffer())
        const indices = parseRange(pageRange, loaded.numPages)
        if (!indices.length) throw new Error('Enter a valid page range, for example 1-3 or 2,5.')
        const bytes = await extractPdfPages(files[0], indices)
        downloadBytes(bytes, 'split-pages.pdf')
      } else if (tool === 'rotate') {
        const loaded = await loadPdf(await files[0].arrayBuffer())
        const bytes = await rotatePdf(files[0], Array.from({ length: loaded.numPages }, () => rotation))
        downloadBytes(bytes, 'rotated.pdf')
      } else if (tool === 'compress') {
        const source = await files[0].arrayBuffer()
        const result = await compressPdf(source, compressionMode, { quality: compressionQuality })
        downloadBytes(result.bytes, 'compressed.pdf')
        const reduction = Math.max(0, Math.round((1 - result.bytes.length / source.byteLength) * 100))
        completionMessage = result.strategy === 'original'
          ? `This PDF was already efficiently compressed; no smaller output was possible without more degradation (${formatFileSize(source.byteLength)}).`
          : `Reduced from ${formatFileSize(source.byteLength)} to ${formatFileSize(result.bytes.length)} (${reduction}% smaller).`
      } else if (tool === 'organize') {
        const pdf = await PDFDocument.load(await files[0].arrayBuffer())
        const range = parseRange(pageRange || `1-${pdf.getPageCount()}`, pdf.getPageCount())
        const output = await PDFDocument.create()
        const pages = await output.copyPages(pdf, range)
        pages.forEach((page) => { page.setRotation(degrees(rotation)); output.addPage(page) })
        downloadBytes(await output.save(), 'organized.pdf')
      } else if (tool === 'pdf-to-text') {
        const text = await extractPdfText(files[0])
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'extracted-text.txt'
        link.click()
        URL.revokeObjectURL(url)
      } else if (tool === 'pdf-to-image') {
        const pdf = await loadPdf(await files[0].arrayBuffer())
        const zip = new JSZip()
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const canvas = document.createElement('canvas')
          await renderPage(pdf, pageNumber, canvas, 2)
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png', quality))
          if (blob) zip.file(`page-${pageNumber}.${outputFormat === 'jpeg' ? 'jpg' : 'png'}`, await blob.arrayBuffer())
        }
        downloadBytes(await zip.generateAsync({ type: 'uint8array' }), 'pdf-pages.zip', 'application/zip')
      } else if (tool === 'image-to-pdf') {
        const output = await PDFDocument.create()
        for (const file of files) {
          const bytes = await file.arrayBuffer()
          const image = file.type === 'image/png' ? await output.embedPng(bytes) : await output.embedJpg(bytes)
          const page = output.addPage([image.width, image.height])
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
        }
        downloadBytes(await output.save(), 'images.pdf')
      } else if (tool === 'watermark') {
        downloadBytes(await addWatermark(await files[0].arrayBuffer(), watermark, watermarkPattern), 'watermarked.pdf')
      } else if (tool === 'sign') {
        const pdfFile = selectedPdf
        const signatureFile = selectedSignature
        if (!pdfFile) throw new Error('Choose a PDF file.')
        if (!signatureFile) throw new Error('Choose a PNG or JPEG signature image.')
        const imageType = signatureFile.type === 'image/png' || /\.png$/i.test(signatureFile.name) ? 'png' : 'jpeg'
        const bytes = await signPdfWithImage(
          await pdfFile.arrayBuffer(),
          await signatureFile.arrayBuffer(),
          imageType,
          signaturePage,
          signaturePosition,
        )
        downloadBytes(bytes, 'signed.pdf')
      } else if (tool === 'protect') {
        if (password.length < 6) throw new Error('Choose a password with at least 6 characters.')
        const encrypted = await encryptPDF(new Uint8Array(await files[0].arrayBuffer()), password)
        downloadBytes(encrypted, 'protected.pdf')
      } else if (tool === 'ocr') {
        const { recognize } = await import('tesseract.js')
        const pdf = await loadPdf(await files[0].arrayBuffer())
        const parts: string[] = []
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const canvas = document.createElement('canvas')
          await renderPage(pdf, pageNumber, canvas, 2)
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to render this PDF page')), 'image/png')
          })
          const result = await recognize(blob, 'eng')
          parts.push(`Page ${pageNumber}\n${result.data.text.trim()}`)
          setStatus(`OCR page ${pageNumber} of ${pdf.numPages}`)
        }
        const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'ocr-text.txt'
        link.click()
        URL.revokeObjectURL(url)
      } else if (tool === 'sign-certified') {
        const pdfFile = selectedPdf
        const certificateFile = selectedCertificate
        if (!pdfFile) throw new Error('Choose a PDF file.')
        if (!certificateFile) throw new Error('Select the PDF first, then a P12/PFX certificate file.')
        if (!certificatePassword) throw new Error('Enter the certificate password.')
        const { PDF, P12Signer } = await import('@libpdf/core')
        const pdf = await PDF.load(new Uint8Array(await pdfFile.arrayBuffer()))
        const signer = await P12Signer.create(new Uint8Array(await certificateFile.arrayBuffer()), certificatePassword)
        const signed = await pdf.sign({ signer, reason: signatureReason })
        downloadBytes(signed.bytes, 'certified-signed.pdf')
      } else {
        throw new Error('This dedicated tool is available in the PDF editor; processing is not yet implemented for this route.')
      }
      setStatus(completionMessage)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to process this file')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-page">
      <Header />
      <main className="container tool-content">
        <div className="section-heading"><h1>{copy.title}</h1><p>{copy.description}</p></div>
        <div className="tool-workspace">
          <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFiles(event.dataTransfer.files) }}>
            <div className="drop-icon"><Upload size={28} /></div>
            <h3>{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : isImageToPdf ? 'Choose image files' : 'Choose PDF files'}</h3>
            <p>{files.length ? files.map((file) => file.name).join(', ') : 'Files are processed locally in your browser'}</p>
            <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>Browse files</button>
          </div>
          <input ref={inputRef} hidden type="file" accept={accepts} multiple onChange={(event) => { acceptFiles(event.target.files); event.target.value = '' }} />
          {tool === 'merge' && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: '#777487', fontSize: 13 }}>Select at least two PDFs. Add files in separate selections if needed; they will be combined from top to bottom.</p>
              {files.length > 0 && (
                <ol style={{ display: 'grid', gap: 8, paddingLeft: 24 }}>
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                      <span style={{ overflowWrap: 'anywhere' }}>{file.name}</span>
                      <span style={{ display: 'flex', flexShrink: 0, gap: 4 }}>
                        <button className="icon-button" type="button" aria-label={`Move ${file.name} up`} disabled={index === 0} onClick={() => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? current[index - 1] : itemIndex === index - 1 ? current[index] : item))}><ArrowUp size={15} /></button>
                        <button className="icon-button" type="button" aria-label={`Move ${file.name} down`} disabled={index === files.length - 1} onClick={() => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? current[index + 1] : itemIndex === index + 1 ? current[index] : item))}><ArrowDown size={15} /></button>
                        <button className="icon-button" type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {['split', 'rotate', 'organize'].includes(tool) && <div className="form" style={{ marginTop: 18 }}>
            {tool === 'split' && <label className="field">Page range<input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-3, 5" /></label>}
            {tool === 'rotate' && <label className="field">Rotation<select value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>270° clockwise</option></select></label>}
            {tool === 'organize' && <><label className="field">Keep and order pages<input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-3,5" /></label><label className="field">Add rotation<select value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value={0}>No rotation</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label></>}
          </div>}
          {tool === 'compress' && <div className="form" style={{ marginTop: 18 }}>
            <label className="field">Compression mode<select aria-label="Compression mode" value={compressionMode} onChange={(event) => setCompressionMode(event.target.value as 'lossless' | 'lossy')}>
              <option value="lossless">Preserve text and vector content (lossless)</option>
              <option value="lossy">Smaller file (lossy, rasterizes pages)</option>
            </select></label>
            {compressionMode === 'lossless'
              ? <p style={{ color: '#777487', fontSize: 13, margin: 0 }}>Keeps selectable text and vector content. Already-optimized PDFs may not get smaller.</p>
              : <>
                  <label className="field">JPEG quality: {Math.round(compressionQuality * 100)}%<input aria-label="Compression quality" type="range" min=".3" max=".85" step=".05" value={compressionQuality} onChange={(event) => setCompressionQuality(Number(event.target.value))} /></label>
                  <p style={{ color: '#9a5a18', fontSize: 13, margin: 0 }}>Lossy mode converts each page to an image. Text will no longer be selectable/searchable, and vector content is flattened.</p>
                </>}
          </div>}
          {tool === 'watermark' && <div className="form" style={{ marginTop: 18 }}>
            <label className="field">Watermark text<input value={watermark} onChange={(event) => setWatermark(event.target.value)} /></label>
            <label className="field">Watermark pattern<select aria-label="Watermark pattern" value={watermarkPattern} onChange={(event) => setWatermarkPattern(event.target.value as WatermarkPattern)}>
              <option value="single">Single diagonal</option>
              <option value="diagonal">Repeated diagonal</option>
              <option value="grid">Repeated grid</option>
            </select></label>
          </div>}
          {tool === 'protect' && <div className="form" style={{ marginTop: 18 }}>
            <label className="field">Open password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
          </div>}
          {tool === 'sign-certified' && <div className="form" style={{ marginTop: 18 }}>
            <label className="field">P12/PFX password<input type="password" value={certificatePassword} onChange={(event) => setCertificatePassword(event.target.value)} /></label>
            <label className="field">Signature reason<input value={signatureReason} onChange={(event) => setSignatureReason(event.target.value)} /></label>
            <p style={{ color: '#777487', fontSize: 13 }}>Choose the PDF and P12/PFX certificate together. A trusted certificate is required for external trust validation.</p>
          </div>}
          {tool === 'pdf-to-image' && <div className="form" style={{ marginTop: 18 }}><label className="field">Format<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as 'png' | 'jpeg')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label><label className="field">JPEG quality<input type="range" min=".5" max="1" step=".05" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label></div>}
          {tool === 'sign' && <div className="form" style={{ marginTop: 18 }}>
            <label className="field">Page number<input aria-label="Signature page number" type="number" min="1" value={signaturePage} onChange={(event) => setSignaturePage(Number(event.target.value))} /></label>
            <label className="field">Signature position<select aria-label="Signature position" value={signaturePosition} onChange={(event) => setSignaturePosition(event.target.value as SignaturePosition)}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="top-right">Top right</option>
              <option value="top-left">Top left</option>
            </select></label>
            <p style={{ color: '#777487', fontSize: 13, margin: 0 }}>Select the PDF and PNG/JPEG together or in separate selections. The signature keeps its aspect ratio. This is an electronic image signature, not a certified digital signature.</p>
          </div>}
          {error && <div className="error-message" role="alert">{error}</div>}
          {status && <p style={{ color: '#20a879', fontSize: 13 }}>{status}</p>}
          <button className="button button-primary" type="button" onClick={process} disabled={busy || !files.length || (tool === 'merge' && files.length < 2) || (isImageSigning && (!selectedPdf || !selectedSignature)) || (isCertifiedSigning && (!selectedPdf || !selectedCertificate))} style={{ width: '100%', marginTop: 18 }}><Download size={16} /> {busy ? 'Processing...' : 'Process & download'}</button>
        </div>
      </main>
    </div>
  )
}
