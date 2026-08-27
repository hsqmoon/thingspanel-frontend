import { build, createLogger } from 'vite'

const warnings = new Set()
const logger = createLogger()
const writeWarning = logger.warn.bind(logger)
const writeWarningOnce = logger.warnOnce.bind(logger)

logger.warn = (message, options) => {
  warnings.add(String(message))
  writeWarning(message, options)
}

logger.warnOnce = (message, options) => {
  warnings.add(String(message))
  writeWarningOnce(message, options)
}

await build({ customLogger: logger })

if (warnings.size > 0) {
  throw new Error(`Vite emitted ${warnings.size} warning(s):\n${[...warnings].join('\n')}`)
}
