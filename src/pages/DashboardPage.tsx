import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, Search, Trash2 } from 'lucide-react'
import { deleteDocument, listDocuments, type StoredDocument } from '../services/storage'
import Logo from '../components/Logo'

export default function DashboardPage() {
  const [documents, setDocuments] = useState<StoredDocument[]>([])

  useEffect(() => {
    listDocuments().then(setDocuments).catch(console.error)
  }, [])

  const remove = async (id: string) => {
    await deleteDocument(id)
    setDocuments((items) => items.filter((item) => item.id !== id))
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header"><div className="container"><Link to="/"><Logo /></Link></div></div>
      <main className="dashboard-body">
        <div className="welcome"><div><h1>Welcome back</h1><p>Your PDF workspace</p></div><Link className="button button-primary" to="/"><FilePlus2 size={17} /> Upload document</Link></div>
        {documents.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {documents.sort((a,b) => b.updatedAt - a.updatedAt).map((document) => (
              <article className="tool-card" key={document.id}>
                <h3 style={{ marginBottom: 8 }}>{document.name}</h3>
                <p>{Math.max(1, Math.round(document.size / 1024))} KB · {new Date(document.updatedAt).toLocaleDateString()}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <button className="button button-secondary" type="button" onClick={() => remove(document.id)} style={{ color: '#b13d48' }}><Trash2 size={15} /> Delete</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-docs">
            <div><span style={{ color: '#7059e8', display: 'inline-grid' }}><Search size={30} /></span><h3>No recent documents</h3><p>Choose a PDF to open it in the editor.</p><Link className="button button-primary" to="/">Choose a PDF</Link></div>
          </div>
        )}
      </main>
    </div>
  )
}
