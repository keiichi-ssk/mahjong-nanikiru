import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminApp from './admin/AdminApp'
import './index.css'
import './admin/admin.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
)
