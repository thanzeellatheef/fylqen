import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import Header from '../components/Header'

const plans = [
  { name: 'Free', price: '$0', description: 'For occasional PDF work', features: ['Browser-based tools', 'Local document storage', 'Basic editing and annotations', '100 MB browser limit'] },
  { name: 'Pro', price: '$8', description: 'For regular document workflows', featured: true, features: ['Higher processing limits', 'Advanced editing', 'Batch processing', 'Advanced export options'] },
  { name: 'Business', price: '$18', description: 'For teams and organizations', features: ['Everything in Pro', 'Team workspaces', 'Shared documents', 'Centralized billing'] },
]

export default function PricingPage() {
  return (
    <div>
      <Header />
      <main className="container section">
        <div className="section-heading"><h2>Choose the plan that fits</h2><p>Simple pricing for individual users and teams.</p></div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article className={`price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              <h3>{plan.name}</h3><p style={{ color: '#777487' }}>{plan.description}</p>
              <div className="price">{plan.price}<small> / month</small></div>
              <ul>{plan.features.map((feature) => <li key={feature} style={{ display: 'flex', gap: 8 }}><Check size={16} color="#20a879" /> {feature}</li>)}</ul>
              <Link className={`button ${plan.featured ? 'button-primary' : 'button-secondary'}`} to="/signup" style={{ width: '100%' }}>{plan.name === 'Free' ? 'Use for free' : 'Choose ' + plan.name}</Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
