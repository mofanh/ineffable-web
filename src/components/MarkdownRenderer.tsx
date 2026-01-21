import React, { useMemo, useEffect, useState } from 'react'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
// 只引入常用语言
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import 'highlight.js/styles/github-dark.css'

// 注册语言
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)

// 配置 markdown-it
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        return `<pre class="hljs" data-lang="${lang}"><code class="language-${lang}">${highlighted}</code></pre>`
      } catch (__) {}
    }
    // 自动检测语言
    try {
      const result = hljs.highlightAuto(str)
      const detectedLang = result.language || 'text'
      return `<pre class="hljs" data-lang="${detectedLang}"><code>${result.value}</code></pre>`
    } catch (__) {}
    return `<pre class="hljs" data-lang="text"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

interface Props {
  content: string
  className?: string
  expand?: boolean
}

export default function MarkdownRenderer({ content, className = '', expand = false }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [expanded, setExpanded] = useState(expand)
  const [overflow, setOverflow] = useState(false)

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

  // 检测代码块是否溢出
  useEffect(() => {
    const checkOverflow = () => {
      const preElements = document.querySelectorAll('.markdown-body pre')
      preElements.forEach(pre => {
        if (pre.scrollHeight > pre.clientHeight) {
          setOverflow(true)
        }
      })
    }
    
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [content])

  const html = useMemo(() => {
    if (!content) return ''
    return md.render(content)
  }, [content])

  const themeClass = isDark ? 'dark' : ''

  return (
    <div 
      className={`markdown-body ${themeClass} ${className}`}
      data-expanded={expanded || undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
