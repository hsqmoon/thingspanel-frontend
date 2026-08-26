<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SelectOption } from 'naive-ui'
import { fetchUserList } from '@/service/api/auth'
import { useAuthStore } from '@/store/modules/auth'
import { localStg } from '@/utils/storage'

const allTenants = '__all__'
const authStore = useAuthStore()
const loading = ref(false)
const value = ref(localStg.get('tenantScopeId') || allTenants)
const options = ref<SelectOption[]>([{ label: '全部租户', value: allTenants }])
const visible = computed(() => authStore.userInfo.authority === 'SYS_ADMIN')

async function loadTenants() {
  if (!visible.value) return

  loading.value = true
  try {
    const { data } = await fetchUserList({ page: 1, page_size: 1000 })
    const tenants = data?.list || []
    options.value = [
      { label: '全部租户', value: allTenants },
      ...tenants.map((tenant: any) => ({
        label: tenant.organization || tenant.name || tenant.email || tenant.tenant_id,
        value: tenant.tenant_id
      }))
    ]

    if (value.value !== allTenants && !options.value.some(option => option.value === value.value)) {
      value.value = allTenants
      localStg.remove('tenantScopeId')
    }
  } finally {
    loading.value = false
  }
}

function changeTenantScope(tenantID: string) {
  if (tenantID === allTenants) {
    localStg.remove('tenantScopeId')
  } else {
    localStg.set('tenantScopeId', tenantID)
  }
  window.location.reload()
}

onMounted(loadTenants)
</script>

<template>
  <NSelect
    v-if="visible"
    v-model:value="value"
    class="mr-12px w-180px"
    :loading="loading"
    :options="options"
    :consistent-menu-width="false"
    aria-label="租户范围"
    @update:value="changeTenantScope"
  />
</template>
