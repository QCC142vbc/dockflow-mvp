import React, { useEffect, useRef } from 'react'
import { ArrowRight, BellRing, CalendarDays, Clock3, FileCheck2, Gauge, Info, MapPin, Package, Radio, RefreshCw, ShieldCheck, Truck, X, AlertTriangle, Wrench, FileWarning } from 'lucide-react'
import { formatElapsed, statusMeta } from './data/operationsData'

export function Header({ now }) {
  const clockOptions = { timeZone: 'Europe/Budapest', hour12: false }
  const dateOptions = { timeZone: 'Europe/Budapest', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }
  return <header className="topbar">
    <div className="brand-lockup"><div className="brand-mark"><Package size={22} /></div><div><div className="brand-name">Dock<span>Flow</span></div><div className="brand-subtitle">Dock Assignment &amp; Loading Operations</div></div></div>
    <div className="clock-block"><div className="date-line"><CalendarDays size={14} /> {now.toLocaleDateString('en-US', dateOptions)}</div><div className="live-clock">{now.toLocaleTimeString('en-GB', clockOptions)}</div></div>
    <div className="site-block"><div className="site-name">Central Logistics Hub</div><div className="site-meta"><span className="connection"><span className="connection-dot" /> System Connected</span><span className="divider" /><span>Morning Shift · 06:00—14:00</span></div></div>
  </header>
}

export function NowCallingPanel({ vehicle }) {
  return <section className="hero-panel" aria-labelledby="now-calling-title"><div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> Priority dispatch</div><h1 id="now-calling-title">Now Calling</h1><div className="call-row"><div className="plate-large">{vehicle.plate}</div><div className="carrier-large"><strong>{vehicle.carrier}</strong><span>{vehicle.load} <i>·</i> {vehicle.count}</span></div></div><div className="hero-meta"><div><span className="meta-label">Assigned dock</span><strong>Dock {vehicle.dockId}</strong></div><div><span className="meta-label">Estimated start</span><strong>{vehicle.start}</strong></div><div><span className="safety-note"><ShieldCheck size={15} /> {vehicle.note}</span></div></div></div><div className="hero-action"><div className="proceed-label">Driver instruction</div><div className="proceed-status"><ArrowRight size={30} /> PROCEED TO DOCK</div><div className="dock-route"><div className="route-line"><span className="route-start">GATE</span><span className="route-dash" /><MapPin size={20} fill="currentColor" /><span className="route-end">DOCK {vehicle.dockId}</span></div><span className="route-caption">North apron · Bay {vehicle.dockId}</span></div></div></section>
}

const attentionIcon = { critical: <AlertTriangle size={16} />, warning: <FileWarning size={16} />, info: <Wrench size={16} /> }
export function AttentionPanel({ docks, onSelect }) {
  const alerts = docks.filter((dock) => ['delayed', 'maintenance', 'cleaning'].includes(dock.tone)).map((dock) => ({
    ...dock, severity: dock.tone === 'delayed' ? 'critical' : dock.tone === 'maintenance' ? 'warning' : 'info',
    summary: dock.tone === 'delayed' ? 'Documentation mismatch' : dock.tone === 'maintenance' ? 'Leveler maintenance in progress' : 'Bay sanitation underway',
    action: dock.tone === 'delayed' ? 'Operations lead notified' : dock.tone === 'maintenance' ? 'Next review at 09:00' : 'Estimated release 07:26',
  }))
  if (!alerts.length) return null
  return <section className="attention-panel panel" aria-labelledby="attention-title"><div className="attention-heading"><div><div className="eyebrow">Exceptions queue</div><h2 id="attention-title">Requires Attention <span className="count-badge">{String(alerts.length).padStart(2, '0')}</span></h2></div><span className="attention-summary"><BellRing size={15} /> Active issues</span></div><div className="attention-list">{alerts.map((alert) => <button className={`alert-row ${alert.severity}`} key={alert.id} onClick={() => onSelect(alert)} aria-label={`Open Dock ${alert.id} ${alert.summary}`}><span className="alert-icon">{attentionIcon[alert.severity]}</span><span className="alert-dock">DOCK {alert.id}</span><span className="alert-copy"><strong>{alert.summary}</strong><span>{alert.action}</span></span><span className="alert-time">{formatElapsed(alert.elapsedSeconds)}<small>{alert.severity === 'critical' ? 'CRITICAL' : alert.severity === 'warning' ? 'WARNING' : 'INFO'}</small></span></button>)}</div></section>
}

