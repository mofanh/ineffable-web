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
        'javascript', 'typescript', 'python', 'rust', 'bash', 'json', 
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
  
  // 返回一个占位符，实际高亮在后续处理
  return `<pre class="shiki-placeholder" data-lang="${lang}"><code class="language-${lang}">${md.utils.escapeHtml(code)}</code></pre>`
}

interface Props {
  content: string
  className?: string
  expand?: boolean
}

export default function MarkdownRenderer({ content, className = '', expand = false }: Props) {
  const [isDark, setIsDark] = useState(false)
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

  // 使用 shiki 对代码块进行高亮（支持双主题）
  useEffect(() => {
    if (!content || !containerRef.current) return

    const processCodeBlocks = async () => {
      const preElements = containerRef.current?.querySelectorAll('pre.shiki-placeholder')
      if (!preElements || preElements.length === 0) {
        setHighlighted(true)
        return
      }

      try {
        const hl = await getHighlighter()

        for (const pre of Array.from(preElements)) {
          const codeEl = pre.querySelector('code')
          if (!codeEl) continue

          const code = codeEl.textContent || ''
          const lang = pre.getAttribute('data-lang') || 'text'
          const isInline = pre.parentElement?.tagName === 'P'

          if (isInline) {
            // 行内代码使用简单样式
            pre.outerHTML = `<code class="inline-code">${md.utils.escapeHtml(code)}</code>`
          } else {
            // 代码块使用 shiki 高亮（单主题）
            const theme = isDark ? 'github-dark' : 'github-light'
            const highlightedHtml = hl.codeToHtml(code, {
              lang,
              theme,
            })
            pre.outerHTML = highlightedHtml
            
            // 确保代码块应用正确的主题类
            if (isDark) {
              pre.classList.add('shiki-dark')
            }
          }
        }
        setHighlighted(true)
      } catch (error) {
        console.error('Shiki highlight error:', error)
        // 回退到普通渲染
        for (const pre of Array.from(preElements)) {
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
