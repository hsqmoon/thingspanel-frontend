import { localStg } from '@/utils/storage'

const SYS_ADMIN_ROLE = 'SYS_ADMIN'
const SYS_ADMIN_SPACE_ID = 'thingspanel-sys-admin'

type UserInfoLike = Partial<Api.Auth.UserInfo> & {
  tenantId?: string
  tenant_id?: string
}

export function getCurrentUserInfo(): UserInfoLike | null {
  const userInfo = localStg.get('userInfo')
  return userInfo || null
}

export function isSysAdminUser(userInfo?: UserInfoLike | null): boolean {
  if (!userInfo) return false

  return userInfo.authority === SYS_ADMIN_ROLE || userInfo.roles?.includes(SYS_ADMIN_ROLE) === true
}

export function resolveThingsVisSpaceId(userInfo?: UserInfoLike | null): string {
  if (isSysAdminUser(userInfo)) {
    return String(localStg.get('tenantScopeId') || '').trim() || SYS_ADMIN_SPACE_ID
  }

  const tenantId = String(userInfo?.tenantId || userInfo?.tenant_id || '').trim()
  return tenantId || 'default'
}

export function getThingsVisSpaceLabel(userInfo?: UserInfoLike | null): string {
  if (!isSysAdminUser(userInfo)) return '租户看板空间'
  return localStg.get('tenantScopeId') ? '已选租户看板空间' : '超管全局看板空间'
}

export { SYS_ADMIN_ROLE, SYS_ADMIN_SPACE_ID }
