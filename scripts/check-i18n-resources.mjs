import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { resources } from "../src/lib/i18n/resources.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const languages = Object.keys(resources)

function flatten(value, prefix = "", output = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, output))
    return output
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      flatten(item, prefix ? `${prefix}.${key}` : key, output)
    }
    return output
  }
  output.set(prefix, value)
  return output
}

function placeholders(value) {
  if (typeof value !== "string") return []
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort()
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : []
  })
}

const flattened = Object.fromEntries(
  languages.map((language) => [
    language,
    flatten(resources[language].translation),
  ]),
)
const referenceLanguage = languages[0]
const reference = flattened[referenceLanguage]
const errors = []

for (const language of languages.slice(1)) {
  const candidate = flattened[language]
  for (const [key, value] of reference) {
    if (!candidate.has(key)) {
      errors.push(`${language} 缺少资源键：${key}`)
      continue
    }
    const candidateValue = candidate.get(key)
    if (typeof candidateValue !== typeof value) {
      errors.push(`${language} 资源类型不一致：${key}`)
    }
    if (
      placeholders(candidateValue).join("|") !== placeholders(value).join("|")
    ) {
      errors.push(`${language} 插值参数不一致：${key}`)
    }
  }
  for (const key of candidate.keys()) {
    if (!reference.has(key)) errors.push(`${language} 存在多余资源键：${key}`)
  }
}

const staticKeyPattern = /\b(?:i18n\.)?t\(\s*["']([^"'`]+)["']/g
for (const file of sourceFiles(path.join(root, "src"))) {
  if (file.endsWith(`${path.sep}lib${path.sep}i18n${path.sep}resources.ts`))
    continue
  const source = fs.readFileSync(file, "utf8")
  for (const match of source.matchAll(staticKeyPattern)) {
    const key = match[1]
    for (const language of languages) {
      if (!flattened[language].has(key)) {
        errors.push(
          `${path.relative(root, file)} 引用了 ${language} 缺失的键：${key}`,
        )
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}

console.log(
  `i18n 检查通过：${languages.length} 种语言，${reference.size} 个资源叶子键。`,
)
