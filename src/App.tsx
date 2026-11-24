import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import EditorPage from './pages/EditorPage'
import AuthPage from './pages/AuthPage'
import PricingPage from './pages/PricingPage'
import ToolPage from './pages/ToolPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/tools/:tool" element={<ToolPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
