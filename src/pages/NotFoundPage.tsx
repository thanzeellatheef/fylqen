import { Link } from 'react-router-dom'
import Header from '../components/Header'

export default function NotFoundPage() {
  return (
    <div>
      <Header />
      <main className="container" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><h1>Page not found</h1><p style={{ color: '#777487' }}>The page you requested does not exist.</p><Link className="button button-primary" to="/">Return home</Link></div>
      </main>
    </div>
  )
}
