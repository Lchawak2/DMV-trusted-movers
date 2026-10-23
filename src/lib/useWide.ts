import { useEffect, useState } from 'react'

// True on a computer-sized screen, where pages show tables and side-by-side panels
const QUERY = '(min-width: 1000px)'

export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(QUERY)
    const update = () => setWide(m.matches)
    m.addEventListener('change', update)
    return () => m.removeEventListener('change', update)
  }, [])
  return wide
}
