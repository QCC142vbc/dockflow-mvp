import type {
  AlertRecord,
  DockRecord,
  OperationsDataset,
  QueueRecord,
  SimulationInputConfig,
  SimulationKpis,
  SimulationPreview,
  SimulationScenario,
  VehicleRecord,
} from './datasetTypes'
import { validateCargoComplianceData } from './cargoComplianceValidation.ts'

const SCENARIOS: SimulationScenario[] = ['normal', 'busy-day', 'disruption', 'maintenance']
const pad = (value: number) => String(value).padStart(2, '0')
const localDateTime = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T08:00`
const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const isFiniteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const isValidLocalDateTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
  const parsed = new Date(value)
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  return !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day &&
    parsed.getHours() === hours && parsed.getMinutes() === minutes
}

const BASE_CONFIG: SimulationInputConfig = {
  datasetName: 'Warehouse operations simulation',
  scenario: 'normal',
  simulationDateTime: localDateTime(new Date()),
  dockCount: 8,
  vehicleCount: 24,
  utilizationTarget: 75,
  averageServiceMinutes: 42,
  averageArrivalIntervalMinutes: 18,
  warehouseName: 'Central Logistics Hub',
  incomingShipments: 14,
  outgoingShipments: 10,
  priorityPercent: 12,
  carrierName: 'NorthStar Freight',
  optionalNotes: '',
  maintenanceDockCount: 0,
  disruptionDelayMinutes: 0,
  seed: 20261002,
}

const SCENARIO_OVERRIDES: Record<SimulationScenario, Partial<SimulationInputConfig>> = {
  normal: {},
  'busy-day': {
    dockCount: 10,
    vehicleCount: 42,
    utilizationTarget: 92,
    averageServiceMinutes: 48,
    averageArrivalIntervalMinutes: 10,
    incomingShipments: 24,
    outgoingShipments: 18,
    priorityPercent: 18,
  },
  disruption: {
    vehicleCount: 36,
    utilizationTarget: 96,
    averageServiceMinutes: 60,
    averageArrivalIntervalMinutes: 9,
    incomingShipments: 20,
    outgoingShipments: 16,
    priorityPercent: 22,
    disruptionDelayMinutes: 45,
  },
  maintenance: {
    dockCount: 8,
    vehicleCount: 32,
    utilizationTarget: 90,
    averageArrivalIntervalMinutes: 12,
    incomingShipments: 20,
    outgoingShipments: 12,
    maintenanceDockCount: 2,
  },
}

export function createDefaultConfig(): SimulationInputConfig {
  return { ...BASE_CONFIG }
}

export function getScenarioDefaults(scenario: SimulationScenario): SimulationInputConfig {
  const selected = SCENARIOS.includes(scenario) ? scenario : 'normal'
  return { ...BASE_CONFIG, ...SCENARIO_OVERRIDES[selected], scenario: selected }
}

export function validateSimulationConfig(config: SimulationInputConfig): Partial<Record<keyof SimulationInputConfig, string>> {
  const errors: Partial<Record<keyof SimulationInputConfig, string>> = {}
  if (!config || typeof config !== 'object') return { datasetName: 'Enter a valid simulation configuration.' }
  if (typeof config.datasetName !== 'string' || config.datasetName.trim().length < 1 || config.datasetName.trim().length > 100) errors.datasetName = 'Name must be between 1 and 100 characters.'
  if (!SCENARIOS.includes(config.scenario)) errors.scenario = 'Choose a supported scenario.'
  if (!isValidLocalDateTime(config.simulationDateTime)) errors.simulationDateTime = 'Enter a valid local date and time.'
  if (!isIntegerInRange(config.dockCount, 1, 24)) errors.dockCount = 'Dock count must be an integer from 1 to 24.'
  if (!isIntegerInRange(config.vehicleCount, 0, 500)) errors.vehicleCount = 'Vehicle count must be an integer from 0 to 500.'
  if (!isFiniteInRange(config.utilizationTarget, 0, 100)) errors.utilizationTarget = 'Utilization target must be from 0 to 100%.'
  if (!isFiniteInRange(config.averageServiceMinutes, Number.MIN_VALUE, 1440)) errors.averageServiceMinutes = 'Average service time must be greater than 0 and no more than 1,440 minutes.'
  if (!isFiniteInRange(config.averageArrivalIntervalMinutes, Number.MIN_VALUE, 1440)) errors.averageArrivalIntervalMinutes = 'Average arrival interval must be greater than 0 and no more than 1,440 minutes.'
  if (typeof config.warehouseName !== 'string' || !config.warehouseName.trim()) errors.warehouseName = 'Enter a warehouse name.'
  if (!isIntegerInRange(config.incomingShipments, 0, 500)) errors.incomingShipments = 'Incoming shipments must be an integer from 0 to 500.'
  if (!isIntegerInRange(config.outgoingShipments, 0, 500)) errors.outgoingShipments = 'Outgoing shipments must be an integer from 0 to 500.'
  if (!isFiniteInRange(config.priorityPercent, 0, 100)) errors.priorityPercent = 'Priority percentage must be from 0 to 100%.'
  if (typeof config.carrierName !== 'string') errors.carrierName = 'Carrier name must be text.'
  if (typeof config.optionalNotes !== 'string') errors.optionalNotes = 'Notes must be text.'
  if (!isIntegerInRange(config.maintenanceDockCount, 0, 24)) errors.maintenanceDockCount = 'Maintenance dock count must be an integer from 0 to 24.'
  if (!isFiniteInRange(config.disruptionDelayMinutes, 0, 1440)) errors.disruptionDelayMinutes = 'Disruption delay must be from 0 to 1,440 minutes.'
  if (!isIntegerInRange(config.seed, 0, 2147483647)) errors.seed = 'Seed must be an integer from 0 to 2,147,483,647.'
  if (isIntegerInRange(config.dockCount, 1, 24) && isIntegerInRange(config.maintenanceDockCount, 0, 24)) {
    if (config.maintenanceDockCount > config.dockCount) errors.maintenanceDockCount = 'Maintenance docks cannot exceed the configured dock count.'
    if (isIntegerInRange(config.vehicleCount, 0, 500) && config.vehicleCount > 0 && config.dockCount - config.maintenanceDockCount <= 0) {
      errors.maintenanceDockCount = 'At least one dock must remain available when vehicles are configured.'
    }
  }
  if (isIntegerInRange(config.vehicleCount, 0, 500) &&
      isIntegerInRange(config.incomingShipments, 0, 500) &&
      isIntegerInRange(config.outgoingShipments, 0, 500) &&
      config.incomingShipments + config.outgoingShipments > config.vehicleCount) {
    errors.vehicleCount = 'Incoming and outgoing shipments cannot exceed the vehicle count.'
  }
  return errors
}

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const clockAt = (date: Date, minuteOffset: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  const total = hours * 60 + minutes + Math.round(minuteOffset)
  return `${pad(Math.floor(((total % 1440) + 1440) % 1440 / 60))}:${pad(((total % 1440) + 1440) % 60)}`
}
const warehouseDateAt = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const scenarioPressure: Record<SimulationScenario, number> = { normal: 0, 'busy-day': 1, disruption: 1.35, maintenance: 0.35 }
const queueWaitAtPosition = (config: SimulationInputConfig, position: number, operationalDocks: number) => {
  const pressure = scenarioPressure[config.scenario]
  const disruptionDelay = config.disruptionDelayMinutes + (config.scenario === 'disruption' ? 30 : 0)
  const dockCycles = Math.ceil(position / Math.max(1, operationalDocks))
  return config.averageServiceMinutes * (1 + pressure * 0.25) * dockCycles +
    disruptionDelay + position * config.averageArrivalIntervalMinutes
}

const averageQueueWait = (config: SimulationInputConfig, queueLength: number, operationalDocks: number) => queueLength
  ? Math.round(Array.from({ length: queueLength }, (_, index) => queueWaitAtPosition(config, index + 1, operationalDocks))
    .reduce((total, wait) => total + wait, 0) / queueLength)
  : 0

function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const words: number[] = []
  for (let index = 0; index < bytes.length; index += 1) words[index >> 2] = (words[index >> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8))
  words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | (0x80 << (24 - (bytes.length % 4) * 8))
  words[(((bytes.length + 8) >> 6) + 1) * 16 - 1] = bytes.length * 8
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const rotate = (value: number, count: number) => (value >>> count) | (value << (32 - count))
  for (let offset = 0; offset < words.length; offset += 16) {
    const schedule = new Array<number>(64)
    for (let index = 0; index < 16; index += 1) schedule[index] = words[offset + index] || 0
    for (let index = 16; index < 64; index += 1) {
      const x = schedule[index - 15]
      const y = schedule[index - 2]
      const sigma0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)
      const sigma1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10)
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) | 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const t1 = (h + sum1 + choice + constants[index] + schedule[index]) | 0
      const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (sum0 + majority) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0; hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0
    hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0; hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0
  }
  return hash.map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('')
}

export function recalculateDatasetIntegrity(dataset: OperationsDataset): OperationsDataset {
  const { integrity: _integrity, ...content } = dataset
  dataset.integrity = {
    checksum: sha256(JSON.stringify(content)),
    recordCounts: {
      vehicles: dataset.vehicles.length,
      queue: dataset.queue.length,
      docks: dataset.docks.length,
      alerts: dataset.alerts.length,
    },
  }
  return dataset
}

export function createDatasetPreview(config: SimulationInputConfig): SimulationPreview {
  const availableCapacity = Math.max(0, config.dockCount - config.maintenanceDockCount)
  const targetOccupancy = config.vehicleCount ? Math.max(1, Math.round(availableCapacity * config.utilizationTarget / 100)) : 0
  const expectedActiveDocks = Math.min(config.vehicleCount, availableCapacity, targetOccupancy)
  const queueLength = Math.max(0, config.vehicleCount - expectedActiveDocks)
  const averageWait = averageQueueWait(config, queueLength, availableCapacity)
  return {
    scenario: config.scenario,
    datasetName: config.datasetName,
    simulationDateTime: config.simulationDateTime,
    dockCount: config.dockCount,
    vehicleCount: config.vehicleCount,
    availableCapacity,
    expectedActiveDocks,
    queueLength,
    arrivalsToday: config.incomingShipments + config.outgoingShipments,
    estimatedAverageWaitMinutes: averageWait,
    capacityUtilization: availableCapacity ? Math.min(100, Math.round(expectedActiveDocks / availableCapacity * 100)) : 0,
  }
}

export function generateOperationsDataset(config: SimulationInputConfig): OperationsDataset {
  const validation = validateSimulationConfig(config)
  if (Object.keys(validation).length) throw new Error(`Invalid simulation configuration: ${Object.values(validation).join(' ')}`)

  const random = seededRandom(config.seed)
  const simulatedAt = new Date(config.simulationDateTime)
  const generatedAt = new Date()
  const expiresAt = new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000)
  const pressure = scenarioPressure[config.scenario]
  const delay = config.disruptionDelayMinutes + (config.scenario === 'disruption' ? 30 : 0)
  const operationalDockCount = config.dockCount - config.maintenanceDockCount
  const desiredOccupancy = config.vehicleCount === 0 ? 0 : Math.max(1, Math.round(operationalDockCount * config.utilizationTarget / 100))
  const occupiedCount = Math.min(config.vehicleCount, operationalDockCount, desiredOccupancy)
  const maintenanceIds = new Set(Array.from({ length: config.maintenanceDockCount }, (_, index) => String(config.dockCount - index).padStart(2, '0')))
  const operationalDockIds = Array.from({ length: config.dockCount }, (_, index) => String(index + 1).padStart(2, '0')).filter((dockId) => !maintenanceIds.has(dockId))
  const vehicleCount = config.vehicleCount
  const inboundCount = config.incomingShipments
  const carrierName = config.carrierName.trim() || 'Unassigned carrier'
  const vehicles: VehicleRecord[] = Array.from({ length: vehicleCount }, (_, index) => {
    const direction: VehicleRecord['direction'] = index < inboundCount ? 'Inbound' : index < inboundCount + config.outgoingShipments ? 'Outbound' : index % 2 === 0 ? 'Inbound' : 'Outbound'
    const appointment = clockAt(simulatedAt, Math.round((index - vehicleCount / 2) * config.averageArrivalIntervalMinutes))
    return {
      vehicleId: `vehicle-${pad(index + 1)}`,
      plate: `DF${String(config.seed % 1000).padStart(3, '0')}-${String(index + 1).padStart(3, '0')}`,
      carrier: carrierName,
      direction,
      loadType: direction === 'Inbound' ? 'Palletized goods' : 'Outbound freight',
      palletCount: 8 + Math.floor(random() * 25),
      appointmentTime: appointment,
    }
  })
  const currentVehicle = occupiedCount > 0 ? vehicles[0] : undefined
  const dockAssignments = new Map<string, VehicleRecord>()
  if (currentVehicle) dockAssignments.set(operationalDockIds[0], currentVehicle)
  const otherDockVehicleCount = Math.max(0, occupiedCount - (currentVehicle ? 1 : 0))
  for (let index = 0; index < otherDockVehicleCount; index += 1) {
    dockAssignments.set(operationalDockIds[index + 1], vehicles[index + 1])
  }
  const dockByVehicle = new Map(Array.from(dockAssignments.entries()).map(([dockId, vehicle]) => [vehicle.vehicleId, dockId]))

  const docks: DockRecord[] = Array.from({ length: config.dockCount }, (_, index) => {
    const dockId = String(index + 1).padStart(2, '0')
    const vehicle = dockAssignments.get(dockId)
    if (maintenanceIds.has(dockId)) {
      return { dockId, state: 'Maintenance', status: 'maintenance', vehicleId: null, plate: '—', carrier: 'Facilities team', direction: 'All', progress: 0, elapsedSeconds: 1800 + Math.floor(random() * 3600), appointmentTime: '—', notes: 'Scheduled preventative maintenance.' }
    }
    if (!vehicle) {
      return { dockId, state: 'Available', status: 'available', vehicleId: null, plate: '—', carrier: 'Ready for assignment', direction: 'All', progress: 0, elapsedSeconds: 0, appointmentTime: '—', notes: 'Ready for assignment.' }
    }
    const isCurrent = vehicle === currentVehicle
    const delayed = !isCurrent && config.scenario === 'disruption' && random() < 0.55
    const state: DockRecord['state'] = isCurrent ? 'Available' : delayed ? 'Delayed' : vehicle.direction === 'Inbound' ? 'Unloading' : 'Loading'
    const status: DockRecord['status'] = isCurrent ? 'called' : delayed ? 'delayed' : state.toLowerCase() as DockRecord['status']
    return {
      dockId, state, status, vehicleId: vehicle.vehicleId, plate: vehicle.plate, carrier: vehicle.carrier, direction: vehicle.direction,
      progress: isCurrent ? 0 : 15 + Math.floor(random() * 75),
      elapsedSeconds: isCurrent ? 0 : 300 + Math.floor(random() * 3600),
      appointmentTime: vehicle.appointmentTime,
      notes: isCurrent ? `Now calling: driver proceed to Dock ${dockId}. Follow safety signage.` : delayed ? 'Shipment delayed by an operational disruption.' : 'Operation progressing within planned window.',
    }
  })

  const nowCalling = currentVehicle
    ? { vehicleId: currentVehicle.vehicleId, dockId: operationalDockIds[0], instruction: 'PROCEED TO DOCK', estimatedStart: clockAt(simulatedAt, 0) }
    : null
  const queueVehicles = vehicles.filter((vehicle) => !dockByVehicle.has(vehicle.vehicleId))
  const queue: QueueRecord[] = queueVehicles.map((vehicle, index) => {
    const arrivalOffset = -(queueVehicles.length - index) * config.averageArrivalIntervalMinutes
    const severityChance = Math.min(0.9, config.priorityPercent / 100 + pressure * 0.12)
    const sample = random()
    const priority: QueueRecord['priority'] = sample < severityChance * 0.45 ? 'Priority' : sample < severityChance ? 'Delayed' : sample < severityChance + 0.04 ? 'Documentation check' : 'Standard'
    const arrivalTime = clockAt(simulatedAt, arrivalOffset)
    const estimatedCallTime = clockAt(simulatedAt, queueWaitAtPosition(config, index + 1, operationalDockCount))
    return { queueId: `queue-${pad(index + 1)}`, position: index + 1, vehicleId: vehicle.vehicleId, plate: vehicle.plate, carrier: vehicle.carrier, loadType: vehicle.loadType, arrivalTime, estimatedCallTime, priority }
  })
  const alerts: AlertRecord[] = docks.filter((dock) => dock.status === 'maintenance' || dock.status === 'delayed').map((dock) => ({
    alertId: `alert-${dock.dockId}`,
    dockId: dock.dockId,
    severity: dock.status === 'delayed' ? 'critical' : 'warning',
    code: dock.status === 'delayed' ? 'OPERATIONAL_DISRUPTION' : 'MAINTENANCE',
    description: dock.notes,
    action: dock.status === 'delayed' ? 'Operations lead notified' : 'Facilities team assigned',
    elapsedSeconds: dock.elapsedSeconds,
  }))
  const activeDocks = docks.filter((dock) => dock.state !== 'Available').length
  const delayedShipments = queue.filter((item) => item.priority === 'Delayed').length + docks.filter((dock) => dock.status === 'delayed').length
  const averageWaitMinutes = averageQueueWait(config, queue.length, operationalDockCount)
  const capacityUtilization = operationalDockCount ? Math.round(Math.min(100, (occupiedCount / operationalDockCount) * 100)) : 0
  const onTimeCount = Math.max(0, vehicleCount - delayedShipments)
  const kpis: SimulationKpis = {
    arrivalsToday: config.incomingShipments + config.outgoingShipments,
    averageWaitMinutes,
    activeDocks,
    delayedShipments,
    throughputEstimate: Math.round((operationalDockCount * 60 / config.averageServiceMinutes) * config.utilizationTarget / 100),
    averageProcessingMinutes: Math.round(config.averageServiceMinutes * (1 + pressure * 0.25) + delay * 0.15),
    queueLength: queue.length,
    onTimeRate: vehicleCount ? Math.round(onTimeCount / vehicleCount * 100) : 100,
    availableCapacity: operationalDockCount,
    capacityUtilization,
  }
  const warehouseDate = warehouseDateAt(simulatedAt)
  const nameSlug = config.datasetName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'operations'
  const dataset: OperationsDataset = {
    datasetId: `df-${warehouseDate.replace(/-/g, '')}-${nameSlug}-${config.scenario}-${config.seed.toString(36)}-${generatedAt.getTime().toString(36)}`,
    schemaVersion: '1.0.0',
    scenario: config.scenario,
    generatedAt: generatedAt.toISOString(),
    simulatedAt: simulatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    warehouse: { name: config.warehouseName.trim(), date: warehouseDate, shift: 'Simulation snapshot' },
    nowCalling,
    vehicles,
    queue,
    docks,
    alerts,
    kpis,
    datasetName: config.datasetName.trim(),
    simulationConfig: { ...config, carrierName },
    integrity: { checksum: '', recordCounts: { vehicles: 0, queue: 0, docks: 0, alerts: 0 } },
  }
  return recalculateDatasetIntegrity(dataset)
}

export function validateOperationsDataset(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const isRecord = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)
  const fail = (message: string) => errors.push(message)
  const isUtcTimestamp = (item: unknown): item is string =>
    typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item) && !Number.isNaN(Date.parse(item))
  const isValidDate = (item: unknown): item is string => {
    if (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item)) return false
    const [year, month, day] = item.split('-').map(Number)
    const parsed = new Date(`${item}T00:00:00`)
    return parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day
  }
  if (!isRecord(value)) return { valid: false, errors: ['Dataset must be a JSON object.'] }
  const dataset = value
  if (typeof dataset.datasetId !== 'string' || !/^df-[a-z0-9-]+$/.test(dataset.datasetId)) fail('Dataset ID is missing or invalid.')
  if (dataset.schemaVersion !== '1.0.0') fail('Unsupported dataset schema version.')
  if (typeof dataset.scenario !== 'string' || !SCENARIOS.includes(dataset.scenario as SimulationScenario)) fail('Dataset scenario is invalid.')
  for (const field of ['generatedAt', 'simulatedAt', 'expiresAt']) {
    if (!isUtcTimestamp(dataset[field])) fail(`${field} must be a valid UTC date and time.`)
  }
  if (typeof dataset.generatedAt === 'string' && typeof dataset.expiresAt === 'string' && Date.parse(dataset.expiresAt) <= Date.parse(dataset.generatedAt)) fail('Dataset expiry must be after its generation time.')
  if (!isRecord(dataset.warehouse) || typeof dataset.warehouse.name !== 'string' || !dataset.warehouse.name.trim() || !isValidDate(dataset.warehouse.date) || typeof dataset.warehouse.shift !== 'string') fail('Warehouse information is incomplete or invalid.')
  for (const collection of ['vehicles', 'queue', 'docks', 'alerts'] as const) {
    if (!Array.isArray(dataset[collection])) fail(`${collection} must be a list.`)
  }
  const vehicles = Array.isArray(dataset.vehicles) ? dataset.vehicles : []
  const queue = Array.isArray(dataset.queue) ? dataset.queue : []
  const docks = Array.isArray(dataset.docks) ? dataset.docks : []
  const alerts = Array.isArray(dataset.alerts) ? dataset.alerts : []
  if (vehicles.length > 500) fail('Dataset cannot contain more than 500 vehicles.')
  if (docks.length < 1 || docks.length > 24) fail('Dataset must contain between 1 and 24 docks.')
  const vehicleIds = new Set<string>()
  const plates = new Set<string>()
  for (const item of vehicles) {
    if (!isRecord(item) || typeof item.vehicleId !== 'string' || !item.vehicleId || typeof item.plate !== 'string' || !item.plate || typeof item.carrier !== 'string' || !['Inbound', 'Outbound'].includes(String(item.direction)) || typeof item.loadType !== 'string' || !Number.isInteger(item.palletCount) || (item.palletCount as number) < 0 || typeof item.appointmentTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.appointmentTime)) {
      fail('A vehicle record is malformed.')
      continue
    }
    if (vehicleIds.has(item.vehicleId)) fail(`Vehicle ID ${item.vehicleId} is duplicated.`)
    if (plates.has(item.plate)) fail(`Vehicle plate ${item.plate} is duplicated.`)
    vehicleIds.add(item.vehicleId); plates.add(item.plate)
  }
  if (dataset.cargoCompliance !== undefined) {
    for (const message of validateCargoComplianceData(dataset.cargoCompliance, vehicleIds)) fail(message)
  }
  const dockIds = new Set<string>()
  const dockVehicleIds = new Set<string>()
  for (const item of docks) {
    if (!isRecord(item) || typeof item.dockId !== 'string' || !/^(?:0[1-9]|1\d|2[0-4])$/.test(item.dockId) || !['Available', 'Loading', 'Unloading', 'Cleaning', 'Maintenance', 'Delayed'].includes(String(item.state)) || !['available', 'called', 'loading', 'unloading', 'cleaning', 'maintenance', 'delayed'].includes(String(item.status)) || (item.vehicleId !== null && typeof item.vehicleId !== 'string') || typeof item.plate !== 'string' || typeof item.carrier !== 'string' || !['Inbound', 'Outbound', 'All'].includes(String(item.direction)) || !Number.isInteger(item.progress) || (item.progress as number) < 0 || (item.progress as number) > 100 || !Number.isInteger(item.elapsedSeconds) || (item.elapsedSeconds as number) < 0 || typeof item.appointmentTime !== 'string' || item.appointmentTime !== '—' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.appointmentTime) || typeof item.notes !== 'string' || item.capabilityCodes !== undefined && (!Array.isArray(item.capabilityCodes) || item.capabilityCodes.some((code) => typeof code !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(code)))) {
      fail('A dock record is malformed.')
      continue
    }
    if (dockIds.has(item.dockId)) fail(`Dock ID ${item.dockId} is duplicated.`)
    dockIds.add(item.dockId)
    if (typeof item.vehicleId === 'string') {
      if (!vehicleIds.has(item.vehicleId)) fail(`Dock ${item.dockId} references an unknown vehicle.`)
      if (dockVehicleIds.has(item.vehicleId)) fail(`Vehicle ${item.vehicleId} is assigned to multiple docks.`)
      dockVehicleIds.add(item.vehicleId)
      const vehicle = vehicles.find((record) => isRecord(record) && record.vehicleId === item.vehicleId)
      if (isRecord(vehicle) && vehicle.plate !== item.plate) fail(`Dock ${item.dockId} vehicle plate does not match its vehicle record.`)
    }
  }
  const queueIds = new Set<string>()
  const queuedVehicles = new Set<string>()
  for (const item of queue) {
    if (!isRecord(item) || typeof item.queueId !== 'string' || !item.queueId || !Number.isInteger(item.position) || (item.position as number) < 1 || typeof item.vehicleId !== 'string' || typeof item.plate !== 'string' || typeof item.carrier !== 'string' || typeof item.loadType !== 'string' || typeof item.arrivalTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.arrivalTime) || typeof item.estimatedCallTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.estimatedCallTime) || !['Priority', 'Delayed', 'Documentation check', 'Standard'].includes(String(item.priority))) {
      fail('A queue record is malformed.')
      continue
    }
    if (queueIds.has(item.queueId)) fail(`Queue ID ${item.queueId} is duplicated.`)
    queueIds.add(item.queueId)
    if (!vehicleIds.has(item.vehicleId)) fail(`Queue entry ${item.queueId} references an unknown vehicle.`)
    if (queuedVehicles.has(item.vehicleId)) fail(`Vehicle ${item.vehicleId} appears multiple times in the queue.`)
    queuedVehicles.add(item.vehicleId)
    const vehicle = vehicles.find((record) => isRecord(record) && record.vehicleId === item.vehicleId)
    if (isRecord(vehicle) && (vehicle.plate !== item.plate || vehicle.carrier !== item.carrier || vehicle.loadType !== item.loadType)) fail(`Queue entry ${item.queueId} does not match its vehicle record.`)
  }
  for (const vehicleId of queuedVehicles) {
    if (dockVehicleIds.has(vehicleId)) fail(`Vehicle ${vehicleId} cannot be both queued and assigned to a dock.`)
  }
  for (const item of alerts) {
    if (!isRecord(item)) {
      fail('An alert record is malformed.')
      continue
    }
    const hasAlertId = Object.hasOwn(item, 'alertId')
    const hasLegacyId = Object.hasOwn(item, 'id')
    const alertId = hasAlertId ? item.alertId : item.id
    if (hasAlertId === hasLegacyId || typeof alertId !== 'string' || !alertId || typeof item.dockId !== 'string' || !dockIds.has(item.dockId) || !['critical', 'warning', 'info'].includes(String(item.severity)) || typeof item.code !== 'string' || !item.code || typeof item.description !== 'string' || !item.description || typeof item.action !== 'string' || !item.action || !Number.isInteger(item.elapsedSeconds) || (item.elapsedSeconds as number) < 0) fail('An alert record is malformed or references an unknown dock.')
  }
  if (!isRecord(dataset.kpis)) fail('KPI summary is missing.')
  else {
    const requiredKpis: (keyof SimulationKpis)[] = ['arrivalsToday', 'averageWaitMinutes', 'activeDocks', 'delayedShipments']
    for (const key of requiredKpis) if (typeof dataset.kpis[key] !== 'number' || !Number.isFinite(dataset.kpis[key] as number) || (dataset.kpis[key] as number) < 0) fail(`KPI ${key} must be a non-negative number.`)
    for (const key of ['throughputEstimate', 'averageProcessingMinutes', 'queueLength', 'onTimeRate', 'availableCapacity', 'capacityUtilization'] as const) {
      const number = dataset.kpis[key]
      if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || (key === 'onTimeRate' || key === 'capacityUtilization') && number > 100)) fail(`KPI ${key} is invalid.`)
    }
    if (Array.isArray(dataset.docks)) {
      const active = docks.filter((dock) => isRecord(dock) && dock.state !== 'Available').length
      if (dataset.kpis.activeDocks !== active) fail('Active dock KPI does not match dock records.')
    }
    if (dataset.kpis.queueLength !== undefined && dataset.kpis.queueLength !== queue.length) fail('Queue length KPI does not match queue records.')
  }
  const currentCall = dataset.nowCalling
  if (currentCall === null) {
    if (vehicles.length || queue.length) fail('A dataset without a current call must not contain vehicles or queued work.')
  } else if (!isRecord(currentCall) || typeof currentCall.vehicleId !== 'string' || typeof currentCall.dockId !== 'string' || typeof currentCall.instruction !== 'string' || !currentCall.instruction || typeof currentCall.estimatedStart !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(currentCall.estimatedStart)) {
    fail('Current call information is malformed.')
  } else {
    const dockId = currentCall.dockId
    const vehicleId = currentCall.vehicleId
    const dock = docks.find((item): item is Record<string, unknown> => isRecord(item) && item.dockId === dockId)
    const vehicle = vehicles.find((item): item is Record<string, unknown> => isRecord(item) && item.vehicleId === vehicleId)
    if (!dock || !vehicle || !isRecord(dock) || !isRecord(vehicle) || dock.vehicleId !== vehicle.vehicleId || dock.plate !== vehicle.plate) fail('Current call must reference its assigned dock and vehicle.')
  }
  if (!isRecord(dataset.integrity) || typeof dataset.integrity.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(dataset.integrity.checksum) || !isRecord(dataset.integrity.recordCounts)) fail('Dataset integrity metadata is missing or malformed.')
  else {
    const counts = dataset.integrity.recordCounts
    for (const key of ['vehicles', 'queue', 'docks', 'alerts'] as const) {
      if (counts[key] !== (Array.isArray(dataset[key]) ? dataset[key].length : -1)) fail(`Integrity ${key} count does not match dataset records.`)
    }
    const { integrity: _integrity, ...content } = dataset
    try {
      if (sha256(JSON.stringify(content)) !== dataset.integrity.checksum) fail('Dataset checksum does not match its contents.')
    } catch {
      fail('Dataset checksum could not be verified.')
    }
  }
  if (dataset.datasetName !== undefined && (typeof dataset.datasetName !== 'string' || !dataset.datasetName.trim())) fail('Dataset name must be non-empty text.')
  if (dataset.simulationConfig !== undefined) {
    const config = dataset.simulationConfig as SimulationInputConfig
    const configErrors = validateSimulationConfig(config)
    if (Object.keys(configErrors).length) fail('Embedded simulation configuration is invalid.')
    else {
      if (config.scenario !== dataset.scenario) fail('Embedded scenario does not match dataset scenario.')
      if (config.dockCount !== docks.length || config.vehicleCount !== vehicles.length) fail('Embedded counts do not match dataset records.')
    }
  }
  return { valid: errors.length === 0, errors }
}
