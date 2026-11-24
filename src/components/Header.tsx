import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from './Logo'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.pathname !== '/') return
    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (navigation?.type === 'reload') {
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      return
    }
    if (location.hash !== '#tools') return
    window.requestAnimationFrame(() => {
      document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' })
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
    })
  }, [location.pathname, location.hash, location.search])

  const openTools = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setMenuOpen(false)
    if (location.pathname === '/') {
      document.getElementById('tools')?.scrollIntoView?.({ behavior: 'smooth' })
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
    } else {
      navigate('/#tools')
    }
  }

  const toolsLink = () => <a href="/#tools" onClick={openTools}>All tools</a>

  return (
    <header>
      <nav className="nav container" aria-label="Primary navigation">
        <Link to="/" onClick={() => setMenuOpen(false)}><Logo /></Link>
        <div className="nav-links">
          {toolsLink()}
          <Link to="/pricing">Pricing</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/login">Log in</Link>
          <Link className="button button-primary" to="/signup">Sign up</Link>
        </div>
        <button
          className="icon-button mobile-menu"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {menuOpen && (
        <div className="mobile-nav" id="mobile-navigation">
          {toolsLink()}
          <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
          <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
          <Link className="button button-primary" to="/signup" onClick={() => setMenuOpen(false)}>Sign up</Link>
        </div>
      )}
    </header>
  )
}
