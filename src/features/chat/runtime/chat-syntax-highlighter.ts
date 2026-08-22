import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import githubDark from "@shikijs/themes/github-dark"
import githubLight from "@shikijs/themes/github-light"
import type { LanguageRegistration } from "@shikijs/types"

type LanguageModule = { default: LanguageRegistration[] }
type LanguageLoader = () => Promise<LanguageModule>

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shellscript",
  cjs: "javascript",
  html: "html",
  js: "javascript",
  javascript: "javascript",
  json: "json",
  jsx: "jsx",
  markdown: "markdown",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "shellscript",
  shell: "shellscript",
  shellscript: "shellscript",
  sql: "sql",
  ts: "typescript",
  tsx: "tsx",
  typescript: "typescript",
  yaml: "yaml",
  yml: "yaml",
}

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  html: () => import("@shikijs/langs/html"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  yaml: () => import("@shikijs/langs/yaml"),
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const languageLoads = new Map<string, Promise<void>>()

function getHighlighter() {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  return highlighterPromise
}

async function ensureLanguage(language: string) {
  const canonical = LANGUAGE_ALIASES[language.toLowerCase()]
  const loader = canonical ? LANGUAGE_LOADERS[canonical] : null
  if (!canonical || !loader) return null

  let loading = languageLoads.get(canonical)
  if (!loading) {
    loading = Promise.all([getHighlighter(), loader()]).then(
      async ([highlighter, module]) => {
        await highlighter.loadLanguage(...module.default)
      }
    )
    languageLoads.set(canonical, loading)
  }
  await loading
  return canonical
}

export async function highlightSettledCode(code: string, language: string) {
  const canonical = await ensureLanguage(language)
  if (!canonical) return null
  const highlighter = await getHighlighter()
  return highlighter.codeToHtml(code, {
    lang: canonical,
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  })
}
