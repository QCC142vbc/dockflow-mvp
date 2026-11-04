import type { OperationsDataset } from './datasetTypes'
import { validateCargoComplianceData } from './cargoComplianceValidation.ts'

const LEGACY_SCENARIOS = ['normal', 'busy-day', 'disruption', 'maintenance']

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
  if (typeof dataset.scenario !== 'string' || !LEGACY_SCENARIOS.includes(dataset.scenario)) fail('Dataset scenario is invalid.')
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
    if (!isRecord(item) || typeof item.dockId !== 'string' || !/^(?:0[1-9]|1\d|2[0-4])$/.test(item.dockId) || !['Available', 'Loading', 'Unloading', 'Cleaning', 'Maintenance', 'Delayed'].includes(String(item.state)) || !['available', 'called', 'loading', 'unloading', 'cleaning', 'maintenance', 'delayed'].includes(String(item.status)) || (item.vehicleId !== null && typeof item.vehicleId !== 'string') || typeof item.plate !== 'string' || typeof item.carrier !== 'string' || !['Inbound', 'Outbound', 'All'].includes(String(item.direction)) || !Number.isInteger(item.progress) || (item.progress as number) < 0 || (item.progress as number) > 100 || !Number.isInteger(item.elapsedSeconds) || (item.elapsedSeconds as number) < 0 || typeof item.appointmentTime !== 'string' || item.appointmentTime !== '—' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.appointmentTime) || typeof item.notes !== 'string' || item.capabilityCodes !== undefined && (!Array.isArray(item.capabilityCodes) || new Set(item.capabilityCodes).size !== item.capabilityCodes.length || item.capabilityCodes.some((code) => typeof code !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(code)))) {
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
    for (const key of ['arrivalsToday', 'averageWaitMinutes', 'activeDocks', 'delayedShipments']) {
      const number = dataset.kpis[key]
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) fail(`KPI ${key} must be a non-negative number.`)
    }
    for (const key of ['throughputEstimate', 'averageProcessingMinutes', 'queueLength', 'onTimeRate', 'availableCapacity', 'capacityUtilization']) {
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
    const dock = docks.find((item): item is Record<string, unknown> => isRecord(item) && item.dockId === currentCall.dockId)
    const vehicle = vehicles.find((item): item is Record<string, unknown> => isRecord(item) && item.vehicleId === currentCall.vehicleId)
    if (!dock || !vehicle || dock.vehicleId !== vehicle.vehicleId || dock.plate !== vehicle.plate) fail('Current call must reference its assigned dock and vehicle.')
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
  if (dataset.simulationConfig !== undefined && (!isRecord(dataset.simulationConfig) || dataset.simulationConfig.scenario !== dataset.scenario)) {
    fail('Embedded legacy configuration does not match the dataset scenario.')
  }
  return { valid: errors.length === 0, errors }
}
