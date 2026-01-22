import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import { createHighlighter } from 'shiki'
import DOMPurify from 'dompurify'

// 创建全局 shiki highlighter 实例
let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript', 'typescript', 'jsx', 'tsx', 'python', 'rust', 'bash', 'json', 
        'yaml', 'xml', 'html', 'css', 'sql', 'markdown', 'go', 'java', 'c', 'cpp'
      ],
    })
  }
  return highlighter
}

// 配置 markdown-it
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

// 自定义 link renderer 添加安全属性
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const href = token.attrGet('href') || ''
  
  // 如果是外部链接，添加安全属性
  if (href.startsWith('http://') || href.startsWith('https://')) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  
  return self.renderToken(tokens, idx, options)
}

// 自定义代码块渲染规则
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const code = token.content
  const lang = token.info ? /^\S*/.exec(token.info)?.[0] || 'text' : 'text'
  
  // 返回一个占位符，保存原始代码
  return `<pre class="shiki-placeholder" data-lang="${lang}" data-code="${encodeURIComponent(code)}"><code class="language-${lang}">${md.utils.escapeHtml(code)}</code></pre>`
}

interface Props {
  content: string
  className?: string
  expand?: boolean
}

export default function MarkdownRenderer({ content, className = '', expand = false }: Props) {
  // 初始化时同步检测主题，避免闪烁
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })
  const [expanded, setExpanded] = useState(expand)
  const containerRef = useRef<HTMLDivElement>(null)
  const [highlighted, setHighlighted] = useState(false)

  // 检测主题
  useEffect(() => {
    const checkTheme = () => {
      const darkMode = document.documentElement.classList.contains('dark')
      setIsDark(darkMode)
    }
    
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    
    return () => observer.disconnect()
  }, [])

  // 使用 shiki 对代码块进行高亮（支持主题切换）
  useEffect(() => {
    if (!content || !containerRef.current) return

    const processCodeBlocks = async () => {
      const container = containerRef.current
      if (!container) return

      // 获取所有需要处理的代码块：占位符或需要更新的已高亮块
      const selectors = ['pre.shiki-placeholder']
      if (highlighted) {
        // 如果已经高亮过，主题变化时需要重新高亮
        selectors.push('pre.shiki[data-code]')
      }
      
      const preElements = container.querySelectorAll(selectors.join(', '))
      if (!preElements || preElements.length === 0) {
        setHighlighted(true)
        return
      }

      try {
        const hl = await getHighlighter()

        for (const pre of Array.from(preElements)) {
          // 获取原始代码
          const code = pre.getAttribute('data-code') 
            ? decodeURIComponent(pre.getAttribute('data-code')!)
            : pre.querySelector('code')?.textContent || ''
          
          if (!code) continue

          const lang = pre.getAttribute('data-lang') || 'text'
          const isInline = pre.parentElement?.tagName === 'P'

          if (isInline) {
            // 行内代码使用简单样式
            const span = document.createElement('span')
            span.className = 'inline-code'
            span.textContent = code
            pre.replaceWith(span)
          } else {
            // 代码块使用 shiki 高亮，根据当前主题选择
            const theme = isDark ? 'github-dark' : 'github-light'
            const highlightedHtml = hl.codeToHtml(code, {
              lang,
              theme,
            })
            // 创建临时容器进行替换
            const temp = document.createElement('div')
            temp.innerHTML = highlightedHtml
            const newPre = temp.firstElementChild
            if (newPre) {
              // 保存原始代码用于主题切换时重新高亮
              newPre.setAttribute('data-code', encodeURIComponent(code))
              newPre.setAttribute('data-lang', lang)
              pre.replaceWith(newPre)
            }
          }
        }
        setHighlighted(true)
      } catch (error) {
        console.error('Shiki highlight error:', error)
        // 回退到普通渲染
        for (const pre of Array.from(container.querySelectorAll('pre.shiki-placeholder, pre.shiki'))) {
          pre.classList.remove('shiki-placeholder')
        }
        setHighlighted(true)
      }
    }

    processCodeBlocks()
  }, [content, isDark])

  // 渲染 markdown
  const html = useMemo(() => {
    if (!content) return ''
    return md.render(content)
  }, [content])

  // 使用 DOMPurify 消毒
  const sanitizedHtml = useMemo(() => {
    if (!html) return ''
    
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel', 'data-lang', 'data-highlighted'],
      ADD_TAGS: ['style'],
    })
  }, [html])

  const themeClass = isDark ? 'dark' : ''

  return (
    <div 
      ref={containerRef}
      className={`markdown-body ${themeClass} ${className}`}
      data-expanded={expanded || undefined}
      data-highlighted={highlighted || undefined}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
