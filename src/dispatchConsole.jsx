import React, { useMemo, useState } from 'react'
import { ArrowRightLeft, Check, Clock3, FileWarning, PauseCircle, Play, ShieldAlert, Truck, Wrench } from 'lucide-react'
import { recommendDispatch } from './data/dispatchEngine.ts'
import OperationalCargoPanel from './operationalCargoPanel.jsx'

const timeLabel = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Budapest',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

const statusLabel = (vehicle) => vehicle.status === 'on-hold' ? 'ON HOLD'
  : vehicle.status === 'delayed' || vehicle.priority === 'Delayed' ? 'DELAYED'
    : vehicle.status === 'waiting' ? 'WAITING'
      : vehicle.status === 'called' ? 'CALLED'
        : vehicle.status === 'completed' ? 'COMPLETED · RELEASE DOCK' : 'IN OPERATION'

function activityLabel(type) {
  return ({
    'vehicle-called': 'Vehicle called',
    'dock-assigned': 'Dock assigned',
    'dock-reassigned': 'Dock reassigned',
    'operation-started': 'Operation started',
    'operation-completed': 'Operation completed',
    'vehicle-delayed': 'Vehicle delayed',
    'vehicle-held': 'Vehicle placed on hold',
    'vehicle-resumed': 'Vehicle resumed',
    'dock-released': 'Dock released',
    'dispatch-conflict': 'Dispatch conflict',
    'dispatch-recommended': 'Dispatch recommendation',
    'dispatch-accepted': 'Dispatch accepted',
    'dispatch-rejected': 'Dispatch rejected',
    'cargo-assigned': 'Cargo assigned',
    'cargo-unassigned': 'Cargo unassigned',
    'container-type-changed': 'Container type changed',
    'adr-information-changed': 'ADR information changed',
    'handling-requirement-changed': 'Handling requirement changed',
  })[type] ?? type
}

