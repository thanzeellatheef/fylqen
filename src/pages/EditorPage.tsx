import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Highlighter, ImagePlus, MousePointer2, Pencil, Search, SlidersHorizontal, SquareDashed, Trash2, Type, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react'
import Logo from '../components/Logo'
import { useAppStore } from '../store/appStore'
import { loadPdf, renderPage, exportAnnotatedPdf, type Annotation } from '../services/pdfService'
import { saveDocument } from '../services/storage'
import type * as PdfJs from 'pdfjs-dist'

type ShapeTool = 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star'
type Tool = 'select' | 'text' | 'existingText' | 'highlight' | ShapeTool | 'draw' | 'signature' | 'image' | 'replaceImage'
type FontFamily = NonNullable<Annotation['fontFamily']>
type TextSettings = {
  color: string
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  alignment: NonNullable<Annotation['alignment']>
  textBackgroundColor?: string
}

const shapeTools: ShapeTool[] = ['rectangle', 'circle', 'ellipse', 'line', 'arrow', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star']

function isShapeTool(tool: Tool): tool is ShapeTool {
  return shapeTools.includes(tool as ShapeTool)
}

function baseFontFamily(fontFamily: FontFamily): FontFamily {
  if (fontFamily.startsWith('Courier')) return 'Courier'
  if (fontFamily.startsWith('TimesRoman')) return 'TimesRoman'
  if (fontFamily.startsWith('Helvetica')) return 'Helvetica'
  return fontFamily
}

function getShapePoints(type: ShapeTool) {
  const count = type === 'triangle' ? 3 : type === 'diamond' ? 4 : type === 'pentagon' ? 5 : type === 'hexagon' ? 6 : 10
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
    const radius = type === 'star' && index % 2 === 1 ? 0.42 : 1
    return {
      x: 50 + Math.cos(angle) * 48 * radius,
      y: 50 + Math.sin(angle) * 48 * radius,
    }
  })
}

type TextSpan = {
  str: string
  width: number
  height: number
  transform: number[]
  left: number
  top: number
  screenWidth: number
  screenHeight: number
  pdfX: number
  pdfY: number
  pdfWidth: number
  pdfHeight: number
  fontSize: number
}

type SearchMatch = {
  page: number
  x: number
  y: number
  width: number
  height: number
}

type TextEntryTarget =
  | { kind: 'new'; page: number; x: number; y: number }
  | { kind: 'replacement'; page: number; span: TextSpan; pageSize: { width: number; height: number } }

function sampleBackgroundColor(
  canvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
  area: { x: number; y: number; width: number; height: number },
) {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return '#ffffff'

  const ratioX = canvas.width / size.width
  const ratioY = canvas.height / size.height
  const offset = 3
  const centerX = area.x + area.width / 2
  const centerY = area.y + area.height / 2
  const points = [
    [area.x - offset, centerY],
    [area.x + area.width + offset, centerY],
    [centerX, area.y - offset],
    [centerX, area.y + area.height + offset],
    [area.x - offset, area.y - offset],
    [area.x + area.width + offset, area.y - offset],
    [area.x - offset, area.y + area.height + offset],
    [area.x + area.width + offset, area.y + area.height + offset],
  ]
  const channels: number[][] = [[], [], []]

  for (const [x, y] of points) {
    const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round(x! * ratioX)))
    const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round(y! * ratioY)))
    const pixel = context.getImageData(pixelX, pixelY, 1, 1).data
    const alpha = pixel[3] / 255
    for (let channel = 0; channel < 3; channel++) {
      channels[channel].push(Math.round(pixel[channel] * alpha + 255 * (1 - alpha)))
    }
  }

  const median = channels.map((values) => {
    values.sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)].toString(16).padStart(2, '0')
  })
  return `#${median.join('')}`
}

