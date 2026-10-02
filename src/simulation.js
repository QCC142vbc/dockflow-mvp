import { useCallback, useEffect, useRef, useState } from 'react'
import { adaptDataset, advanceOperationsState, rebaseOperationsState } from './data/operationsData'
import { applyDispatchAction } from './data/dispatchEngine.ts'

export function useSimulation(live, now, dataset) {
  const [state, setState] = useState(() => ({ ...adaptDataset(dataset, now), callingIndex: 0 }))
  const stateRef = useRef(state)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const next = { ...adaptDataset(dataset, now), callingIndex: 0 }
    stateRef.current = next
    setState(next)
  }, [dataset.datasetId])

  useEffect(() => {
    setState((current) => {
      const next = { ...current, operationalDataset: dataset }
      stateRef.current = next
      return next
    })
  }, [dataset])

  useEffect(() => {
    setState((current) => {
      const next = rebaseOperationsState(current, now)
      stateRef.current = next
      return next
    })
  }, [now])

  useEffect(() => {
    if (!live) return undefined
    let pulseTimer
    const timer = setInterval(() => {
      setState((current) => {
        const next = advanceOperationsState(current)
        stateRef.current = next
        return next
      })
      setPulse(true)
      clearTimeout(pulseTimer)
      pulseTimer = setTimeout(() => {
        setPulse(false)
        pulseTimer = undefined
      }, 650)
    }, 18000)
    return () => {
      clearInterval(timer)
      clearTimeout(pulseTimer)
    }
  }, [live])

  const dispatchAction = useCallback((action) => {
    const result = applyDispatchAction(stateRef.current, action)
    stateRef.current = result.state
    setState(result.state)
    return result
  }, [])

  return { state, pulse, dispatchAction }
}
