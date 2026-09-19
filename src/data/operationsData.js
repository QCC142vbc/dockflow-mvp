import demoDataset from '../../data/examples/demo-dataset.json'

export const statusMeta = {
  available: { label: 'Available', className: 'status-available' },
  called: { label: 'Called', className: 'status-called' },
  loading: { label: 'Loading', className: 'status-loading' },
  unloading: { label: 'Unloading', className: 'status-unloading' },
  cleaning: { label: 'Cleaning', className: 'status-cleaning' },
  maintenance: { label: 'Maintenance', className: 'status-maintenance' },
  delayed: { label: 'Delayed', className: 'status-delayed' },
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
  const vehicles = Object.fromEntries(dataset.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]))
  const calling = vehicles[dataset.nowCalling.vehicleId]
  const dock = dataset.docks.find((item) => item.dockId === dataset.nowCalling.dockId)
  const state = {
    datasetId: dataset.datasetId,
    warehouse: dataset.warehouse,
    callingVehicles: [calling, ...dataset.queue.slice(0, 2).map((item) => vehicles[item.vehicleId])].filter(Boolean).map((vehicle, index) => ({
      plate: vehicle.plate,
      carrier: vehicle.carrier,
      load: vehicle.loadType,
      count: `${vehicle.palletCount} pallets`,
      dockId: index === 0 ? dataset.nowCalling.dockId : dataset.nowCalling.dockId,
      start: index === 0 ? dataset.nowCalling.estimatedStart : dataset.queue[index - 1]?.estimatedCallTime,
      note: index === 0 ? dock.notes.replace('Now calling: driver proceed to Dock 07. ', '').replace('.', '') : 'Proceed when called',
      direction: vehicle.direction,
      startMinutes: index === 0 ? timeToMinutes(dataset.nowCalling.estimatedStart) : timeToMinutes(dataset.queue[index - 1]?.estimatedCallTime),
    })),
    queue: dataset.queue.map((item) => ({
      queue: String(item.position).padStart(2, '0'),
      plate: item.plate,
      carrier: item.carrier,
      load: item.loadType,
      arrival: item.arrivalTime,
      call: item.estimatedCallTime,
      priority: item.priority === 'Documentation check' ? 'Doc check' : item.priority,
      direction: vehicles[item.vehicleId]?.direction || 'All',
      tone: item.priority === 'Priority' ? 'priority' : item.priority === 'Delayed' ? 'delayed' : item.priority === 'Documentation check' ? 'docs' : 'standard',
      arrivalMinutes: timeToMinutes(item.arrivalTime),
      callMinutes: timeToMinutes(item.estimatedCallTime),
    })),
    docks: dataset.docks.map((item) => ({
      id: item.dockId,
      state: item.state,
      plate: item.plate,
      carrier: item.carrier,
      elapsedSeconds: item.elapsedSeconds,
      tone: item.status,
      direction: item.direction,
      progress: item.progress,
      appointment: item.appointmentTime,
      notes: item.notes,
      appointmentMinutes: item.appointmentTime === '—' ? null : timeToMinutes(item.appointmentTime),
    })),
    alerts: dataset.alerts,
    arrivals: dataset.kpis.arrivalsToday,
    averageWait: dataset.kpis.averageWaitMinutes,
    delayedShipments: dataset.kpis.delayedShipments,
    tick: 0,
    anchorMinutes: timeToMinutes(dataset.nowCalling.estimatedStart),
  }
  return rebaseOperationsState(state, now)
}

export function rebaseOperationsState(state, now) {
  return {
    ...state,
    callingVehicles: state.callingVehicles.map((vehicle) => ({ ...vehicle, start: displayOperationalTime(vehicle.startMinutes, now, state.anchorMinutes) })),
    queue: state.queue.map((vehicle) => ({ ...vehicle, arrival: displayOperationalTime(vehicle.arrivalMinutes, now, state.anchorMinutes), call: displayOperationalTime(vehicle.callMinutes, now, state.anchorMinutes) })),
    docks: state.docks.map((dock) => ({ ...dock, appointment: dock.appointmentMinutes === null ? '—' : displayOperationalTime(dock.appointmentMinutes, now, state.anchorMinutes) })),
  }
}

export function getBundledDemoState(now = new Date()) {
  return adaptDataset(demoDataset, now)
}

export function advanceOperationsState(previous) {
  const nextIndex = (previous.callingIndex + 1) % previous.callingVehicles.length
  const called = previous.callingVehicles[nextIndex]
  const nextQueue = [...previous.queue.slice(1), { ...previous.queue[0], queue: '06', callMinutes: 530 }]
    .map((vehicle, index) => ({ ...vehicle, queue: String(index + 1).padStart(2, '0'), callMinutes: index === 0 ? called.startMinutes : vehicle.callMinutes }))
  const nextDocks = previous.docks.map((dock) => {
    if (dock.id === called.dockId) return { ...dock, state: 'Available', plate: called.plate, carrier: called.carrier, tone: 'called', direction: called.direction, progress: 0, elapsedSeconds: 0, notes: `Now calling: driver proceed to Dock ${called.dockId}. ${called.note}.` }
    const increment = dock.state === 'Loading' || dock.state === 'Unloading' ? 1 : 0
    return { ...dock, progress: Math.min(99, dock.progress + increment), elapsedSeconds: dock.elapsedSeconds + 15 }
  })
  return { ...previous, callingIndex: nextIndex, queue: nextQueue, docks: nextDocks, arrivals: previous.arrivals + 1, averageWait: Math.max(12, previous.averageWait + (previous.tick % 2 ? 1 : -1)), delayedShipments: previous.delayedShipments + (previous.tick % 3 === 0 ? 1 : 0), tick: previous.tick + 1 }
}
