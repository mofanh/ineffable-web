import React, { useState, useEffect, useCallback } from 'react'
import { Wand, X, ChevronRight, AlertCircle, FileText } from 'lucide-react'
import { listSkills } from '../../api/skills'
import type { SkillsListResponse, SkillInfo } from '../../types'
import { cn } from '../../utils/cn'

interface SkillsSidebarProps {
  isOpen: boolean
  onClose: () => void
  serviceUrl: string | null
  onUseSkill: (skill: SkillInfo) => void
}

export default function SkillsSidebar({
  isOpen,
  onClose,
  serviceUrl,
  onUseSkill,
}: SkillsSidebarProps) {
  const [response, setResponse] = useState<SkillsListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)

  const fetchSkills = useCallback(async () => {
    if (!serviceUrl) return

    setLoading(true)
    setError(null)

    try {
      const result = await listSkills(serviceUrl, {})
      setResponse(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [serviceUrl])

  useEffect(() => {
    if (isOpen && !response && !loading) {
      fetchSkills()
    }
  }, [isOpen, fetchSkills, response, loading])

  const handleSkillClick = (skill: SkillInfo) => {
    setSelectedSkill(skill)
  }

  const handleUseSkill = () => {
    if (selectedSkill) {
      onUseSkill(selectedSkill)
    }
  }

  // Get all skills from all entries
  const allSkills = response?.data.flatMap((entry) => entry.skills) || []

  if (!isOpen) return null

  return (
    <aside className="h-full bg-background border-l border-border/50 flex flex-col w-80">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Wand className="size-5" />
          </div>
          <span className="font-semibold text-lg">Skills</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          title="收起 Skills 边栏"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Skills List */}
        <div className="w-full overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-muted-foreground">
              <div className="animate-spin inline-block size-5 border-2 border-primary border-t-transparent rounded-full mb-2" />
              <p className="text-sm">加载中...</p>
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="size-4" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {!loading && !error && allSkills.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              <Wand className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到技能</p>
            </div>
          )}

          {!loading && !error && allSkills.length > 0 && (
            <div className="divide-y divide-border/30">
              {allSkills.map((skill, index) => (
                <button
                  key={`${skill.name}-${index}`}
                  onClick={() => handleSkillClick(skill)}
                  className={cn(
                    'w-full p-3 text-left hover:bg-muted/50 transition-colors',
                    selectedSkill?.name === skill.name && 'bg-muted'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{skill.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {skill.scope}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {skill.short_description || skill.description}
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'size-4 text-muted-foreground shrink-0 transition-transform',
                        selectedSkill?.name === skill.name && 'rotate-90'
                      )}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill Detail Panel - Shows when a skill is selected */}
      {selectedSkill && (
        <div className="border-t border-border/50 p-4 bg-muted/20 max-h-1/3 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">{selectedSkill.name}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{selectedSkill.description}</p>
          <button
            onClick={handleUseSkill}
            className="w-full py-2 px-3 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            使用此技能
          </button>
        </div>
      )}
    </aside>
  )
}
