import { reactive, ref } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import { getUserList } from '@/service/api/notification'

export const loading = ref(false)
let searchRequestEpoch = 0

const pagination = reactive({
  page: 1,
  pageSize: 10,
  name: ''
})

export const initMemberData = { name: '', notificationType: [] }
export const memberTypeData = ref<any>([initMemberData])

export const handleDeleteMember = (index: number) => {
  memberTypeData.value.splice(index, 1)
}

export const handleUpdateMember = (updateIndex: number, data: { name: string; notificationType: string[] }) => {
  const filterData = memberTypeData.value.map((item, index) => {
    if (index === updateIndex) {
      return {
        name: data.name,
        notificationType: data.notificationType
      }
    }
    return item
  })
  memberTypeData.value = [...filterData]
}

export const notificationTypeOptions = ref<{ label: string; value: string }[]>([])

export const handleSearch = async (query?: string, page?: number) => {
  const epoch = ++searchRequestEpoch
  const normalizedQuery = query ?? pagination.name
  const queryChanged = query !== undefined && normalizedQuery !== pagination.name
  const requestedPage = page ?? (queryChanged || notificationTypeOptions.value.length === 0 ? 1 : pagination.page)

  loading.value = true
  try {
    const response = await getUserList({
      page: requestedPage,
      page_size: pagination.pageSize,
      name: normalizedQuery
    })
    if (epoch !== searchRequestEpoch || isFlatRequestFailure(response) || !response.data) return

    const formattedList = (response.data.list || []).map(item => ({
      label: item.name,
      value: item.user_id
    }))
    notificationTypeOptions.value =
      queryChanged || requestedPage === 1 ? formattedList : [...notificationTypeOptions.value, ...formattedList]
    pagination.name = normalizedQuery
    pagination.page = requestedPage
  } finally {
    if (epoch === searchRequestEpoch) {
      loading.value = false
    }
  }
}

export const handleScroll = e => {
  const currentTarget = e.currentTarget as HTMLElement
  if (!loading.value && currentTarget.scrollTop + currentTarget.offsetHeight >= currentTarget.scrollHeight) {
    void handleSearch(undefined, pagination.page + 1)
  }
}

export const getCurrentName = (index: number) => {
  return memberTypeData.value[index]?.name ?? ''
}
