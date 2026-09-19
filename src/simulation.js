import { useEffect, useState } from 'react'
import { advanceOperationsState, getBundledDemoState, rebaseOperationsState } from './data/operationsData'

export function useSimulation(live, now) {
  const [state, setState] = useState(() => ({ ...getBundledDemoState(now), callingIndex: 0 }))
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    setState((current) => rebaseOperationsState(current, now))
  }, [now])

  useEffect(() => {
    if (!live) return undefined
    const timer = setInterval(() => {
      setState((current) => advanceOperationsState(current))
      setPulse(true)
      const pulseTimer = setTimeout(() => setPulse(false), 650)
      return () => clearTimeout(pulseTimer)
    }, 18000)
    return () => clearInterval(timer)
  }, [live])

  return { state, pulse }
}
