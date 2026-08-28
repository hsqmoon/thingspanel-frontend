import { request } from '../request'

export interface DashboardMenuConfig {
  dashboard_id: string
  menu_name: string
  sort: number
  enabled: boolean
  parent_code: string
}

export interface DashboardDeleteResult {
  operation_id: string
  dashboard_id: string
  status: 'pending' | 'delivered'
  attempts: number
}

export function fetchDashboardMenuConfig(dashboardId: string) {
  return request.get<DashboardMenuConfig | null>(`/dashboard-menu/${dashboardId}`)
}

export function saveDashboardMenuConfig(
  dashboardId: string,
  payload: {
    menu_name: string
    dashboard_name?: string
    sort?: number
    enabled?: boolean
  }
) {
  return request.put<DashboardMenuConfig | null>(`/dashboard-menu/${dashboardId}`, payload)
}

export function deleteDashboardMenuConfig(dashboardId: string) {
  return request.delete(`/dashboard-menu/${dashboardId}`)
}

export function requestDashboardDeletion(dashboardId: string) {
  return request.delete<DashboardDeleteResult>(`/thingsvis-dashboard/${dashboardId}`)
}

export function fetchDashboardDeletion(dashboardId: string) {
  return request.get<DashboardDeleteResult>(`/thingsvis-dashboard/${dashboardId}`)
}
