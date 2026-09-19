import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  Gauge,
  Info,
  MapPin,
  Package,
  Radio,
  RefreshCw,
  ShieldCheck,
  Truck,
  X,
  Zap,
} from 'lucide-react'
import './styles.css'

const queueSeed = [
  { queue: '01', plate: 'LNX-728', carrier: 'Lynx Freight', load: 'Outbound Retail', arrival: '06:42', call: '07:20', priority: 'Priority', direction: 'Outbound', tone: 'priority' },
  { queue: '02', plate: 'KRD-915', carrier: 'Kardex Logistics', load: 'Inbound Pallets', arrival: '06:51', call: '07:35', priority: 'Standard', direction: 'Inbound', tone: 'standard' },
  { queue: '03', plate: 'RMV-304', carrier: 'Redmark Haulage', load: 'Outbound Cases', arrival: '07:03', call: '07:50', priority: 'Delayed', direction: 'Outbound', tone: 'delayed' },
  { queue: '04', plate: 'TXP-611', carrier: 'TransPacific', load: 'Inbound Produce', arrival: '07:11', call: '08:05', priority: 'Doc check', direction: 'Inbound', tone: 'docs' },
  { queue: '05', plate: 'HNL-448', carrier: 'Horizon Lines', load: 'Outbound Retail', arrival: '07:18', call: '08:20', priority: 'Standard', direction: 'Outbound', tone: 'standard' },
  { queue: '06', plate: 'GVC-839', carrier: 'Green Valley', load: 'Inbound Pallets', arrival: '07:26', call: '08:35', priority: 'Standard', direction: 'Inbound', tone: 'standard' },
]

const dockSeed = [
  { id: '01', state: 'Available', plate: '—', carrier: 'Ready for assignment', elapsed: '—', tone: 'available', direction: 'All', progress: 0, appointment: '07:30', notes: 'Bay swept and safety inspection complete.' },
  { id: '02', state: 'Loading', plate: 'JTX-490', carrier: 'Jettison Cargo', elapsed: '00:42', tone: 'loading', direction: 'Outbound', progress: 68, appointment: '06:45', notes: 'Pallet count verified. Seal application pending.' },
  { id: '03', state: 'Unloading', plate: 'NVK-201', carrier: 'Novak Supply', elapsed: '01:18', tone: 'unloading', direction: 'Inbound', progress: 44, appointment: '06:15', notes: 'Two pallets flagged for quality review.' },
  { id: '04', state: 'Loading', plate: 'DHL-779', carrier: 'Deltaline Haulage', elapsed: '00:27', tone: 'loading', direction: 'Outbound', progress: 31, appointment: '07:00', notes: 'Loading frozen goods. Keep bay doors closed.' },
  { id: '05', state: 'Cleaning', plate: '—', carrier: 'Bay sanitation team', elapsed: '00:09', tone: 'cleaning', direction: 'All', progress: 72, appointment: '07:10', notes: 'Post-spill sanitation. Estimated release 07:26.' },
  { id: '06', state: 'Loading', plate: 'QRS-582', carrier: 'QuickRoute Systems', elapsed: '00:56', tone: 'loading', direction: 'Outbound', progress: 82, appointment: '06:30', notes: 'Final carton scan in progress.' },
  { id: '07', state: 'Available', plate: 'ABC-482', carrier: 'NorthLine Transport', elapsed: 'Called', tone: 'called', direction: 'Inbound', progress: 0, appointment: '07:15', notes: 'Now calling: driver proceed to Dock 07. Follow safety signage.' },
  { id: '08', state: 'Unloading', plate: 'WTR-664', carrier: 'Westland Trucking', elapsed: '00:33', tone: 'unloading', direction: 'Inbound', progress: 59, appointment: '06:50', notes: 'Receiving temperature-controlled pallets.' },
  { id: '09', state: 'Loading', plate: 'BXC-117', carrier: 'Boxcar Express', elapsed: '01:05', tone: 'loading', direction: 'Outbound', progress: 77, appointment: '06:20', notes: 'Trailer nearly complete. Awaiting supervisor sign-off.' },
  { id: '10', state: 'Maintenance', plate: '—', carrier: 'Facilities team', elapsed: '—', tone: 'maintenance', direction: 'All', progress: 0, appointment: '—', notes: 'Leveler hydraulic service. Next review at 09:00.' },
  { id: '11', state: 'Delayed', plate: 'MTR-305', carrier: 'MetroHaul', elapsed: '00:24', tone: 'delayed', direction: 'Inbound', progress: 18, appointment: '06:40', notes: 'Documentation mismatch. Operations lead notified.' },
  { id: '12', state: 'Loading', plate: 'PCL-923', carrier: 'Pioneer Carriers', elapsed: '00:38', tone: 'loading', direction: 'Outbound', progress: 52, appointment: '06:55', notes: 'Mixed SKU load. Scan accuracy at 99.6%.' },
]

