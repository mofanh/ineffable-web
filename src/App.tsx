import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import HomePage from './pages/HomePage'
import AgentDetailPage from './pages/AgentDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/agent/:agentId" element={<AgentDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
