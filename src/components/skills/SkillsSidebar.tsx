import React, { useState, useEffect, useCallback } from 'react'
import { Wand, X, ChevronRight, AlertCircle, FileText, Sparkles } from 'lucide-react'
import { listSkills } from '../../api/skills'
import type { SkillsListResponse, SkillInfo } from '../../types'
import { cn } from '../../utils/cn'

interface SkillsSidebarProps {
  onClose: () => void
  serviceUrl: string | null
  onUseSkill: (skill: SkillInfo) => void
}

export default function SkillsSidebar({
  onClose,
  serviceUrl,
  onUseSkill,
}: SkillsSidebarProps) {
  const [response, setResponse] = useState<SkillsListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

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
    if (!hasLoaded && !loading && serviceUrl) {
      fetchSkills()
      setHasLoaded(true)
    }
  }, [hasLoaded, loading, fetchSkills, serviceUrl])

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

  return (
    <aside className="h-full bg-bg_default_secondary_elevated flex flex-col shadow-[0_0_20px_rgba(0,0,0,0.05)] border border-border_default rounded-[20px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 text-[16px] font-medium select-none">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-text_default_primary" />
          <span className="text-text_default_primary">Skills</span>
        </div>
        <button
          onClick={onClose}
          className="flex min-h-7 min-w-7 items-center justify-center rounded-[8px] text-icon_interaction_tertiary_default hover:bg-bg_interaction_tertiary_hover hover:text-icon_interaction_tertiary_hover cursor-pointer transition-colors"
          title="收起 Skills 边栏"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center px-4 overflow-x-auto scrollbar-hide">
        <button
          className="cursor-pointer text-pretty flex gap-[10px] px-[12px] py-[6px] text-[14px] text-text_default_primary font-medium rounded-[32px] bg-bg_interaction_tertiary_selected"
        >
          <span className="flex-1 text-nowrap">技能列表</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Skills List */}
        <div className="w-full overflow-y-auto p-2">
          {loading && (
            <div className="p-6 text-center text-text_default_tertiary">
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
            <div className="p-6 text-center text-text_default_tertiary">
              <Wand className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到技能</p>
            </div>
          )}

          {!loading && !error && allSkills.length > 0 && (
            <div className="space-y-1">
              {allSkills.map((skill, index) => (
                <button
                  key={`${skill.name}-${index}`}
                  onClick={() => handleSkillClick(skill)}
                  className={cn(
                    'w-full px-3 py-2.5 rounded-lg text-left transition-all duration-150',
                    selectedSkill?.name === skill.name
                      ? 'bg-bg_interaction_tertiary_selected'
                      : 'bg-transparent hover:bg-bg_interaction_tertiary_hover'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text_default_primary truncate">{skill.name}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          selectedSkill?.name === skill.name
                            ? 'text-text_default_primary'
                            : 'text-text_default_secondary'
                        )}>
                          {skill.scope}
                        </span>
                      </div>
                      <p className="text-xs text-text_default_secondary truncate mt-0.5">
                        {skill.short_description || skill.description}
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'size-4 text-text_default_secondary shrink-0 transition-transform mt-0.5',
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
        <div className="border-t border-border_default p-4 bg-bg_default_secondary_elevated">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="size-4 text-text_default_primary" />
            <span className="font-medium text-text_default_primary">{selectedSkill.name}</span>
          </div>
          <p className="text-xs text-text_default_secondary mb-3 leading-relaxed">{selectedSkill.description}</p>
          <button
            onClick={handleUseSkill}
            className="w-full py-2 px-3 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            使用此技能
          </button>
        </div>
      )}
    </aside>
  )
}
