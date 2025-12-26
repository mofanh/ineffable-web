import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AgentDetailPage from './pages/AgentDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/agent/:agentId" element={<AgentDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
