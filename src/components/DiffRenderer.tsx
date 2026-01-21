import React, { useMemo } from 'react'
import { cn } from '../utils/cn'

export interface DiffLine {
  type: 'addition' | 'deletion' | 'neutral'
  content: string
  lineNumber?: string
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface DiffFile {
  oldPath: string
  newPath: string
  hunks: DiffHunk[]
  mode?: 'modify' | 'add' | 'delete' | 'rename'
}

interface DiffRendererProps {
  diff: string | DiffFile | DiffFile[]
  className?: string
}

// 简单的 diff 解析器（支持统一格式）
function parseUnifiedDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = []
  const lines = diffText.split('\n')
  
  let currentFile: DiffFile | null = null
  let currentHunk: DiffHunk | null = null
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 文件头
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        files.push(currentFile)
      }
      currentFile = {
        oldPath: '',
        newPath: '',
        hunks: [],
      }
      currentHunk = null
      continue
    }
    
    // 旧文件路径
    if (line.startsWith('--- ')) {
      if (currentFile) {
        currentFile.oldPath = line.slice(4) || 'a/' + line.substring(4).trim()
      }
      continue
    }
    
    // 新文件路径
    if (line.startsWith('+++ ')) {
      if (currentFile) {
        currentFile.newPath = line.slice(4) || 'b/' + line.substring(4).trim()
      }
      continue
    }
    
    // 文件模式变更
    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.mode = 'add'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.mode = 'delete'
      continue
    }
    if (line.startsWith('rename from')) {
      if (currentFile) currentFile.mode = 'rename'
      continue
    }
    
    // Hunk 头
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match && currentFile) {
        currentHunk = {
          oldStart: parseInt(match[1]) || 1,
          oldLines: parseInt(match[2]) || 1,
          newStart: parseInt(match[3]) || 1,
          newLines: parseInt(match[4]) || 1,
          lines: [],
        }
        currentFile.hunks.push(currentHunk)
      }
      continue
    }
    
    // 差异行
    if (currentHunk && line.length > 0) {
      const firstChar = line[0]
      const content = line.slice(1)
      
      let type: DiffLine['type'] = 'neutral'
      if (firstChar === '+') type = 'addition'
      else if (firstChar === '-') type = 'deletion'
      else if (firstChar === ' ' || firstChar === '\\') type = 'neutral'
      
      if (type !== 'neutral' || content) {
        currentHunk.lines.push({ type, content })
      }
    }
  }
  
  if (currentFile) {
    files.push(currentFile)
  }
  
  return files
}

// 单个文件差异渲染
function DiffFileRenderer({ file }: { file: DiffFile }) {
  const displayPath = file.newPath || file.oldPath
  
  return (
    <div className="diff-file">
      {/* 文件头 */}
      <div className="diff-header">
        <span className="font-medium">{displayPath}</span>
        {file.mode && (
          <span className="ml-2 text-xs opacity-60">
            {file.mode === 'add' && '(新增)'}
            {file.mode === 'delete' && '(删除)'}
            {file.mode === 'rename' && '(重命名)'}
            {file.mode === 'modify' && '(修改)'}
          </span>
        )}
      </div>
      
      {/* Hunks */}
      {file.hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="diff-hunk">
          <span className="select-none">@@</span>
          {' '}
          <span className="text-orange-500">-{hunk.oldStart},{hunk.oldLines}</span>
          {' '}
          <span className="text-green-500">+{hunk.newStart},{hunk.newLines}</span>
          <span className="select-none"> @@</span>
          
          <div className="diff-lines mt-1">
            {hunk.lines.map((line, lineIdx) => (
              <div
                key={lineIdx}
                className={cn(
                  'diff-line',
                  line.type === 'addition' && 'diff-line-addition',
                  line.type === 'deletion' && 'diff-line-deletion',
                  line.type === 'neutral' && 'diff-line-neutral'
                )}
              >
                <span className="select-none w-6 inline-block text-right mr-4 opacity-50">
                  {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' '}
                </span>
                <span>{line.content}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DiffRenderer({ diff, className = '' }: DiffRendererProps) {
  const files = useMemo(() => {
    if (Array.isArray(diff)) {
      return diff
    }
    if (typeof diff === 'string') {
      return parseUnifiedDiff(diff)
    }
    return [diff]
  }, [diff])
  
  if (files.length === 0) {
    return (
      <div className="text-muted-foreground text-sm p-4">
        无差异内容
      </div>
    )
  }
  
  return (
    <div className={cn('diff', className)}>
      {files.map((file, idx) => (
        <DiffFileRenderer key={idx} file={file} />
      ))}
    </div>
  )
}

// 简单的行内 diff 高亮组件
export function InlineDiff({ 
  oldText, 
  newText, 
  className 
}: { 
  oldText: string
  newText: string
  className?: string
}) {
  // 简单的单词差异（仅用于简单场景）
  const oldWords = oldText.split(' ')
  const newWords = newText.split(' ')
  
  return (
    <span className={cn('font-mono', className)}>
      {newWords.map((word, idx) => {
        const isNew = !oldWords.includes(word)
        return (
          <span
            key={idx}
            className={cn(
              isNew && 'bg-green-500/20 text-green-600 dark:text-green-400 px-0.5 rounded'
            )}
          >
            {word}{' '}
          </span>
        )
      })}
    </span>
  )
}