export default function DispatchConsole({ state, onAction, selectedVehicleId, onSelectVehicle, dataset, onCargoSave, onOpenCargo }) {
  const [selectedDockId, setSelectedDockId] = useState('')
  const queueVehicle = state.queue.find((vehicle) => vehicle.vehicleId === selectedVehicleId)
  const assignedDock = selectedVehicleId
    ? state.docks.find((dock) => dock.vehicleId === selectedVehicleId)
    : null
  const assignedCall = selectedVehicleId
    ? state.callingVehicles.find((call) => call.vehicleId === selectedVehicleId)
    : null
  const vehicle = queueVehicle ?? (assignedDock ? {
    vehicleId: selectedVehicleId,
    plate: assignedDock.plate,
    carrier: assignedDock.carrier,
    load: assignedCall?.load ?? 'Operation in progress',
    count: assignedCall?.count ?? '',
    direction: assignedDock.direction,
    priority: 'Standard',
    queuePosition: 0,
    arrival: '',
    call: assignedCall?.start ?? '',
    arrivalMinutes: null,
    callMinutes: assignedCall?.startMinutes ?? null,
    status: assignedDock.tone === 'called' ? 'called' : assignedDock.tone === 'completed' ? 'completed' : 'in-progress',
    assignedDockId: assignedDock.id,
  } : null)
  const recommendation = useMemo(() => vehicle && !assignedDock
    ? recommendDispatch(vehicle, state.queue, state.docks, state.averageProcessingMinutes, dataset)
    : null, [assignedDock, dataset, state.averageProcessingMinutes, state.docks, state.queue, vehicle])
  const availableDocks = state.docks.filter((dock) =>
    dock.tone === 'available' && !dock.vehicleId && (!dock.plate || dock.plate === '—'))
  const selectedTargetId = selectedDockId || recommendation?.recommendedDockId || ''
  const selectedTarget = availableDocks.find((dock) => dock.id === selectedTargetId)
  const docsBlocked = vehicle?.priority === 'Documentation check'
  const canDispatch = Boolean(vehicle && queueVehicle && recommendation?.recommendedDockId && !docsBlocked)
  const activeVehicles = state.docks.filter((dock) => dock.vehicleId && dock.tone !== 'available')
  const events = [
    ...(state.dispatchEvents ?? []),
    ...(dataset.cargoCompliance?.cargoAssignmentHistory ?? []),
  ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 12)
  const dispatchConflicts = (state.alerts ?? []).filter((alert) => alert.source === 'dispatch')

  const perform = (type, dockId) => {
    if (!vehicle) return
    const result = onAction({ type, vehicleId: vehicle.vehicleId, ...(dockId ? { dockId } : {}) })
    if (result?.conflicts?.length) return
    if (type === 'call' || type === 'assign' || type === 'reassign' || type === 'start' || type === 'complete' || type === 'release') {
      setSelectedDockId('')
    }
  }

  return <section className="dispatch-console panel" aria-labelledby="dispatch-console-title">
    <header className="dispatch-console-heading">
      <div><span className="eyebrow"><Truck size={13} /> Operations control</span><h2 id="dispatch-console-title">Dispatch Console</h2><p>Choose a waiting vehicle to inspect its recommendation and available actions.</p></div>
      <div className="dispatch-mode-stack"><span className={`dispatch-mode ${state.manualControl ? 'operator' : ''}`}>{state.manualControl ? 'Operator-controlled' : 'Auto-dispatch enabled'}</span><small>Working copy · not saved to dataset</small></div>
    </header>
    <div className="dispatch-console-grid">
      <div className="dispatch-vehicle-list">
        <div className="dispatch-subheading"><h3>Vehicles in queue</h3><span>{state.queue.length}</span></div>
        {state.queue.length
          ? <div className="dispatch-vehicle-buttons">{state.queue.map((item) => <button type="button" key={item.vehicleId} className={item.vehicleId === selectedVehicleId ? 'selected' : ''} onClick={() => onSelectVehicle(item.vehicleId)} aria-pressed={item.vehicleId === selectedVehicleId}>
            <span className={`dispatch-priority ${item.tone}`}><i />{item.status === 'on-hold' ? 'HOLD' : item.priority === 'Priority' ? 'HIGH' : item.priority === 'Documentation check' ? 'DOCS' : item.priority === 'Delayed' ? 'DELAY' : 'STD'}</span>
            <strong>{item.plate}</strong><small>#{item.queuePosition} · {item.direction} · {statusLabel(item)}</small>
          </button>)}</div>
          : <div className="dispatch-empty"><Truck size={18} /><span>Queue is clear. Select a dock assignment below to manage an active operation.</span></div>}
        {activeVehicles.length > 0 && <><div className="dispatch-subheading active-assignments-heading"><h3>Assigned / active</h3><span>{activeVehicles.length}</span></div><div className="dispatch-vehicle-buttons">{activeVehicles.map((dock) => <button type="button" key={dock.vehicleId} className={dock.vehicleId === selectedVehicleId ? 'selected' : ''} onClick={() => onSelectVehicle(dock.vehicleId)} aria-pressed={dock.vehicleId === selectedVehicleId}><span className={`dispatch-priority ${dock.tone}`}><i />{dock.tone.toUpperCase()}</span><strong>{dock.plate}</strong><small>Dock {dock.id} · {dock.direction}</small></button>)}</div></>}
      </div>

      <div className="dispatch-recommendation">
        {!vehicle
          ? <div className="dispatch-empty dispatch-select-prompt"><Truck size={24} /><strong>Select a vehicle</strong><span>Choose a queue item or assigned vehicle to view its dispatch status and valid controls.</span></div>
          : <>
            <div className="dispatch-detail-title"><div><span className="dispatch-eyebrow">Selected vehicle</span><h3>{vehicle.plate}</h3><p>{vehicle.carrier} · {vehicle.load}</p></div><span className={`dispatch-status ${vehicle.status}`}>{statusLabel(vehicle)}</span></div>
            <div className="dispatch-vehicle-facts"><span>Direction <b>{vehicle.direction}</b></span><span>Priority <b>{vehicle.priority === 'Priority' ? 'HIGH' : vehicle.priority}</b></span>{assignedDock && <span>Dock <b>{assignedDock.id} · {assignedDock.tone === 'called' ? 'Called' : assignedDock.state}</b></span>}</div>
            <OperationalCargoPanel dataset={dataset} vehicleId={vehicle.vehicleId} onSave={onCargoSave} onOpenCargo={onOpenCargo} />
            {recommendation && <div className={`dispatch-recommend-card ${recommendation.recommendedDockId ? '' : 'blocked'}`}>
              <div className="dispatch-eyebrow">{recommendation.recommendedDockId ? 'Recommended assignment' : 'Dispatch blocked'}</div>
              <strong>{recommendation.recommendedDockId ? `DOCK ${recommendation.recommendedDockId}` : 'No justified recommendation'}</strong>
              <p>{recommendation.reason}</p>
              <div className="dispatch-estimates"><span><Clock3 size={13} />Processing {recommendation.estimatedProcessingTimeMinutes === null ? 'Unavailable' : `~${recommendation.estimatedProcessingTimeMinutes} min`}</span><span><Clock3 size={13} />Wait {recommendation.estimatedWaitTimeMinutes === null ? 'Unavailable' : `~${recommendation.estimatedWaitTimeMinutes} min`}</span><span>Confidence: {recommendation.confidence}</span></div>
              {recommendation.blockingConditions.length > 0 && <ul className="dispatch-blockers">{recommendation.blockingConditions.map((item) => <li key={item.code}><ShieldAlert size={13} />{item.message}</li>)}</ul>}
              {recommendation.warnings.length > 0 && <div className="dispatch-eligibility-warnings" role="status"><strong>Warnings / compatibility uncertainty</strong><ul>{recommendation.warnings.map((message) => <li key={message}>{message}</li>)}</ul></div>}
              {recommendation.blockedDocks.length > 0 && <div className="dispatch-dock-assessments"><strong>Blocked docks</strong>{recommendation.blockedDocks.map((item) => <p key={item.dockId}><b>Dock {item.dockId}</b> · {item.reasons.join(' ')}</p>)}</div>}
              {recommendation.undeterminedDocks.length > 0 && <div className="dispatch-dock-assessments"><strong>Compatibility not determined</strong>{recommendation.undeterminedDocks.map((item) => <p key={item.dockId}><b>Dock {item.dockId}</b> · {item.reasons.join(' ')}</p>)}</div>}
              {recommendation.alternatives.length > 1 && <div className="dispatch-alternatives"><label htmlFor="dispatch-dock-choice">Alternative docks</label><select id="dispatch-dock-choice" value={selectedTargetId} onChange={(event) => setSelectedDockId(event.target.value)}>{recommendation.alternatives.map((item) => <option key={item.dockId} value={item.dockId}>Dock {item.dockId} · ~{item.estimatedWaitTimeMinutes} min wait</option>)}</select></div>}
              {recommendation.alternatives.length > 1 && <div className="dispatch-alternative-explanations">{recommendation.alternatives.map((item) => <span key={item.dockId}><b>Dock {item.dockId}</b> · {item.reason}</span>)}</div>}
            </div>}

            <div className="dispatch-actions" aria-label="Valid dispatch actions">
              {canDispatch && <><button type="button" className="dispatch-action-primary" onClick={() => perform('call', recommendation.recommendedDockId)}><Truck size={14} />Call &amp; assign Dock {recommendation.recommendedDockId}</button><button type="button" onClick={() => selectedTarget && perform('assign', selectedTarget.id)} disabled={!selectedTarget}><Check size={14} />Assign selected dock</button></>}
              {queueVehicle?.status === 'waiting' && !docsBlocked && <button type="button" onClick={() => perform('hold')}><PauseCircle size={14} />Put on hold</button>}
              {queueVehicle?.status === 'on-hold' && <button type="button" onClick={() => perform('resume')}><Play size={14} />Resume from hold</button>}
              {(queueVehicle || assignedDock) && vehicle.status !== 'delayed' && vehicle.status !== 'completed' && <button type="button" onClick={() => perform('delay')}><Clock3 size={14} />Mark delayed</button>}
              {assignedDock?.tone === 'called' && <><button type="button" onClick={() => perform('start', assignedDock.id)}><Play size={14} />Start operation</button>{availableDocks.length > 0 && <><label className="dispatch-inline-label" htmlFor="reassign-dock">Reassign to</label><select id="reassign-dock" value={selectedDockId || availableDocks[0].id} onChange={(event) => setSelectedDockId(event.target.value)}>{availableDocks.map((dock) => <option key={dock.id} value={dock.id}>Dock {dock.id}</option>)}</select><button type="button" onClick={() => perform('reassign', selectedDockId || availableDocks[0].id)}><ArrowRightLeft size={14} />Reassign dock</button></>}<button type="button" onClick={() => perform('release', assignedDock.id)}>Cancel assignment / release dock</button></>}
              {assignedDock && ['loading', 'unloading', 'delayed'].includes(assignedDock.tone) && assignedDock.progress > 0 && <button type="button" className="dispatch-action-primary" onClick={() => perform('complete', assignedDock.id)}><Check size={14} />Complete operation</button>}
              {assignedDock?.tone === 'completed' && <button type="button" className="dispatch-action-primary" onClick={() => perform('release', assignedDock.id)}><Check size={14} />Release completed dock</button>}
              {assignedDock?.tone === 'delayed' && assignedDock.progress === 0 && <button type="button" onClick={() => perform('start', assignedDock.id)}><Play size={14} />Start delayed operation</button>}
            </div>
          </>}
        {dispatchConflicts.length > 0 && <div className="dispatch-recent-conflicts"><strong><FileWarning size={14} /> Dispatch conflicts</strong>{dispatchConflicts.slice(0, 3).map((alert) => <p key={alert.alertId}>{alert.description}</p>)}</div>}
      </div>
    </div>

    <section className="operations-timeline" aria-labelledby="operations-timeline-title">
      <div className="dispatch-subheading"><div><span className="dispatch-eyebrow">Europe/Budapest local display time</span><h3 id="operations-timeline-title">Operations Timeline</h3></div><span>{events.length} recent events</span></div>
      {events.length
        ? <ol>{events.map((event) => <li key={event.eventId} className={event.type === 'dispatch-conflict' ? 'conflict-event' : ''}><time dateTime={event.timestamp}>{timeLabel(event.timestamp)}</time><span className="timeline-event-type">{activityLabel(event.type)}</span><span>{event.description}</span></li>)}</ol>
        : <div className="timeline-empty">Dispatch actions and simulation completions will be recorded here. No UTC timestamps are altered.</div>}
    </section>
  </section>
}