function PageView({
  pdf, pageNumber, scale, tool, annotations, setAnnotations, selectedId, setSelectedId, pendingImage, replacementArea, shapeStyle, highlightColor, searchMatches, onImagePlaced, onReplaceAreaSelected, onRequestTextEntry,
}: {
  pdf: PdfJs.PDFDocumentProxy
  pageNumber: number
  scale: number
  tool: Tool
  annotations: Annotation[]
  setAnnotations: (annotations: Annotation[]) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  pendingImage: { dataUrl: string; aspectRatio: number } | null
  replacementArea: { page: number; x: number; y: number; width: number; height: number; backgroundColor: string } | null
  shapeStyle: { color: string; lineWidth: number }
  highlightColor: string
  searchMatches: SearchMatch[]
  onImagePlaced: () => void
  onReplaceAreaSelected: (area: { page: number; x: number; y: number; width: number; height: number; backgroundColor: string }) => void
  onRequestTextEntry: (target: TextEntryTarget) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 612, height: 792 })
  const [visible, setVisible] = useState(false)
  const [textSpans, setTextSpans] = useState<TextSpan[]>([])
  const drawingRef = useRef<{ x: number; y: number }[] | null>(null)
  const imageSelectionRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [imageSelection, setImageSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const interactionRef = useRef<{
    mode: 'move' | 'resize'
    start: { x: number; y: number }
    original: Annotation
  } | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '300px' })
    if (hostRef.current) observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !canvasRef.current) return
    renderPage(pdf, pageNumber, canvasRef.current, scale).then(setSize).catch(console.error)
  }, [pdf, pageNumber, scale, visible])

  useEffect(() => {
    if (!visible) return
    let active = true
    pdf.getPage(pageNumber).then(async (page) => {
      const content = await page.getTextContent()
      const viewport = page.getViewport({ scale })
      if (!active) return
      setTextSpans(content.items.flatMap((item) =>
        'str' in item
          ? (() => {
              const pdfX = item.transform[4] ?? 0
              const pdfY = item.transform[5] ?? 0
              const fontSize = Math.abs(item.transform[3] || item.height || 12)
              const point = viewport.convertToViewportPoint(pdfX, pdfY)
              const screenHeight = fontSize * scale
              return [{
                str: item.str,
                width: item.width,
                height: item.height,
                transform: item.transform,
                left: point[0],
                top: point[1] - screenHeight,
                screenWidth: item.width * scale,
                screenHeight,
                pdfX,
                pdfY,
                pdfWidth: item.width,
                pdfHeight: fontSize,
                fontSize,
              }]
            })()
          : [],
      ))
    }).catch(console.error)
    return () => { active = false }
  }, [pdf, pageNumber, visible, scale])

  const pageAnnotations = annotations.filter((item) => item.page === pageNumber)
  const pageSearchMatches = searchMatches.filter((item) => item.page === pageNumber)
  const visibleImageSelection = imageSelection ?? (replacementArea?.page === pageNumber ? replacementArea : null)

  const normalizedPoint = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'select') {
      if (event.target === event.currentTarget) setSelectedId(null)
      return
    }
    const point = normalizedPoint(event)
    if (tool === 'image' && pendingImage) {
      const width = Math.min(0.25, 0.6 * size.height * pendingImage.aspectRatio / size.width)
      const height = width * size.width / pendingImage.aspectRatio / size.height
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        page: pageNumber,
        type: 'image',
        x: Math.min(point.x, 1 - width),
        y: Math.min(point.y, 1 - height),
        width,
        height,
        dataUrl: pendingImage.dataUrl,
      }
      setAnnotations([...annotations, annotation])
      setSelectedId(annotation.id)
      onImagePlaced()
    } else if (tool === 'replaceImage') {
      imageSelectionRef.current = { start: point, end: point }
      setImageSelection({ x: point.x, y: point.y, width: 0, height: 0 })
      event.currentTarget.setPointerCapture(event.pointerId)
    } else if (tool === 'text') {
      onRequestTextEntry({ kind: 'new', page: pageNumber, ...point })
    } else if (isShapeTool(tool)) {
      const width = 0.14
      const height = tool === 'circle' ? width * size.width / size.height : 0.09
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        page: pageNumber,
        type: tool,
        x: point.x,
        y: point.y,
        width,
        height,
        ...shapeStyle,
      }
      setAnnotations([...annotations, annotation])
      setSelectedId(annotation.id)
    } else if (tool === 'draw') {
      drawingRef.current = [point]
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'replaceImage' && imageSelectionRef.current) {
      const { start } = imageSelectionRef.current
      const end = normalizedPoint(event)
      imageSelectionRef.current.end = end
      setImageSelection({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      })
    } else if (tool === 'draw' && drawingRef.current) {
      drawingRef.current.push(normalizedPoint(event))
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (tool === 'highlight') {
      const selection = window.getSelection()
      const hostRect = hostRef.current?.getBoundingClientRect()
      if (selection && !selection.isCollapsed && hostRect) {
        const highlights = Array.from(selection.getRangeAt(0).getClientRects()).flatMap((rect): Annotation[] => {
          const left = Math.max(rect.left, hostRect.left)
          const top = Math.max(rect.top, hostRect.top)
          const right = Math.min(rect.right, hostRect.right)
          const bottom = Math.min(rect.bottom, hostRect.bottom)
          if (right <= left || bottom <= top) return []
          return [{
            id: crypto.randomUUID(),
            page: pageNumber,
            type: 'highlight',
            x: (left - hostRect.left) / hostRect.width,
            y: (top - hostRect.top) / hostRect.height,
            width: (right - left) / hostRect.width,
            height: (bottom - top) / hostRect.height,
            color: highlightColor,
            opacity: 0.55,
          }]
        })
        if (highlights.length) setAnnotations([...annotations, ...highlights])
        selection.removeAllRanges()
      }
    }
    if (tool === 'draw' && drawingRef.current?.length) {
      setAnnotations([...annotations, { id: crypto.randomUUID(), page: pageNumber, type: 'draw', x: 0, y: 0, width: 1, height: 1, points: drawingRef.current, color: '#7059e8' }])
    }
    if (tool === 'replaceImage' && imageSelectionRef.current) {
      const { start } = imageSelectionRef.current
      const end = normalizedPoint(event)
      const area = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      }
      if (area.width > 0.01 && area.height > 0.01) {
        const backgroundColor = sampleBackgroundColor(canvasRef.current, size, area)
        onReplaceAreaSelected({ page: pageNumber, ...area, backgroundColor })
      }
    }
    drawingRef.current = null
    imageSelectionRef.current = null
    setImageSelection(null)
    interactionRef.current = null
  }

  const beginAnnotationInteraction = (
    event: React.PointerEvent<HTMLElement>,
    item: Annotation,
    mode: 'move' | 'resize',
  ) => {
    event.stopPropagation()
    if (tool !== 'select') return
    setSelectedId(item.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      mode,
      start: { x: event.clientX, y: event.clientY },
      original: { ...item },
    }
  }

  const handleAnnotationPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (!interaction) return
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = (event.clientX - interaction.start.x) / rect.width
    const dy = (event.clientY - interaction.start.y) / rect.height
    const original = interaction.original
    const next = interaction.mode === 'move'
      ? {
          ...original,
          x: Math.max(0, Math.min(1 - original.width, original.x + dx)),
          y: Math.max(0, Math.min(1 - original.height, original.y + dy)),
        }
      : {
          ...original,
          width: Math.max(0.04, Math.min(1 - original.x, original.width + dx)),
          height: Math.max(0.02, Math.min(1 - original.y, original.height + dy)),
        }
    setAnnotations(annotations.map((item) => item.id === original.id ? next : item))
  }

  return (
    <div id={`pdf-page-${pageNumber}`} ref={hostRef} className="pdf-page-host" style={{ position: 'relative', width: size.width, height: size.height, margin: '18px auto', background: 'white', boxShadow: '0 8px 30px rgba(33,29,56,.12)' }}>
      <canvas ref={canvasRef} />
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ position: 'absolute', inset: 0, cursor: tool === 'highlight' ? 'text' : tool === 'select' ? 'default' : 'crosshair', touchAction: tool === 'highlight' ? 'auto' : 'none' }}
      >
        {pageSearchMatches.map((match, index) => (
          <div
            key={`search-${index}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${match.x * 100}%`,
              top: `${match.y * 100}%`,
              width: `${match.width * 100}%`,
              height: `${match.height * 100}%`,
              background: 'rgba(255, 190, 0, .38)',
              outline: '1px solid rgba(226, 145, 0, .7)',
              pointerEvents: 'none',
            }}
          />
        ))}
        {tool === 'highlight' && textSpans.map((span, index) => (
          <span
            key={`selectable-text-${span.pdfX}-${span.pdfY}-${index}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: span.left,
              top: span.top,
              width: span.screenWidth,
              height: span.screenHeight,
              overflow: 'visible',
              color: 'transparent',
              fontSize: span.screenHeight,
              lineHeight: 1,
              whiteSpace: 'pre',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              pointerEvents: 'auto',
            }}
          >
            {span.str}
          </span>
        ))}
        {tool === 'existingText' && textSpans.map((span, index) => {
          if (!span.str.trim()) return null
          return (
            <button
              key={`${span.pdfX}-${span.pdfY}-${index}`}
              type="button"
              title={`Replace "${span.str}"`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRequestTextEntry({ kind: 'replacement', page: pageNumber, span, pageSize: size })
              }}
              style={{
                position: 'absolute',
                left: span.left,
                top: span.top,
                width: Math.max(span.screenWidth, 12),
                height: Math.max(span.screenHeight, 8),
                border: '1px dashed rgba(112,89,232,.55)',
                background: 'rgba(112,89,232,.06)',
                borderRadius: 2,
                padding: 0,
              }}
              aria-label={`Replace text: ${span.str}`}
            />
          )
        })}
        {pageAnnotations.map((item) => (
          (() => {
            const replacementWidth = item.type === 'existingText' && item.text
              ? Math.max(item.width * size.width, item.text.length * (item.fontSize ?? 12) * scale * 0.6)
              : item.width * size.width
            const fontFamily = item.fontFamily ?? 'Helvetica'
            const cssFontFamily = fontFamily.startsWith('TimesRoman')
              ? '"Times New Roman", serif'
              : fontFamily.startsWith('Courier')
                ? '"Courier New", monospace'
                : fontFamily === 'Symbol'
                  ? 'Symbol, serif'
                  : fontFamily === 'ZapfDingbats'
                    ? '"Zapf Dingbats", sans-serif'
                    : 'Helvetica, Arial, sans-serif'
            const isCustomShape = ['triangle', 'diamond', 'pentagon', 'hexagon', 'star'].includes(item.type)
            const decoration = [item.underline && 'underline', item.strikethrough && 'line-through'].filter(Boolean).join(' ')
            return (
          <div
            key={item.id}
            onPointerDown={(event) => beginAnnotationInteraction(event, item, 'move')}
            onPointerMove={handleAnnotationPointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: 'absolute',
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: item.type === 'existingText' ? replacementWidth : `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              color: item.color,
              background: item.type === 'highlight' ? 'rgba(255, 224, 102, .55)' : item.type === 'existingText' ? item.textBackgroundColor ?? 'white' : item.type === 'replaceImage' ? item.backgroundColor ?? 'white' : item.type === 'text' ? item.textBackgroundColor ?? 'transparent' : item.type === 'image' || item.type === 'signature' || isCustomShape || item.type === 'line' || item.type === 'arrow' ? 'transparent' : 'rgba(112,89,232,.04)',
              border: isCustomShape || item.type === 'line' || item.type === 'arrow'
                ? selectedId === item.id ? '1px dashed #7059e8' : 'none'
                : selectedId === item.id
                  ? '2px solid #7059e8'
                  : item.type === 'text' || item.type === 'existingText' || item.type === 'image' || item.type === 'signature' || item.type === 'replaceImage'
                    ? '1px solid transparent'
                    : `${item.lineWidth ?? 1.5}px solid ${item.color ?? '#7059e8'}`,
              borderRadius: item.type === 'circle' || item.type === 'ellipse' ? '50%' : 2,
              fontSize: item.type === 'existingText' || item.type === 'text' ? (item.fontSize ?? 12) * scale : 12,
              fontWeight: item.bold || fontFamily.includes('Bold') ? 700 : 400,
              fontStyle: item.italic || fontFamily.includes('Italic') || fontFamily.includes('Oblique') ? 'italic' : 'normal',
              textDecoration: decoration || 'none',
              textAlign: item.alignment ?? 'left',
              fontFamily: cssFontFamily,
              padding: item.type === 'text' ? 4 : 0,
              lineHeight: 1,
              whiteSpace: item.type === 'existingText' ? 'nowrap' : undefined,
              boxSizing: 'content-box',
              overflow: item.type === 'image' || item.type === 'replaceImage' || item.type === 'signature' ? 'hidden' : undefined,
              opacity: item.opacity ?? 1,
              pointerEvents: tool === 'select' ? 'auto' : 'none',
            }}
          >
            {item.type === 'text' || item.type === 'existingText' ? item.text : ''}
            {(item.type === 'line' || item.type === 'arrow') && (
              <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                {item.type === 'arrow' && <defs><marker id={`arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 Z" fill={item.color ?? '#7059e8'} /></marker></defs>}
                <line x1="0" y1="0" x2="100%" y2="100%" stroke={item.color ?? '#7059e8'} strokeWidth={item.lineWidth ?? 1.5} markerEnd={item.type === 'arrow' ? `url(#arrow-${item.id})` : undefined} />
              </svg>
            )}
            {isCustomShape && isShapeTool(item.type) && (
              <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                <polygon points={getShapePoints(item.type).map((point) => `${point.x}%,${point.y}%`).join(' ')} fill="none" stroke={item.color ?? '#7059e8'} strokeWidth={item.lineWidth ?? 1.5} />
              </svg>
            )}
            {item.dataUrl && (item.type === 'image' || item.type === 'replaceImage' || item.type === 'signature') && (
              <img src={item.dataUrl} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
            {selectedId === item.id && tool === 'select' && (
              <button
                type="button"
                aria-label="Resize annotation"
                onPointerDown={(event) => beginAnnotationInteraction(event, item, 'resize')}
                onPointerMove={handleAnnotationPointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  position: 'absolute',
                  right: -6,
                  bottom: -6,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid white',
                  background: '#7059e8',
                  padding: 0,
                  cursor: 'nwse-resize',
                }}
              />
            )}
          </div>
            )
          })()
        ))}
        {visibleImageSelection && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${visibleImageSelection.x * 100}%`,
              top: `${visibleImageSelection.y * 100}%`,
              width: `${visibleImageSelection.width * 100}%`,
              height: `${visibleImageSelection.height * 100}%`,
              border: '2px dashed #7059e8',
              background: 'rgba(112,89,232,.12)',
              pointerEvents: 'none',
            }}
          />
        )}
        {pageAnnotations.filter((item) => item.type === 'draw').map((item) =>
          <svg key={item.id} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <polyline points={item.points?.map((point) => `${point.x * size.width},${point.y * size.height}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2" />
          </svg>,
        )}
      </div>
    </div>
  )
}