export function QueueTable({ queue, live, setLive }) {
  return <section className="queue-panel panel"><div className="section-heading"><div><div className="eyebrow">Next in sequence</div><h2>Waiting Vehicles <span className="count-badge">{String(queue.length).padStart(2, '0')}</span></h2></div><button className={`live-toggle ${live ? 'active' : ''}`} onClick={() => setLive(!live)} aria-pressed={live} aria-label={live ? 'Pause live simulation' : 'Resume live simulation'}><span className="toggle-track"><span /></span><span>{live ? 'Live simulation' : 'Simulation paused'}</span><RefreshCw size={14} /></button></div><div className="queue-table-wrap"><table className="queue-table"><thead><tr><th>Queue</th><th>License plate</th><th>Carrier</th><th>Load type</th><th>Arrived</th><th>Est. call</th><th>Priority</th></tr></thead><tbody>{queue.map((item, index) => <tr className={index === 0 ? 'next-row' : ''} key={`${item.plate}-${item.queue}`}><td><span className="queue-number">{item.queue}</span>{index === 0 && <span className="next-tag">NEXT</span>}</td><td className="plate-cell">{item.plate}</td><td className="carrier-cell">{item.carrier}</td><td>{item.load}</td><td className="muted-cell">{item.arrival}</td><td className="call-time">{item.call}</td><td><span className={`priority-tag ${item.tone}`}><span />{item.priority}</span></td></tr>)}</tbody></table></div></section>
}

export function DockCard({ dock, onSelect }) {
  const meta = statusMeta[dock.tone]
  return <button className={`dock-card ${dock.tone} ${dock.id === '07' ? 'dock-called' : ''}`} onClick={() => onSelect(dock)} aria-label={`Open details for Dock ${dock.id}, ${meta.label}, ${dock.plate}`}><div className="dock-top"><span className="dock-id">DOCK {dock.id}</span><span className={`status-pill ${meta.className}`}><span />{meta.label}</span></div><div className="dock-truck">{dock.plate === '—' ? <span className="empty-truck"><Truck size={18} /> Open bay</span> : <><strong>{dock.plate}</strong><span>{dock.carrier}</span></>}</div><div className="dock-bottom"><span>{dock.elapsedSeconds ? formatElapsed(dock.elapsedSeconds) : dock.tone === 'called' ? 'Called' : '—'}</span>{dock.progress > 0 && <span className="progress-track"><span style={{ width: `${dock.progress}%` }} /></span>}</div></button>
}

export function DockGrid({ docks, statusFilter, setStatusFilter, directionFilter, setDirectionFilter, onSelect }) {
  const filters = ['All', 'Available', 'Loading', 'Unloading', 'Delayed']
  return <section className="dock-panel panel"><div className="section-heading dock-heading"><div><div className="eyebrow">Live floor view</div><h2>Dock Status</h2></div><div className="filters"><div className="filter-group">{filters.map((filter) => <button key={filter} className={statusFilter === filter ? 'filter-active' : ''} onClick={() => setStatusFilter(filter)} aria-pressed={statusFilter === filter}>{filter}</button>)}</div><label className="direction-filter"><span>Direction</span><select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} aria-label="Filter by shipment direction"><option>All</option><option>Inbound</option><option>Outbound</option></select></label></div></div><div className="dock-grid">{docks.map((dock) => <DockCard key={dock.id} dock={dock} onSelect={onSelect} />)}</div><DockLegend docks={docks} /></section>
}

