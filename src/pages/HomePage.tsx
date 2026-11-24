import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, FileText, LockKeyhole, Merge, Minimize2, PencilLine, RotateCw, ShieldCheck, Split, Upload, WandSparkles, Image, Droplets, ScanText, BadgeCheck, Sparkles } from 'lucide-react'
import Header from '../components/Header'
import Logo from '../components/Logo'
import { useAppStore } from '../store/appStore'

const tools = [
  { name: 'Edit PDF', description: 'Add text, images and annotations', icon: PencilLine, slug: 'edit' },
  { name: 'Merge PDF', description: 'Combine documents in any order', icon: Merge, slug: 'merge' },
  { name: 'Split PDF', description: 'Extract pages or page ranges', icon: Split, slug: 'split' },
  { name: 'Compress PDF', description: 'Reduce file size in your browser', icon: Minimize2, slug: 'compress' },
  { name: 'Organize PDF', description: 'Reorder, rotate and delete pages', icon: FileText, slug: 'organize' },
  { name: 'PDF to Image', description: 'Export pages as PNG or JPEG', icon: Image, slug: 'pdf-to-image' },
  { name: 'Sign PDF', description: 'Add your typed or drawn signature', icon: WandSparkles, slug: 'sign' },
  { name: 'Certified Signature', description: 'Sign with a P12/PFX certificate', icon: BadgeCheck, slug: 'sign-certified' },
  { name: 'OCR PDF', description: 'Extract text from scanned pages', icon: ScanText, slug: 'ocr' },
  { name: 'Protect PDF', description: 'Add password protection', icon: LockKeyhole, slug: 'protect' },
  { name: 'Watermark', description: 'Protect pages with a watermark', icon: Droplets, slug: 'watermark' },
]

export default function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const setSelectedFile = useAppStore((state) => state.setSelectedFile)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual'
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }, [])

  const scrollToTools = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    document.getElementById('tools')?.scrollIntoView?.({ behavior: 'smooth' })
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }

  const openFile = (file?: File) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('This file is larger than the 100 MB browser limit.')
      return
    }
    setError('')
    setSelectedFile(file)
    navigate('/editor')
  }

  return (
    <>
      <Header />
      <main>
        <div className="free-banner" role="note">
          <Sparkles size={14} />
          <span>Free to use for now</span>
          <span className="free-banner-detail">No account needed to get started</span>
        </div>
        <section className="hero container">
          <div>
            <h1>Make every PDF work for you.</h1>
            <p className="hero-copy">Edit, organize, convert and manage your documents in one powerful workspace.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>
                <Upload size={17} /> Choose a PDF
              </button>
              <a className="button button-secondary" href="#tools" onClick={scrollToTools}>Explore all tools <ArrowRight size={16} /></a>
            </div>
          </div>
          <div className="upload-card">
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); openFile(event.dataTransfer.files[0]) }}
            >
              <div className="drop-icon"><Upload size={28} /></div>
              <h3>Drop your PDF here</h3>
              <p>Up to 100 MB · processed privately in your browser</p>
              <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>Browse files</button>
              {error && <div className="error-message" role="alert">{error}</div>}
            </div>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => openFile(event.target.files?.[0])} />
          </div>
        </section>

        <section className="section" id="tools" style={{ background: 'white' }}>
          <div className="container">
            <div className="section-heading"><h2>Everything your PDF needs</h2><p>Powerful document tools in a clear, focused workspace.</p></div>
            <div className="tools-grid">
              {tools.map(({ name, description, icon: Icon, slug }) => (
                <Link className="tool-card" key={slug} to={slug === 'edit' ? '/editor' : `/tools/${slug}`}>
                  <span className="tool-icon"><Icon size={21} /></span><h3>{name}</h3><p>{description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-heading"><h2>Simple, secure, beautifully fast</h2><p>Built for everyday document work without the clutter.</p></div>
            <div className="feature-row">
              <article className="feature"><ShieldCheck size={26} color="#7059e8" /><h3>Privacy by default</h3><p>Core PDF processing happens in your browser. Your documents are not uploaded merely for editing.</p></article>
              <article className="feature"><RotateCw size={26} color="#7059e8" /><h3>All in one workspace</h3><p>Edit, annotate, organize and convert documents without switching products.</p></article>
              <article className="feature"><LockKeyhole size={26} color="#7059e8" /><h3>Local-first documents</h3><p>Recently opened projects can be saved on this device, with clear limits and export controls.</p></article>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer"><div className="container footer-inner"><Link to="/"><Logo /></Link><span>© 2026 Fylqen · by Thanzeel Latheef</span></div></footer>
    </>
  )
}