export default function EditorPage() {
  const file = useAppStore((state) => state.selectedFile)
  const [pdf, setPdf] = useState<PdfJs.PDFDocumentProxy | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [scale, setScale] = useState(() => window.innerWidth <= 560 ? Math.max(0.35, Math.min(1, (window.innerWidth - 24) / 612)) : 1)
  const [tool, setTool] = useState<Tool>('select')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [history, setHistory] = useState<Annotation[][]>([])
  const [redo, setRedo] = useState<Annotation[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobilePropertiesOpen, setMobilePropertiesOpen] = useState(false)
  const [textEntryTarget, setTextEntryTarget] = useState<TextEntryTarget | null>(null)
  const [textEntryValue, setTextEntryValue] = useState('')
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; aspectRatio: number } | null>(null)
  const [replacementArea, setReplacementArea] = useState<{ page: number; x: number; y: number; width: number; height: number; backgroundColor: string } | null>(null)
  const [textStyle, setTextStyle] = useState<TextSettings>({
    color: '#211d38',
    fontSize: 12,
    fontFamily: 'Helvetica',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    alignment: 'left',
  })
  const [shapeStyle, setShapeStyle] = useState({ color: '#7059e8', lineWidth: 2 })
  const [highlightColor, setHighlightColor] = useState('#ffe066')
  const [shapesOpen, setShapesOpen] = useState(false)
  const [status, setStatus] = useState(file ? 'Loading...' : 'No document')
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])

  useEffect(() => {
    if (!file) return
    let active = true
    file.arrayBuffer().then(async (buffer) => {
      try {
        const bytes = new Uint8Array(buffer)
        const loaded = await loadPdf(bytes)
        if (!active) return
        setPdfBytes(bytes)
        setPdf(loaded)
        setStatus('Saved locally')
        await saveDocument(file)
      } catch (caught) {
        if (active) {
          const message = caught instanceof Error ? caught.message : 'Unable to open this PDF'
          setError(/password/i.test(message) ? 'This PDF is password-protected. Password unlocking is not supported in browser-only editing.' : 'Unable to parse this PDF. The file may be damaged or unsupported.')
          setStatus('Open failed')
        }
      }
    })
    return () => { active = false }
  }, [file])

  useEffect(() => {
    if (!file || !annotations.length) return
    const timer = window.setTimeout(() => {
      setStatus((current) => current === 'Saving...' ? 'Saved locally' : current)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [annotations, file])

  const updateAnnotations = (next: Annotation[]) => {
    setHistory((items) => [...items.slice(-29), annotations])
    setRedo([])
    setAnnotations(next)
    setStatus('Saving...')
  }

  const selectedAnnotation = annotations.find((item) => item.id === selectedId)
  const selectedText = selectedAnnotation && (selectedAnnotation.type === 'text' || selectedAnnotation.type === 'existingText')
    ? selectedAnnotation
    : null
  const selectedShape = selectedAnnotation && isShapeTool(selectedAnnotation.type)
    ? selectedAnnotation
    : null
  const activeTextStyle = {
    ...textStyle,
    ...(selectedText ? {
      color: selectedText.color ?? textStyle.color,
      fontSize: selectedText.fontSize ?? textStyle.fontSize,
      fontFamily: selectedText.fontFamily ?? textStyle.fontFamily,
      bold: selectedText.bold ?? false,
      italic: selectedText.italic ?? false,
      underline: selectedText.underline ?? false,
      strikethrough: selectedText.strikethrough ?? false,
      alignment: selectedText.alignment ?? 'left',
      textBackgroundColor: selectedText.textBackgroundColor,
    } : {}),
  }
  const activeShapeStyle = {
    ...shapeStyle,
    ...(selectedShape ? {
      color: selectedShape.color ?? shapeStyle.color,
      lineWidth: selectedShape.lineWidth ?? shapeStyle.lineWidth,
    } : {}),
  }

  const changeTextStyle = (patch: Partial<TextSettings>) => {
    setTextStyle((current) => ({ ...current, ...patch }))
    if (selectedText) {
      updateAnnotations(annotations.map((item) => item.id === selectedText.id ? { ...item, ...patch } : item))
    }
  }

  const changeShapeStyle = (patch: Partial<typeof shapeStyle>) => {
    setShapeStyle((current) => ({ ...current, ...patch }))
    if (selectedShape) {
      updateAnnotations(annotations.map((item) => item.id === selectedShape.id ? { ...item, ...patch } : item))
    }
  }

  const requestTextEntry = (target: TextEntryTarget) => {
    setTextEntryTarget(target)
    setTextEntryValue(target.kind === 'replacement' ? target.span.str : '')
  }

  const saveTextEntry = () => {
    const text = textEntryValue.trim()
    if (!text || !textEntryTarget) return

    if (textEntryTarget.kind === 'new') {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        page: textEntryTarget.page,
        type: 'text',
        x: textEntryTarget.x,
        y: textEntryTarget.y,
        width: 0.25,
        height: 0.05,
        text,
        ...textStyle,
      }
      updateAnnotations([...annotations, annotation])
      setSelectedId(annotation.id)
    } else {
      const { page, span, pageSize } = textEntryTarget
      const next = annotations.filter((item) =>
        !(item.type === 'existingText' && item.page === page && item.pdfX === span.pdfX && item.pdfY === span.pdfY),
      )
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        page,
        type: 'existingText',
        x: span.left / pageSize.width,
        y: span.top / pageSize.height,
        width: span.screenWidth / pageSize.width,
        height: span.screenHeight / pageSize.height,
        text,
        pdfX: span.pdfX,
        pdfY: span.pdfY,
        pdfWidth: span.pdfWidth,
        pdfHeight: span.pdfHeight,
        ...textStyle,
        fontSize: span.fontSize,
      }
      updateAnnotations([...next, annotation])
      setSelectedId(annotation.id)
    }
    setTextEntryTarget(null)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setRedo((items) => [annotations, ...items])
    setHistory((items) => items.slice(0, -1))
    setAnnotations(previous)
  }

  const redoAction = () => {
    const next = redo[0]
    if (!next) return
    setHistory((items) => [...items, annotations])
    setRedo((items) => items.slice(1))
    setAnnotations(next)
  }

  const deleteSelected = () => {
    if (selectedId) {
      updateAnnotations(annotations.filter((item) => item.id !== selectedId))
      setSelectedId(null)
    }
  }

  const addReplacementImage = (
    image: { dataUrl: string },
    area: { page: number; x: number; y: number; width: number; height: number; backgroundColor: string },
  ) => {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      ...area,
      type: 'replaceImage',
      dataUrl: image.dataUrl,
    }
    updateAnnotations([...annotations, annotation])
    setSelectedId(annotation.id)
    setPendingImage(null)
    setReplacementArea(null)
    setTool('select')
  }

  const download = async () => {
    if (!pdfBytes || !file) return
    setError('')
    setStatus('Preparing download...')
    try {
      const bytes = await exportAnnotatedPdf(pdfBytes, annotations)
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name.replace(/\.pdf$/i, '') + '-edited.pdf'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('Downloaded')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export this PDF')
      setStatus('Export failed')
    }
  }

  const handleImageFile = (event: React.ChangeEvent<HTMLInputElement>, imageTool: 'signature' | 'image' | 'replaceImage') => {
    const imageFile = event.target.files?.[0]
    event.target.value = ''
    if (!imageFile || !pdf) return
    const reader = new FileReader()
    reader.onerror = () => setError('Unable to read this image file.')
    reader.onload = () => {
      const source = new Image()
      source.onerror = () => setError('This image format is not supported.')
      source.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = source.naturalWidth
        canvas.height = source.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) {
          setError('Image processing is not supported in this browser.')
          return
        }
        context.drawImage(source, 0, 0)
        const image = { dataUrl: canvas.toDataURL('image/png'), aspectRatio: source.naturalWidth / source.naturalHeight }
        setError('')
        if (imageTool === 'signature') {
          const annotation: Annotation = {
            id: crypto.randomUUID(),
            page: 1,
            type: 'signature',
            x: 0.35,
            y: 0.35,
            width: 0.3,
            height: 0.15,
            dataUrl: image.dataUrl,
          }
          updateAnnotations([...annotations, annotation])
          setSelectedId(annotation.id)
        } else if (imageTool === 'replaceImage') {
          if (replacementArea) addReplacementImage(image, replacementArea)
          else setPendingImage(image)
        } else {
          setPendingImage(image)
          setTool(imageTool)
        }
      }
      source.src = String(reader.result)
    }
    reader.readAsDataURL(imageFile)
  }

  const search = async () => {
    if (!pdf || !searchQuery.trim()) { setSearchMatches([]); return }
    const query = searchQuery.trim().toLocaleLowerCase()
    const matches: SearchMatch[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const textItems = content.items.filter((item) => 'str' in item)
      const itemOffsets: { item: (typeof textItems)[number]; start: number; end: number }[] = []
      let text = ''
      for (const item of textItems) {
        const start = text.length
        text += item.str + ' '
        itemOffsets.push({ item, start, end: start + item.str.length })
      }
      const searchableText = text.toLocaleLowerCase()
      const viewport = page.getViewport({ scale: 1 })
      let matchStart = searchableText.indexOf(query)
      while (matchStart !== -1) {
        const matchEnd = matchStart + query.length
        for (const { item, start, end } of itemOffsets) {
          const segmentStart = Math.max(matchStart, start)
          const segmentEnd = Math.min(matchEnd, end)
          if (segmentStart >= segmentEnd || !item.str.length) continue
          const charWidth = item.width / item.str.length
          const [itemLeft, baseline] = viewport.convertToViewportPoint(item.transform[4] ?? 0, item.transform[5] ?? 0)
          const fontSize = Math.abs(item.transform[3] || item.height || 12)
          matches.push({
            page: pageNumber,
            x: (itemLeft + (segmentStart - start) * charWidth) / viewport.width,
            y: (baseline - fontSize) / viewport.height,
            width: ((segmentEnd - segmentStart) * charWidth) / viewport.width,
            height: fontSize / viewport.height,
          })
        }
        matchStart = searchableText.indexOf(query, matchStart + 1)
      }
    }
    setSearchMatches(matches)
    if (matches.length) {
      const firstPage = matches[0].page
      window.setTimeout(() => document.getElementById(`pdf-page-${firstPage}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
    }
  }

  const searchPages = [...new Set(searchMatches.map((match) => match.page))]
  const pages = useMemo(() => pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : [], [pdf])

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-brand" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link to="/"><Logo /></Link>
          <strong style={{ fontSize: 13 }}>{file?.name ?? 'Untitled document'}</strong>
          <span style={{ color: status.includes('failed') ? '#e45d68' : '#20a879', fontSize: 12 }}>{status}</span>
        </div>
        <div className="editor-actions" style={{ display: 'flex', gap: 7 }}>
          <button className="icon-button" type="button" aria-label="Undo" onClick={undo}><Undo2 size={17} /></button>
          <button className="icon-button" type="button" aria-label="Redo" onClick={redoAction}><Redo2 size={17} /></button>
          <button className="icon-button" type="button" aria-label="Zoom out" onClick={() => setScale((value) => Math.max(.35, value - .15))}><ZoomOut size={17} /></button>
          <span style={{ alignSelf: 'center', minWidth: 50, textAlign: 'center', fontSize: 12 }}>{Math.round(scale * 100)}%</span>
          <button className="icon-button" type="button" aria-label="Zoom in" onClick={() => setScale((value) => Math.min(2.5, value + .15))}><ZoomIn size={17} /></button>
          <button className="icon-button mobile-properties-toggle" type="button" aria-label="Toggle properties" aria-expanded={mobilePropertiesOpen} onClick={() => setMobilePropertiesOpen((open) => !open)}><SlidersHorizontal size={17} /></button>
          <button className="button button-primary" type="button" onClick={download} disabled={!pdf}><Download size={16} /> Download</button>
        </div>
      </header>
      <main className="editor-main">
        <aside className="editor-sidebar">
          <strong style={{ fontSize: 13 }}>Tools</strong>
          <div style={{ height: 10 }} />
          {selectedId && <button className="button button-secondary" type="button" onClick={deleteSelected} style={{ width: '100%', color: '#b13d48', marginBottom: 8 }}><Trash2 size={16} /> Delete selected</button>}
          {([
            ['select', 'Select', MousePointer2],
            ['text', 'Add text', Type],
            ['existingText', 'Edit existing text', Type],
            ['highlight', 'Highlight', Highlighter],
            ['draw', 'Freehand', Pencil],
            ['image', 'Add image', ImagePlus],
            ['replaceImage', 'Replace image', ImagePlus],
            ['signature', 'Signature image', ImagePlus],
          ] as [Tool, string, typeof MousePointer2][]).map(([value, label, Icon]) => (
            value === 'signature' || value === 'image'
              ? (
                <label key={value} className="button button-secondary" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 7, borderColor: tool === value ? '#7059e8' : undefined }}>
                  <Icon size={16} />
                  <span>{label}</span>
                  <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleImageFile(event, value)} />
                </label>
              )
              : (
                <button
                  key={value}
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    if (value === 'replaceImage') {
                      setTool('replaceImage')
                      setPendingImage(null)
                      setReplacementArea(null)
                    } else {
                      setTool(value)
                    }
                  }}
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 7, borderColor: tool === value ? '#7059e8' : undefined }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              )
          ))}
          <details open={shapesOpen} onToggle={(event) => setShapesOpen(event.currentTarget.open)} style={{ margin: '4px 0 10px', padding: 8, border: '1px solid #efedf5', borderRadius: 9 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Shapes</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 10 }}>
              {([
                ['rectangle', 'Rectangle'],
                ['circle', 'Circle'],
                ['ellipse', 'Ellipse'],
                ['line', 'Line'],
                ['arrow', 'Arrow'],
                ['triangle', 'Triangle'],
                ['diamond', 'Diamond'],
                ['pentagon', 'Pentagon'],
                ['hexagon', 'Hexagon'],
                ['star', 'Star'],
              ] as [ShapeTool, string][]).map(([value, label]) => (
                <button
                  key={value}
                  className="button button-secondary"
                  type="button"
                  aria-pressed={tool === value}
                  onClick={() => setTool(value)}
                  style={{ padding: '7px 4px', borderColor: tool === value ? '#7059e8' : undefined, fontSize: 12 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, fontSize: 12 }}>
              Shape color
              <input aria-label="Shape color" type="color" value={activeShapeStyle.color} onChange={(event) => changeShapeStyle({ color: event.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 12 }}>
              Stroke thickness: {activeShapeStyle.lineWidth}px
              <input aria-label="Shape stroke thickness" type="range" min="0.5" max="10" step="0.5" value={activeShapeStyle.lineWidth} onChange={(event) => changeShapeStyle({ lineWidth: Number(event.target.value) })} />
            </label>
          </details>
          {tool === 'highlight' && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '4px 0 10px', fontSize: 12 }}>
              Highlight color
              <input aria-label="Highlight color" type="color" value={highlightColor} onChange={(event) => setHighlightColor(event.target.value)} />
            </label>
          )}
          {pendingImage && tool === 'image' && <p style={{ fontSize: 12 }}>Click on the page to place the image.</p>}
          {tool === 'replaceImage' && <p style={{ fontSize: 12 }}>{pendingImage ? 'Now drag over the old image area.' : 'Drag over the old image area, or choose an image first.'}</p>}
          {tool === 'replaceImage' && (
            <label className="button button-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
              <ImagePlus size={16} /> {replacementArea ? 'Choose replacement image' : 'Choose image'}
              <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleImageFile(event, 'replaceImage')} />
            </label>
          )}
        </aside>
        <section className="canvas-wrap">
          {error && <div className="error-message" style={{ position: 'fixed', top: 72, zIndex: 20 }}>{error}</div>}
          {pdf ? pages.map((pageNumber) => (
            <PageView
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={scale}
              tool={tool}
              annotations={annotations}
              setAnnotations={updateAnnotations}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              pendingImage={pendingImage}
              replacementArea={replacementArea}
              shapeStyle={shapeStyle}
              highlightColor={highlightColor}
              searchMatches={searchMatches}
              onRequestTextEntry={requestTextEntry}
              onImagePlaced={() => { setPendingImage(null); setTool('select') }}
              onReplaceAreaSelected={(area) => {
                if (pendingImage) addReplacementImage(pendingImage, area)
                else setReplacementArea(area)
              }}
            />
          )) : (
            <div className="canvas-placeholder"><div><SquareDashed size={38} color="#7059e8" /><h2 style={{ margin: '14px 0 8px' }}>{file?.name ?? 'No document selected'}</h2><p>{error || (file ? 'Opening your PDF locally...' : 'Choose a PDF from the home page to begin.')}</p>{!file && <Link className="button button-primary" to="/" style={{ marginTop: 18 }}>Choose a PDF</Link>}</div></div>
          )}
        </section>
        <aside className={`editor-properties${mobilePropertiesOpen ? ' mobile-open' : ''}`}>
          <strong style={{ color: '#211d38' }}>Properties</strong>
          <p>{selectedId ? 'Selected annotation' : 'Select an annotation to inspect it.'}</p>
          <hr style={{ border: 0, borderTop: '1px solid #efedf5', margin: '18px 0' }} />
          <strong style={{ color: '#211d38', display: 'block', marginBottom: 8 }}>Search document</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} style={{ minWidth: 0, width: '100%', height: 38, border: '1px solid #efedf5', borderRadius: 8, padding: '0 8px' }} />
            <button className="icon-button" type="button" onClick={search} aria-label="Search"><Search size={16} /></button>
          </div>
          {searchMatches.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p>Matches highlighted on pages:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {searchPages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className="button button-secondary"
                    type="button"
                    onClick={() => document.getElementById(`pdf-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  >
                    Page {pageNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(tool === 'text' || tool === 'existingText' || selectedText) && (
            <section style={{ margin: '14px 0 10px', padding: 10, border: '1px solid #efedf5', borderRadius: 9 }}>
              <strong style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Text style</strong>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                PDF font
                <select value={activeTextStyle.fontFamily} onChange={(event) => {
                  const fontFamily = event.target.value as FontFamily
                  changeTextStyle({
                    fontFamily,
                    bold: fontFamily.includes('Bold'),
                    italic: fontFamily.includes('Italic') || fontFamily.includes('Oblique'),
                  })
                }}>
                  <option value="Courier">Courier</option>
                  <option value="CourierBold">Courier Bold</option>
                  <option value="CourierOblique">Courier Oblique</option>
                  <option value="CourierBoldOblique">Courier Bold Oblique</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="HelveticaBold">Helvetica Bold</option>
                  <option value="HelveticaOblique">Helvetica Oblique</option>
                  <option value="HelveticaBoldOblique">Helvetica Bold Oblique</option>
                  <option value="Symbol">Symbol</option>
                  <option value="TimesRoman">Times Roman</option>
                  <option value="TimesRomanBold">Times Roman Bold</option>
                  <option value="TimesRomanItalic">Times Roman Italic</option>
                  <option value="TimesRomanBoldItalic">Times Roman Bold Italic</option>
                  <option value="ZapfDingbats">Zapf Dingbats</option>
                </select>
              </label>
              {(activeTextStyle.fontFamily === 'Symbol' || activeTextStyle.fontFamily === 'ZapfDingbats') && (
                <small style={{ display: 'block', marginTop: 6, color: '#746d83', lineHeight: 1.4 }}>
                  Special-character font. Text it cannot encode is exported in Helvetica.
                </small>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Color
                  <input aria-label="Text color" type="color" value={activeTextStyle.color} onChange={(event) => changeTextStyle({ color: event.target.value })} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  Size
                  <input aria-label="Text size" type="number" min="6" max="96" value={activeTextStyle.fontSize} onChange={(event) => changeTextStyle({ fontSize: Math.min(96, Math.max(6, Number(event.target.value) || 6)) })} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12 }}>
                <label><input type="checkbox" checked={activeTextStyle.bold} disabled={activeTextStyle.fontFamily === 'Symbol' || activeTextStyle.fontFamily === 'ZapfDingbats'} onChange={(event) => changeTextStyle({ fontFamily: baseFontFamily(activeTextStyle.fontFamily), bold: event.target.checked })} /> Bold</label>
                <label><input type="checkbox" checked={activeTextStyle.italic} disabled={activeTextStyle.fontFamily === 'Symbol' || activeTextStyle.fontFamily === 'ZapfDingbats'} onChange={(event) => changeTextStyle({ fontFamily: baseFontFamily(activeTextStyle.fontFamily), italic: event.target.checked })} /> Italic</label>
                <label><input type="checkbox" checked={activeTextStyle.underline} onChange={(event) => changeTextStyle({ underline: event.target.checked })} /> Underline</label>
                <label><input type="checkbox" checked={activeTextStyle.strikethrough} onChange={(event) => changeTextStyle({ strikethrough: event.target.checked })} /> Strike</label>
              </div>
              <label style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 12 }}>
                Alignment
                <select value={activeTextStyle.alignment} onChange={(event) => changeTextStyle({ alignment: event.target.value as NonNullable<Annotation['alignment']> })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
                <label><input type="checkbox" checked={Boolean(activeTextStyle.textBackgroundColor)} onChange={(event) => changeTextStyle({ textBackgroundColor: event.target.checked ? activeTextStyle.textBackgroundColor ?? '#fff2a8' : undefined })} /> Text highlight</label>
                <input aria-label="Text highlight color" type="color" value={activeTextStyle.textBackgroundColor ?? '#fff2a8'} onChange={(event) => changeTextStyle({ textBackgroundColor: event.target.value })} />
              </div>
            </section>
          )}
          <p style={{ marginTop: 18 }}>Existing-text replacements flatten the exported PDF and remove its embedded text streams. Scanned text and unsupported fonts are not OCR-readable.</p>
        </aside>
      </main>
      {textEntryTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="text-entry-title" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(24,20,42,.35)' }}>
          <div style={{ width: 'min(420px, 100%)', padding: 20, borderRadius: 14, background: 'white', boxShadow: '0 18px 60px rgba(33,29,56,.2)' }}>
            <strong id="text-entry-title">{textEntryTarget.kind === 'new' ? 'Add text' : 'Replace existing text'}</strong>
            <textarea
              aria-label="Text content"
              autoFocus
              value={textEntryValue}
              onChange={(event) => setTextEntryValue(event.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 100, marginTop: 12, padding: 10, border: '1px solid #efedf5', borderRadius: 8, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="button button-secondary" type="button" onClick={() => setTextEntryTarget(null)}>Cancel</button>
              <button className="button button-primary" type="button" disabled={!textEntryValue.trim()} onClick={saveTextEntry}>
                {textEntryTarget.kind === 'new' ? 'Add text' : 'Replace text'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
