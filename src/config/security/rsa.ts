/**
 * RSA 安全配置
 * RSA Security Configuration
 */

/**
 * RSA 公钥配置
 * RSA Public Key Configuration
 */
export const rsaPublicKey = import.meta.env.VITE_RSA_PUBLIC_KEY || ''

/**
 * RSA 配置选项
 * RSA Configuration Options
 */
export const rsaConfig = {
  /** 密钥大小 */
  keySize: 2048,
  /** 加密算法 */
  algorithm: 'RSA-OAEP',
  /** 哈希算法 */
  hashAlgorithm: 'SHA-256',
  /** 是否启用环境变量覆盖 */
  enableEnvOverride: true
} as const

/**
 * 获取 RSA 公钥
 * Get RSA Public Key
 * @returns RSA 公钥字符串
 */
export function getRSAPublicKey(): string {
  if (!rsaPublicKey) {
    throw new Error('VITE_RSA_PUBLIC_KEY is required')
  }
  return rsaPublicKey
}

/**
 * 验证 RSA 公钥格式
 * Validate RSA Public Key Format
 * @param key 公钥字符串
 * @returns 是否为有效的 RSA 公钥格式
 */
export function validateRSAPublicKey(key: string): boolean {
  return key.includes('-----BEGIN PUBLIC KEY-----') && key.includes('-----END PUBLIC KEY-----') && key.length > 100
}
