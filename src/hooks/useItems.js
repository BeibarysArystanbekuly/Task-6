import { useEffect, useRef, useState } from 'react'
import { getItemsList } from '../services/service.js'

export default function useItems(queryString = '') {
  const [refresh, setRefresh] = useState(0)
  const forceNextRequest = useRef(false)
  const [request, setRequest] = useState({
    queryString: null, status: 'loading', error: '',
    result: { data: [], total: 0, totalPages: 0 },
  })

  useEffect(() => {
    let ignore = false
    const force = forceNextRequest.current
    forceNextRequest.current = false
    async function load() {
      try {
        const result = await (force ? getItemsList(queryString, { force: true }) : getItemsList(queryString))
        if (!ignore) setRequest({ queryString, result, status: 'success', error: '' })
      } catch (error) {
        if (!ignore) setRequest({ queryString, result: { data: [], total: 0, totalPages: 0 }, status: 'error', error: error.message })
      }
    }
    load()
    return () => { ignore = true }
  }, [queryString, refresh])

  function reload() {
    forceNextRequest.current = true
    setRequest((previous) => ({ ...previous, status: 'loading', error: '' }))
    setRefresh((previous) => previous + 1)
  }

  return { ...request, status: request.queryString === queryString ? request.status : 'loading', reload }
}
