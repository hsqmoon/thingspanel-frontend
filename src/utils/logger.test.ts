import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('keeps error output while filtering lower levels', async () => {
    const { default: Logger, LogLevel } = await import('./logger')
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new Logger('Runtime', {
      enabled: true,
      level: LogLevel.ERROR,
      prefix: '[Test]',
      timestamp: false
    })

    logger.debug('debug')
    logger.info('info')
    logger.error('failure')

    expect(debug).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('[Test][Runtime][ERROR] ', 'failure')
  })

  it('uses the error threshold without disabling production error logging', async () => {
    vi.stubEnv('DEV', false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { default: Logger } = await import('./logger')
    const logger = new Logger('Production', { timestamp: false })

    logger.info('info')
    logger.error('failure')

    expect(info).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledOnce()
  })

  it('keeps debug and info output enabled during development', async () => {
    vi.stubEnv('DEV', true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { default: Logger } = await import('./logger')
    const logger = new Logger('Development', { timestamp: false })

    logger.debug('debug')
    logger.info('info')

    expect(debug).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledOnce()
  })
})
