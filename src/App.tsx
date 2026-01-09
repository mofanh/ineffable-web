import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainPage from './pages/MainPage'
import ChatRoutePage from './pages/ChatRoutePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 支持三种 URL 格式：
            / - 首页，无选择
            /chat/:serverId/:serviceId - 选择服务器和服务，显示默认会话
            /chat/:serverId/:serviceId/:sessionId - 完整的会话 URL
        */}
        <Route path="/" element={<MainPage />} />
        <Route path="/chat/:serverId/:serviceId" element={<ChatRoutePage />} />
        <Route path="/chat/:serverId/:serviceId/:sessionId" element={<ChatRoutePage />} />
      </Routes>
    </BrowserRouter>
  )
}
