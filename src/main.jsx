import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getBundledDemoState } from './data/operationsData'
import { useSimulation } from './simulation'
import { AttentionPanel, DockDetailModal, DockGrid, Header, MetricsBar, NowCallingPanel, QueueTable } from './components'
import './styles.css'

function App() {
  const [now, setNow] = useState(() => new Date())
  const [live, setLive] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [directionFilter, setDirectionFilter] = useState('All')
  const [selectedDock, setSelectedDock] = useState(null)
  const { state, pulse } = useSimulation(live, now)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const calledVehicle = state.callingVehicles[state.callingIndex]
  const filteredDocks = useMemo(() => state.docks.filter((dock) => (statusFilter === 'All' || dock.state === statusFilter) && (directionFilter === 'All' || dock.direction === directionFilter)), [directionFilter, state.docks, statusFilter])

  return <main className={pulse ? 'app is-pulsing' : 'app'}><Header now={now} /><NowCallingPanel vehicle={calledVehicle} /><AttentionPanel docks={state.docks} onSelect={setSelectedDock} /><section className="content-grid"><QueueTable queue={state.queue} live={live} setLive={setLive} /><DockGrid docks={filteredDocks} statusFilter={statusFilter} setStatusFilter={setStatusFilter} directionFilter={directionFilter} setDirectionFilter={setDirectionFilter} onSelect={setSelectedDock} /></section><MetricsBar state={state} />{selectedDock && <DockDetailModal dock={selectedDock} onClose={() => setSelectedDock(null)} />}</main>
}

createRoot(document.getElementById('root')).render(<App />)