const callingSeed = [
  { plate: 'ABC-482', carrier: 'NorthLine Transport', load: 'Inbound Pallets', count: '24 pallets', dock: 'Dock 07', start: '07:20', note: 'Follow safety signage' },
  { plate: 'LNX-728', carrier: 'Lynx Freight', load: 'Outbound Retail', count: '18 pallets', dock: 'Dock 07', start: '07:35', note: 'Seal check at the bay' },
]

const statusMeta = {
  available: { label: 'Available', className: 'status-available' },
  called: { label: 'Called', className: 'status-called' },
  loading: { label: 'Loading', className: 'status-loading' },
  unloading: { label: 'Unloading', className: 'status-unloading' },
  cleaning: { label: 'Cleaning', className: 'status-cleaning' },
  maintenance: { label: 'Maintenance', className: 'status-maintenance' },
  delayed: { label: 'Delayed', className: 'status-delayed' },
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function App() {
  const [now, setNow] = useState(new Date(2026, 8, 19, 7, 14, 32))
  const [live, setLive] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [directionFilter, setDirectionFilter] = useState('All')
  const [selectedDock, setSelectedDock] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [callingIndex, setCallingIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setNow((value) => new Date(value.getTime() + 1000))
      if (live) setPulse(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [live])

  useEffect(() => {
    if (!pulse) return undefined
    const timer = setTimeout(() => setPulse(false), 650)
    return () => clearTimeout(timer)
  }, [pulse])

  useEffect(() => {
    if (!live) return undefined
    const timer = setInterval(() => setCallingIndex((value) => (value + 1) % callingSeed.length), 18000)
    return () => clearInterval(timer)
  }, [live])

  const calledVehicle = callingSeed[callingIndex]

  const filteredDocks = useMemo(() => dockSeed.filter((dock) => {
    const byStatus = statusFilter === 'All' || dock.state === statusFilter
    const byDirection = directionFilter === 'All' || dock.direction === directionFilter
    return byStatus && byDirection
  }), [directionFilter, statusFilter])

  return (
    <main className={pulse ? 'app is-pulsing' : 'app'}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Package size={22} strokeWidth={2.4} /></div>
          <div>
            <div className="brand-name">Dock<span>Flow</span></div>
            <div className="brand-subtitle">Dock Assignment &amp; Loading Operations</div>
          </div>
        </div>
        <div className="clock-block">
          <div className="date-line"><CalendarDays size={14} /> {formatDate(now)}</div>
          <div className="live-clock">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</div>
        </div>
        <div className="site-block">
          <div className="site-name">Central Logistics Hub</div>
          <div className="site-meta">
            <span className="connection"><span className="connection-dot" /> System Connected</span>
            <span className="divider" />
            <span>Morning Shift · 06:00—14:00</span>
          </div>
        </div>
      </header>

      <section className="hero-panel" aria-labelledby="now-calling-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Priority dispatch</div>
          <h1 id="now-calling-title">Now Calling</h1>
          <div className="call-row">
            <div className="plate-large">{calledVehicle.plate}</div>
            <div className="carrier-large">
              <strong>{calledVehicle.carrier}</strong>
              <span>{calledVehicle.load} <i>·</i> {calledVehicle.count}</span>
            </div>
          </div>
          <div className="hero-meta">
            <div><span className="meta-label">Assigned dock</span><strong>{calledVehicle.dock}</strong></div>
            <div><span className="meta-label">Estimated start</span><strong>{calledVehicle.start}</strong></div>
            <div><span className="safety-note"><ShieldCheck size={15} /> {calledVehicle.note}</span></div>
          </div>
        </div>
        <div className="hero-action">
          <div className="proceed-label">Driver instruction</div>
          <div className="proceed-status"><ArrowRight size={30} strokeWidth={2.4} /> PROCEED TO DOCK</div>
          <div className="dock-route">
            <div className="route-line"><span className="route-start">GATE</span><span className="route-dash" /><MapPin size={20} fill="currentColor" /><span className="route-end">DOCK 07</span></div>
            <span className="route-caption">North apron · Bay 07</span>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="queue-panel panel">
          <div className="section-heading">
            <div><div className="eyebrow">Next in sequence</div><h2>Waiting Vehicles <span className="count-badge">06</span></h2></div>
            <button className={`live-toggle ${live ? 'active' : ''}`} onClick={() => setLive(!live)} aria-pressed={live}><span className="toggle-track"><span /></span><span>{live ? 'Live updates' : 'Updates paused'}</span><RefreshCw size={14} /></button>
          </div>
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead><tr><th>Queue</th><th>License plate</th><th>Carrier</th><th>Load type</th><th>Arrived</th><th>Est. call</th><th>Priority</th></tr></thead>
              <tbody>{queueSeed.map((item, index) => <tr className={index === 0 ? 'next-row' : ''} key={item.plate}>
                <td><span className="queue-number">{item.queue}</span>{index === 0 && <span className="next-tag">NEXT</span>}</td>
                <td className="plate-cell">{item.plate}</td><td className="carrier-cell">{item.carrier}</td><td>{item.load}</td><td className="muted-cell">{item.arrival}</td><td className="call-time">{item.call}</td>
                <td><span className={`priority-tag ${item.tone}`}><span />{item.priority}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="dock-panel panel">
          <div className="section-heading dock-heading">
            <div><div className="eyebrow">Live floor view</div><h2>Dock Status</h2></div>
            <div className="filters">
              <div className="filter-group">{['All', 'Available', 'Loading', 'Unloading', 'Delayed'].map((filter) => <button className={statusFilter === filter ? 'filter-active' : ''} onClick={() => setStatusFilter(filter)} key={filter}>{filter}</button>)}</div>
              <div className="direction-filter"><span>Direction</span><select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)}><option>All</option><option>Inbound</option><option>Outbound</option></select></div>
            </div>
          </div>
          <div className="dock-grid">{filteredDocks.map((dock) => <button className={`dock-card ${dock.tone} ${dock.id === '07' ? 'dock-called' : ''}`} key={dock.id} onClick={() => setSelectedDock(dock)}>
            <div className="dock-top"><span className="dock-id">DOCK {dock.id}</span><span className={`status-pill ${statusMeta[dock.tone].className}`}><span />{statusMeta[dock.tone].label}</span></div>
            <div className="dock-truck">{dock.plate === '—' ? <span className="empty-truck"><Truck size={18} /> Open bay</span> : <><strong>{dock.plate}</strong><span>{dock.carrier}</span></>}</div>
            <div className="dock-bottom"><span>{dock.elapsed}</span>{dock.progress > 0 && <span className="progress-track"><span style={{ width: `${dock.progress}%` }} /></span>}</div>
          </button>)}</div>
          <div className="dock-legend"><span><i className="legend-dot available" /> Available <b>3</b></span><span><i className="legend-dot loading" /> Loading <b>4</b></span><span><i className="legend-dot unloading" /> Unloading <b>2</b></span><span><i className="legend-dot issue" /> Attention <b>3</b></span><span className="legend-note"><Info size={13} /> Select a dock for details</span></div>
        </div>
      </section>

      <footer className="metrics">
        <Metric icon={<Truck size={19} />} label="Today’s Arrivals" value="86" detail="+12 vs yesterday" tone="blue" />
        <Metric icon={<Clock3 size={19} />} label="Average Waiting Time" value="18 min" detail="↓ 4 min this shift" tone="green" />
        <Metric icon={<Gauge size={19} />} label="Active Docks" value="9 / 12" detail="75% utilization" tone="amber" />
        <Metric icon={<BellRing size={19} />} label="Delayed Shipments" value="03" detail="2 require attention" tone="red" />
        <div className="footer-sync"><Radio size={14} /> Last sync <strong>07:14:31</strong><span>·</span> v2.4.1</div>
      </footer>

      {selectedDock && <div className="modal-backdrop" onClick={() => setSelectedDock(null)}><aside className="dock-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close-modal" onClick={() => setSelectedDock(null)} aria-label="Close dock details"><X size={20} /></button>
        <div className="modal-eyebrow"><span className={`legend-dot ${selectedDock.tone}`} /> Dock detail</div>
        <h2>Dock {selectedDock.id}</h2>
        <div className={`modal-status ${statusMeta[selectedDock.tone].className}`}>{statusMeta[selectedDock.tone].label}</div>
        <div className="modal-truck"><div className="modal-plate">{selectedDock.plate}</div><div><strong>{selectedDock.carrier}</strong><span>{selectedDock.direction === 'All' ? 'Bay operations' : `${selectedDock.direction} shipment`}</span></div></div>
        <div className="detail-list"><div><span>Operation progress</span><strong>{selectedDock.progress ? `${selectedDock.progress}%` : 'Ready'}</strong></div><div><span>Appointment time</span><strong>{selectedDock.appointment}</strong></div><div><span>Elapsed time</span><strong>{selectedDock.elapsed}</strong></div></div>
        {selectedDock.progress > 0 && <div className="modal-progress"><div><span>Current operation</span><b>{selectedDock.progress}%</b></div><div className="progress-track"><span style={{ width: `${selectedDock.progress}%` }} /></div></div>}
        <div className="modal-note"><FileCheck2 size={16} /><span>{selectedDock.notes}</span></div>
      </aside></div>}
    </main>
  )
}

function Metric({ icon, label, value, detail, tone }) {
  return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className={`metric-detail ${tone}`}>{detail}</span></div></div>
}

export default App

createRoot(document.getElementById('root')).render(<App />)
