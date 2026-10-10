import demoDataset from '../../data/examples/demo-dataset.json' with { type: 'json' }
import { applyDispatchAction, recommendDispatch, selectNextDispatchVehicle } from './dispatchEngine.ts'

export const statusMeta = {
  available: { label: 'Available', className: 'status-available' },
  called: { label: 'Called', className: 'status-called' },
  loading: { label: 'Loading', className: 'status-loading' },
  unloading: { label: 'Unloading', className: 'status-unloading' },
  cleaning: { label: 'Cleaning', className: 'status-cleaning' },
  maintenance: { label: 'Maintenance', className: 'status-maintenance' },
  delayed: { label: 'Delayed', className: 'status-delayed' },
  completed: { label: 'Completed · release', className: 'status-completed' },
}

export const formatElapsed = (seconds) => seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '—'
const timeToMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
const formatClock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
export function displayOperationalTime(sourceMinutes, now, anchorMinutes = 440) {
  const current = new Date(now)
  const currentParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(current)
  const currentMinutes = Number(currentParts.find((part) => part.type === 'hour').value) * 60 + Number(currentParts.find((part) => part.type === 'minute').value)
  return formatClock(currentMinutes + sourceMinutes - anchorMinutes + 1440)
}

export function adaptDataset(dataset, now = new Date()) {
  const datasetVehicles = dataset.vehicles ?? []
  const datasetQueue = dataset.queue ?? []
  const datasetDocks = dataset.docks ?? []
  const kpis = dataset.kpis ?? {}
  const vehicles = Object.fromEntries(datasetVehicles.map((vehicle) => [vehicle.vehicleId, vehicle]))
  const activeVehicle = dataset.nowCalling ? vehicles[dataset.nowCalling.vehicleId] : null
  const activeDockId = dataset.nowCalling?.dockId
  const activeDock = datasetDocks.find((item) => item.dockId === activeDockId) ?? null
  const callingVehicles = activeVehicle ? [{
    vehicleId: activeVehicle.vehicleId,
    plate: activeVehicle.plate,
    carrier: activeVehicle.carrier,
    load: activeVehicle.loadType,
    count: `${activeVehicle.palletCount} pallets`,
    dockId: activeDockId,
    start: dataset.nowCalling.estimatedStart,
    note: ((activeDock?.notes ?? '').replace(new RegExp(`^Now calling: driver proceed to Dock ${activeDockId}\\.\\s*`, 'i'), '').replace(/\.$/, '') || 'Proceed to dock'),
    direction: activeVehicle.direction,
    startMinutes: timeToMinutes(dataset.nowCalling.estimatedStart),
  }] : []
  const state = {
    operationalDataset: dataset,
    datasetId: dataset.datasetId,
    datasetName: dataset.datasetName || dataset.simulationConfig?.datasetName || dataset.warehouse?.name,
    warehouse: dataset.warehouse,
    callingVehicles,
    callingIndex: 0,
    queue: datasetQueue.map((item) => ({
      vehicleId: item.vehicleId,
      queue: String(item.position).padStart(2, '0'),
      queuePosition: item.position,
      plate: item.plate,
      carrier: item.carrier,
      load: item.loadType,
      count: `${vehicles[item.vehicleId]?.palletCount ?? 0} pallets`,
      arrival: item.arrivalTime,
      call: item.estimatedCallTime,
      priority: item.priority,
      direction: vehicles[item.vehicleId]?.direction || 'All',
      tone: item.priority === 'Priority' ? 'priority' : item.priority === 'Delayed' ? 'delayed' : item.priority === 'Documentation check' ? 'docs' : 'standard',
      arrivalMinutes: timeToMinutes(item.arrivalTime),
      callMinutes: timeToMinutes(item.estimatedCallTime),
      status: 'waiting',
    })),
    docks: datasetDocks.map((item) => ({
      id: item.dockId,
      state: item.status === 'called' ? 'Available' : item.state,
      plate: item.plate,
      carrier: item.carrier,
      elapsedSeconds: item.elapsedSeconds,
      tone: item.status,
      direction: item.direction,
      progress: item.progress,
      appointment: item.appointmentTime,
      notes: item.notes,
      vehicleId: item.vehicleId,
      capabilityCodes: item.capabilityCodes,
      appointmentMinutes: item.appointmentTime === '—' ? null : timeToMinutes(item.appointmentTime),
    })),
    alerts: (dataset.alerts ?? []).map((alert, index) => ({
      ...alert,
      alertId: alert.alertId ?? alert.id ?? `alert-${index + 1}`,
    })),
    arrivals: kpis.arrivalsToday ?? 0,
    averageWait: kpis.averageWaitMinutes ?? 0,
    delayedShipments: kpis.delayedShipments ?? 0,
    throughputEstimate: kpis.throughputEstimate,
    averageProcessingMinutes: kpis.averageProcessingMinutes,
    onTimeRate: kpis.onTimeRate,
    availableCapacity: kpis.availableCapacity ?? Math.max(0, datasetDocks.filter((dock) => dock.state !== 'Maintenance').length),
    capacityUtilization: kpis.capacityUtilization,
    dispatchEvents: [],
    dispatchAlerts: [],
    vehicleStatuses: Object.fromEntries(datasetQueue.map((item) => [item.vehicleId, 'waiting'])),
    manualControl: false,
    autoCallVehicleIds: dataset.nowCalling ? [dataset.nowCalling.vehicleId] : [],
    tick: 0,
    anchorMinutes: dataset.nowCalling ? timeToMinutes(dataset.nowCalling.estimatedStart) : 440,
  }
  return rebaseOperationsState(state, now)
}

