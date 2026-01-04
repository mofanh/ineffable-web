import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
// Legacy pages (can be removed later)
import AgentDetailPage from './pages/AgentDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          {/* 新路由 */}
          <Route path="/chat/:serverId/:serviceId" element={<ChatPage />} />
          {/* Legacy routes */}
          <Route path="/agent/:agentId" element={<AgentDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
