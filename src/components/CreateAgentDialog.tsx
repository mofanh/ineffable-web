import React, { useState } from 'react'
import { X, FolderOpen, Bot, Sparkles } from 'lucide-react'
import { createAgent, CreateAgentRequest } from '../api'

interface CreateAgentDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export default function CreateAgentDialog({ open, onClose, onCreated }: CreateAgentDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: '',
    description: '',
    working_dir: '',
    port: 8081,
    capabilities: [],
    system_prompt: '',
    llm_provider: 'spark',
    llm_model: '4.0Ultra',
  })

  const [capabilityInput, setCapabilityInput] = useState('')

  if (!open) return null

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) || 8081 : value,
    }))
  }

  function addCapability() {
    if (capabilityInput.trim() && !formData.capabilities?.includes(capabilityInput.trim())) {
      setFormData(prev => ({
        ...prev,
        capabilities: [...(prev.capabilities || []), capabilityInput.trim()],
      }))
      setCapabilityInput('')
    }
  }

  function removeCapability(cap: string) {
    setFormData(prev => ({
      ...prev,
      capabilities: (prev.capabilities || []).filter(c => c !== cap),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    if (!formData.name.trim()) {
      setError('请输入智能体名称')
      return
    }
    if (!formData.working_dir.trim()) {
      setError('请输入工作目录')
      return
    }

    setLoading(true)
    try {
      await createAgent(formData)
      onCreated()
      onClose()
      // 重置表单
      setFormData({
        name: '',
        description: '',
        working_dir: '',
        port: 8081,
        capabilities: [],
        system_prompt: '',
        llm_provider: 'spark',
        llm_model: '4.0Ultra',
      })
    } catch (err: any) {
      setError(err.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Bot className="size-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">创建新智能体</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* 基本信息 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">基本信息</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  智能体名称 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="如：代码审查助手"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  服务端口 <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  name="port"
                  value={formData.port}
                  onChange={handleChange}
                  min={1024}
                  max={65535}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">描述</label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="智能体的功能描述"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                工作目录 <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="working_dir"
                  value={formData.working_dir}
                  onChange={handleChange}
                  placeholder="/Users/you/projects/my-project"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                  title="选择目录"
                >
                  <FolderOpen className="size-5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                智能体将在此目录下运行，配置文件也会生成在这里
              </p>
            </div>
          </div>

          {/* 能力标签 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">能力标签</h3>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={capabilityInput}
                onChange={e => setCapabilityInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCapability())}
                placeholder="输入标签后回车添加"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={addCapability}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                添加
              </button>
            </div>
            
            {formData.capabilities && formData.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.capabilities.map(cap => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm"
                  >
                    {cap}
                    <button
                      type="button"
                      onClick={() => removeCapability(cap)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* LLM 配置 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">LLM 配置</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">提供商</label>
                <select
                  name="llm_provider"
                  value={formData.llm_provider}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="spark">讯飞星火</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama (本地)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1.5">模型</label>
                <input
                  type="text"
                  name="llm_model"
                  value={formData.llm_model}
                  onChange={handleChange}
                  placeholder="4.0Ultra"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* 系统提示词 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Sparkles className="size-4" />
              系统提示词（可选）
            </h3>
            <textarea
              name="system_prompt"
              value={formData.system_prompt}
              onChange={handleChange}
              rows={4}
              placeholder="定义智能体的角色和行为，例如：&#10;你是一个专业的代码审查助手，擅长发现代码问题并提供优化建议..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建智能体'}
          </button>
        </div>
      </div>
    </div>
  )
}