function DockLegend({ docks }) {
  const totals = docks.reduce((acc, dock) => { const key = ['maintenance', 'delayed', 'cleaning'].includes(dock.tone) ? 'attention' : dock.tone; acc[key] = (acc[key] || 0) + 1; return acc }, {})
  return <div className="dock-legend"><span><i className="legend-dot available" /> Available <b>{totals.available || 0}</b></span><span><i className="legend-dot loading" /> Loading <b>{totals.loading || 0}</b></span><span><i className="legend-dot unloading" /> Unloading <b>{totals.unloading || 0}</b></span><span><i className="legend-dot issue" /> Attention <b>{totals.attention || 0}</b></span><span className="legend-note"><Info size={13} /> Select a dock for details</span></div>
}

export function MetricsBar({ state }) {
  const active = state.docks.filter((dock) => !['available', 'called'].includes(dock.tone)).length
  const metrics = [{ icon: <Truck size={19} />, label: 'Today’s Arrivals', value: state.arrivals, detail: '+12 vs yesterday', tone: 'blue' }, { icon: <Clock3 size={19} />, label: 'Average Waiting Time', value: `${state.averageWait} min`, detail: '↓ 4 min this shift', tone: 'green' }, { icon: <Gauge size={19} />, label: 'Active Docks', value: `${active} / 12`, detail: `${Math.round(active / 12 * 100)}% utilization`, tone: 'amber' }, { icon: <BellRing size={19} />, label: 'Delayed Shipments', value: String(state.delayedShipments).padStart(2, '0'), detail: 'Requires attention', tone: 'red' }]
  return <footer className="metrics">{metrics.map((metric) => <div className="metric" key={metric.label}><div className={`metric-icon ${metric.tone}`}>{metric.icon}</div><div><span className="metric-label">{metric.label}</span><strong className="metric-value">{metric.value}</strong><span className={`metric-detail ${metric.tone}`}>{metric.detail}</span></div></div>)}<div className="footer-sync"><Radio size={14} /> Live simulation <strong>· 18 sec cycle</strong></div></footer>
}

export function DockDetailModal({ dock, onClose }) {
  const modalRef = useRef(null)
  const previousFocus = useRef(null)
  useEffect(() => { previousFocus.current = document.activeElement; modalRef.current?.focus(); const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', onKeyDown); return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus?.() } }, [onClose])
  const meta = statusMeta[dock.tone]
  return <div className="modal-backdrop" onClick={onClose}><aside className="dock-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="dock-detail-title" tabIndex="-1" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={onClose} aria-label="Close dock details"><X size={20} /></button><div className="modal-eyebrow"><span className={`legend-dot ${dock.tone}`} /> Dock detail</div><h2 id="dock-detail-title">Dock {dock.id}</h2><div className={`modal-status ${meta.className}`}>{meta.label}</div><div className="modal-truck"><div className="modal-plate">{dock.plate}</div><div><strong>{dock.carrier}</strong><span>{dock.direction === 'All' ? 'Bay operations' : `${dock.direction} shipment`}</span></div></div><div className="detail-list"><div><span>Operation progress</span><strong>{dock.progress ? `${dock.progress}%` : 'Ready'}</strong></div><div><span>Appointment time</span><strong>{dock.appointment}</strong></div><div><span>Elapsed time</span><strong>{dock.elapsedSeconds ? formatElapsed(dock.elapsedSeconds) : dock.tone === 'called' ? 'Called' : '—'}</strong></div></div>{dock.progress > 0 && <div className="modal-progress"><div><span>Current operation</span><b>{dock.progress}%</b></div><div className="progress-track"><span style={{ width: `${dock.progress}%` }} /></div></div>}<div className="modal-note"><FileCheck2 size={16} /><span>{dock.notes}</span></div></aside></div>
}
