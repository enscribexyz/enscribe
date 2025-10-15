import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ExploreRedirect() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to home page
    router.replace('/')
  }, [router])

  return null
}