export function rebaseOperationsState(state, now) {
  return {
    ...state,
    callingVehicles: (state.callingVehicles ?? []).map((vehicle) => ({ ...vehicle, start: displayOperationalTime(vehicle.startMinutes, now, state.anchorMinutes) })),
    queue: (state.queue ?? []).map((vehicle) => ({ ...vehicle, arrival: displayOperationalTime(vehicle.arrivalMinutes, now, state.anchorMinutes), call: displayOperationalTime(vehicle.callMinutes, now, state.anchorMinutes) })),
    docks: (state.docks ?? []).map((dock) => ({ ...dock, appointment: dock.appointmentMinutes === null ? '—' : displayOperationalTime(dock.appointmentMinutes, now, state.anchorMinutes) })),
  }
}

export function getBundledDemoState(now = new Date()) {
  return adaptDataset(demoDataset, now)
}

export function withWorkingOperations(dataset, state) {
  const dockRecords = (state.docks ?? []).map((dock) => ({
    dockId: dock.id,
    state: dock.state,
    status: dock.tone,
    vehicleId: dock.vehicleId ?? null,
    plate: dock.plate,
    carrier: dock.carrier,
    direction: dock.direction,
    progress: dock.progress,
    elapsedSeconds: dock.elapsedSeconds,
    appointmentTime: dock.appointment,
    notes: dock.notes,
    capabilityCodes: dock.capabilityCodes,
  }))
  const queueRecords = (state.queue ?? []).map((vehicle, index) => ({
    queueId: `working-${vehicle.vehicleId}`,
    position: vehicle.queuePosition ?? index + 1,
    vehicleId: vehicle.vehicleId,
    plate: vehicle.plate,
    carrier: vehicle.carrier,
    loadType: vehicle.load,
    arrivalTime: vehicle.arrival,
    estimatedCallTime: vehicle.call,
    priority: vehicle.status === 'delayed' ? 'Delayed' : vehicle.priority,
  }))
  const delayedShipments = queueRecords.filter((item) => item.priority === 'Delayed').length +
    dockRecords.filter((item) => item.status === 'delayed').length
  const currentCall = state.callingVehicles?.[state.callingIndex]
  return {
    ...dataset,
    nowCalling: currentCall ? {
      vehicleId: currentCall.vehicleId,
      dockId: currentCall.dockId,
      instruction: 'PROCEED TO DOCK',
      estimatedStart: currentCall.start,
    } : null,
    docks: dockRecords,
    queue: queueRecords,
    alerts: state.alerts ?? [],
    kpis: {
      ...dataset.kpis,
      activeDocks: dockRecords.filter((dock) => dock.state !== 'Available').length,
      delayedShipments,
      queueLength: queueRecords.length,
    },
  }
}

export function advanceOperationsState(previous, timestamp = new Date().toISOString()) {
  if (!previous) return previous

  const nextDocks = (previous.docks ?? []).map((dock) => {
    if (dock.tone === 'called') {
      if (previous.manualControl || !(previous.autoCallVehicleIds ?? []).includes(dock.vehicleId)) return dock
      const state = dock.direction === 'Inbound' ? 'Unloading' : 'Loading'
      return { ...dock, state, tone: state.toLowerCase(), progress: 10, elapsedSeconds: (dock.elapsedSeconds ?? 0) + 15, notes: 'Operation progressing within planned window.' }
    }
    if (dock.state !== 'Loading' && dock.state !== 'Unloading') return dock

    const progress = Math.min(previous.manualControl ? 99 : 100, (dock.progress ?? 0) + 10)
    return { ...dock, progress, elapsedSeconds: (dock.elapsedSeconds ?? 0) + 15 }
  })
  let next = {
    ...previous,
    docks: nextDocks,
    autoCallVehicleIds: (previous.autoCallVehicleIds ?? []).filter((vehicleId) =>
      nextDocks.some((dock) => dock.vehicleId === vehicleId && dock.tone === 'called')),
    tick: (previous.tick ?? 0) + 1,
  }
  const justCompleted = nextDocks.filter((dock) => dock.progress >= 100 && ['Loading', 'Unloading'].includes(dock.state))
  for (const dock of justCompleted) {
    const result = applyDispatchAction(next, { type: 'complete', vehicleId: dock.vehicleId, dockId: dock.id }, timestamp)
    let completedState = { ...result.state, manualControl: previous.manualControl }
    if (!previous.manualControl && !result.conflicts.length) {
      const release = applyDispatchAction(completedState, { type: 'release', vehicleId: dock.vehicleId, dockId: dock.id }, timestamp)
      completedState = { ...release.state, manualControl: previous.manualControl }
    }
    next = completedState
  }
  if (!previous.manualControl) {
    const candidate = selectNextDispatchVehicle(next.queue, next.docks, next.averageProcessingMinutes, next.operationalDataset)
    if (candidate) {
      const recommendation = recommendDispatch(candidate, next.queue, next.docks, next.averageProcessingMinutes, next.operationalDataset)
      if (recommendation.recommendedDockId) {
        const result = applyDispatchAction(next, { type: 'call', vehicleId: candidate.vehicleId, dockId: recommendation.recommendedDockId }, timestamp)
        next = {
          ...result.state,
          manualControl: previous.manualControl,
          autoCallVehicleIds: [...(next.autoCallVehicleIds ?? []), candidate.vehicleId],
        }
      }
    }
  }
  return {
    ...next,
    callingVehicles: (next.callingVehicles ?? []).filter((call) =>
      next.docks.some((dock) => dock.id === call.dockId && dock.tone === 'called')),
    callingIndex: 0,
    dispatchAlerts: (next.dispatchAlerts ?? []).filter((alert) =>
      !(next.docks.some((dock) => dock.id === alert.dockId && dock.tone === 'available'))),
  }
}
