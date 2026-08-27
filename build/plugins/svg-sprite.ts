import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const virtualModuleId = 'virtual:svg-icons-register'
const resolvedVirtualModuleId = `\0${virtualModuleId}`

function collectSvgFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const filePath = path.join(directory, entry.name)
      return entry.isDirectory() ? collectSvgFiles(filePath) : entry.isFile() && entry.name.endsWith('.svg') ? [filePath] : []
    })
    .sort()
}

function createSymbol(filePath: string, iconDirectory: string, symbolPrefix: string): string {
  const source = fs.readFileSync(filePath, 'utf8').trim()
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(source)) {
    throw new Error(`Unsafe SVG content: ${filePath}`)
  }

  const svgStart = source.search(/<svg\b/i)
  const match = svgStart >= 0 ? source.slice(svgStart).match(/^<svg\b([^>]*)>([\s\S]*?)<\/svg>$/i) : null
  if (!match) throw new Error(`Invalid SVG document: ${filePath}`)

  const attributes = match[1]
    .replace(/\s+xmlns(?::xlink)?=(['"])[^'"]*\1/gi, '')
    .replace(/\s+(?:width|height)=(['"])[^'"]*\1/gi, '')
  const relativeName = path.relative(iconDirectory, filePath).replace(/\.svg$/i, '').split(path.sep).join('-')

  return `<symbol${attributes} id="${symbolPrefix}-${relativeName}">${match[2]}</symbol>`
}

export function createSvgSpritePlugin(iconDirectory: string, symbolPrefix: string, domId: string): Plugin {
  return {
    name: 'nsnr-svg-sprite',
    enforce: 'pre',
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : undefined
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return undefined

      const files = collectSvgFiles(iconDirectory)
      files.forEach(file => this.addWatchFile(file))
      const symbols = files.map(file => createSymbol(file, iconDirectory, symbolPrefix)).join('')

      return `
const symbols = ${JSON.stringify(symbols)}
const injectSprite = () => {
  if (document.getElementById(${JSON.stringify(domId)})) return
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  sprite.id = ${JSON.stringify(domId)}
  sprite.setAttribute('aria-hidden', 'true')
  sprite.style.position = 'absolute'
  sprite.style.width = '0'
  sprite.style.height = '0'
  sprite.innerHTML = symbols
  document.body.appendChild(sprite)
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSprite, { once: true })
} else {
  injectSprite()
}
`
    }
  }
}
