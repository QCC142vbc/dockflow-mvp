import type { OperationsDataset } from './datasetTypes'
import { validateVehicle } from './operationalConflictEngine.ts'

export type DispatchPriority = 'Priority' | 'Delayed' | 'Documentation check' | 'Standard'
export type DispatchVehicleStatus = 'waiting' | 'called' | 'in-progress' | 'on-hold' | 'delayed' | 'completed'
export type DispatchAction = 'call' | 'assign' | 'reassign' | 'start' | 'complete' | 'hold' | 'delay' | 'release' | 'resume'
export type DispatchEventType =
  | 'vehicle-called'
  | 'dock-assigned'
  | 'dock-reassigned'
  | 'operation-started'
  | 'operation-completed'
  | 'vehicle-delayed'
  | 'vehicle-held'
  | 'vehicle-resumed'
  | 'dock-released'
  | 'dispatch-conflict'
  | 'dispatch-recommended'
  | 'dispatch-accepted'
  | 'dispatch-rejected'

export type DispatchConflictCode =
  | 'VEHICLE_NOT_FOUND'
  | 'DOCK_NOT_FOUND'
  | 'VEHICLE_ALREADY_ASSIGNED'
  | 'DOCK_OCCUPIED'
  | 'DOCK_UNAVAILABLE'
  | 'DOCUMENTATION_BLOCK'
  | 'VEHICLE_ON_HOLD'
  | 'NO_COMPATIBLE_DOCK'
  | 'INVALID_STATE_TRANSITION'
  | 'VEHICLE_NOT_WAITING'
  | 'VEHICLE_NOT_ASSIGNED'
  | 'OPERATION_NOT_STARTED'
  | 'CARGO_COMPLIANCE_BLOCK'
  | 'DOCK_CAPABILITY_UNAVAILABLE'
  | 'DOCK_COMPATIBILITY_UNDETERMINED'

export interface DispatchConflict {
  code: DispatchConflictCode
  message: string
  vehicleId?: string
  dockId?: string
  blocking: boolean
  severity?: 'blocking' | 'warning' | 'info'
  conflictType?: string
  evidence?: Record<string, string | number | boolean | null>
}

export interface DispatchVehicle {
  vehicleId: string
  plate: string
  carrier: string
  load: string
  count: string
  direction: 'Inbound' | 'Outbound' | 'All'
  priority: DispatchPriority
  queuePosition: number
  arrival: string
  call: string
  arrivalMinutes: number | null
  callMinutes: number | null
  status: DispatchVehicleStatus
  assignedDockId?: string
}

export interface DispatchDock {
  id: string
  state: string
  plate: string
  carrier: string
  tone: string
  direction: 'Inbound' | 'Outbound' | 'All'
  progress: number
  elapsedSeconds: number
  notes: string
  vehicleId?: string | null
  workloadMinutes?: number
  capabilityCodes?: string[]
}

export interface DispatchCandidate {
  dockId: string
  estimatedProcessingTimeMinutes: number | null
  estimatedWaitTimeMinutes: number
  currentWorkloadMinutes: number
  reason: string
  confidence: 'high' | 'moderate' | 'limited'
  capabilityMatch?: 'matched' | 'not-required'
}

export interface DispatchDockAssessment {
  dockId: string
  status: 'blocked' | 'undetermined'
  reasons: string[]
}

export interface DispatchRecommendation {
  vehicleId: string
  recommendedDockId: string | null
  reason: string
  estimatedProcessingTimeMinutes: number | null
  estimatedWaitTimeMinutes: number | null
  conflicts: DispatchConflict[]
  blockingConditions: DispatchConflict[]
  confidence: 'high' | 'moderate' | 'limited' | 'none'
  alternatives: DispatchCandidate[]
  blockedDocks: DispatchDockAssessment[]
  undeterminedDocks: DispatchDockAssessment[]
  warnings: string[]
}

export interface DispatchEvent {
  eventId: string
  timestamp: string
  type: DispatchEventType
  vehicleId?: string
  dockId?: string
  description: string
}

export interface DispatchCall {
  vehicleId: string
  plate: string
  carrier: string
  load: string
  count: string
  dockId: string
  start: string
  startMinutes: number
  note: string
  direction: 'Inbound' | 'Outbound' | 'All'
}

export interface DispatchAlert {
  source: 'dispatch'
  alertId: string
  severity: 'critical' | 'warning' | 'info'
  code: DispatchConflictCode
  description: string
  action: string
  elapsedSeconds: number
  dockId?: string
  vehicleId?: string
  plate?: string
}

export interface DispatchWorkingState {
  queue: DispatchVehicle[]
  docks: DispatchDock[]
  callingVehicles: DispatchCall[]
  alerts: DispatchAlert[]
  dispatchEvents: DispatchEvent[]
  manualControl: boolean
  vehicleStatuses?: Record<string, DispatchVehicleStatus>
  autoCallVehicleIds?: string[]
  tick: number
  operationalDataset?: OperationsDataset
}

export interface DispatchActionRequest {
  type: DispatchAction
  vehicleId?: string
  dockId?: string
}

export interface DispatchActionResult {
  state: DispatchWorkingState
  conflicts: DispatchConflict[]
  events: DispatchEvent[]
}

const priorityOrder: Record<DispatchPriority, number> = {
  Priority: 0,
  Delayed: 1,
  Standard: 2,
  'Documentation check': 3,
}

const priorityScore = (priority: DispatchPriority) => priorityOrder[priority] ?? priorityOrder.Standard
const dockUnavailable = (dock: DispatchDock) =>
  dock.tone === 'maintenance' || dock.tone === 'cleaning' ||
  dock.state === 'Maintenance' || dock.state === 'Cleaning'
const dockOccupied = (dock: DispatchDock) =>
  Boolean(dock.vehicleId) || (dock.plate !== '' && dock.plate !== '—') ||
  ['called', 'loading', 'unloading', 'delayed'].includes(dock.tone)
const processingEstimate = (averageProcessingMinutes?: number): number | null =>
  typeof averageProcessingMinutes === 'number' && Number.isFinite(averageProcessingMinutes) && averageProcessingMinutes > 0
    ? averageProcessingMinutes
    : null

function conflict(
  code: DispatchConflictCode,
  message: string,
  options: { vehicleId?: string; dockId?: string; blocking?: boolean } = {},
): DispatchConflict {
  return {
    code,
    message,
    ...(options.vehicleId ? { vehicleId: options.vehicleId } : {}),
    ...(options.dockId ? { dockId: options.dockId } : {}),
    blocking: options.blocking ?? true,
  }
}

function findAssignedDock(vehicleId: string, docks: DispatchDock[]) {
  return docks.find((dock) => dock.vehicleId === vehicleId)
}

interface RequiredDockCapability {
  code: string
  source: string
}

function requiredDockCapabilities(dataset: OperationsDataset | undefined, vehicleId: string): RequiredDockCapability[] {
  const compliance = dataset?.cargoCompliance
  if (!compliance) return []
  const capabilities: RequiredDockCapability[] = []
  for (const cargo of compliance.cargo.filter((record) => record.vehicleId === vehicleId)) {
    const container = compliance.containerTypes.find((item) => item.containerTypeId === cargo.containerTypeId)
    const adr = compliance.adrRecords.find((item) => item.adrRecordId === cargo.adrRecordId)
    if (container?.requiredDockCapabilityCode) {
      capabilities.push({ code: container.requiredDockCapabilityCode, source: `container ${container.code}` })
    }
    if (adr?.requiredDockCapabilityCode) {
      capabilities.push({ code: adr.requiredDockCapabilityCode, source: `ADR record ${adr.adrRecordId}` })
    }
    for (const id of cargo.handlingRequirementIds ?? []) {
      const requirement = compliance.handlingRequirements.find((item) => item.handlingRequirementId === id)
      if (requirement?.requiredDockCapabilityCode) {
        capabilities.push({ code: requirement.requiredDockCapabilityCode, source: `handling requirement ${requirement.name}` })
      }
    }
  }
  return [...new Map(capabilities.map((item) => [item.code.toUpperCase(), item])).values()]
}

function cargoDispatchConflicts(dataset: OperationsDataset | undefined, vehicleId: string): DispatchConflict[] {
  if (!dataset?.cargoCompliance) return []
  const validation = validateVehicle(dataset, vehicleId)
  return validation.conflicts
    .filter((item) => item.type !== 'DOCK_UNAVAILABLE_WHILE_OCCUPIED' &&
      item.type !== 'DOCK_VEHICLE_REFERENCE_INVALID' &&
      item.type !== 'MULTIPLE_DOCK_ASSIGNMENTS' &&
      item.type !== 'VEHICLE_QUEUED_AND_DOCKED')
    .map((item) => ({
      code: 'CARGO_COMPLIANCE_BLOCK',
      message: item.message,
      vehicleId,
      blocking: item.blocking,
      severity: item.severity,
      conflictType: item.type,
      evidence: item.evidence,
    }))
}

function assessDock(
  vehicle: DispatchVehicle,
  dock: DispatchDock,
  requiredCapabilities: RequiredDockCapability[],
): DispatchDockAssessment | null {
  if (dockUnavailable(dock)) return { dockId: dock.id, status: 'blocked', reasons: [`Dock ${dock.id} is under ${dock.state.toLowerCase()}.`] }
  if (dockOccupied(dock)) return { dockId: dock.id, status: 'blocked', reasons: [`Dock ${dock.id} is occupied.`] }
  if (dock.direction !== 'All' && vehicle.direction !== 'All' && dock.direction !== vehicle.direction) {
    return { dockId: dock.id, status: 'blocked', reasons: [`Dock ${dock.id} is restricted to ${dock.direction}; ${vehicle.direction} traffic cannot be assigned.`] }
  }
  if (!requiredCapabilities.length) return null
  const requiredCodes = [...new Set(requiredCapabilities.map((item) => item.code.toUpperCase()))]
  if (dock.capabilityCodes === undefined) {
    return {
      dockId: dock.id,
      status: 'undetermined',
      reasons: [`Insufficient configuration to determine compatibility: Dock ${dock.id} has no configured capability codes for ${requiredCodes.join(', ')}.`],
    }
  }
  const configuredCodes = new Set(dock.capabilityCodes.map((code) => code.toUpperCase()))
  const missing = requiredCapabilities.filter((item) => !configuredCodes.has(item.code.toUpperCase()))
  if (missing.length) {
    const details = [...new Set(missing.map((item) => `${item.source} requires ${item.code}`))]
    return { dockId: dock.id, status: 'blocked', reasons: [`Dock ${dock.id} lacks required configured capability: ${details.join('; ')}.`] }
  }
  return null
}

export function recommendDispatch(
  vehicle: DispatchVehicle,
  queue: DispatchVehicle[],
  docks: DispatchDock[],
  averageProcessingMinutes?: number,
  dataset?: OperationsDataset,
): DispatchRecommendation {
  const conflicts: DispatchConflict[] = []
  const warnings: string[] = []
  const assignedDock = findAssignedDock(vehicle.vehicleId, docks)
  if (assignedDock) conflicts.push(conflict('VEHICLE_ALREADY_ASSIGNED', `Vehicle ${vehicle.plate} is already assigned to Dock ${assignedDock.id}.`, { vehicleId: vehicle.vehicleId, dockId: assignedDock.id }))
  if (vehicle.priority === 'Documentation check') conflicts.push(conflict('DOCUMENTATION_BLOCK', `Documentation is incomplete for ${vehicle.plate}; resolve the documentation check before dispatch.`, { vehicleId: vehicle.vehicleId }))
  if (vehicle.status === 'on-hold') conflicts.push(conflict('VEHICLE_ON_HOLD', `${vehicle.plate} is on hold and cannot be dispatched until resumed.`, { vehicleId: vehicle.vehicleId }))
  if (vehicle.status !== 'waiting' && vehicle.status !== 'delayed') conflicts.push(conflict('VEHICLE_NOT_WAITING', `${vehicle.plate} is not in a dispatchable waiting state.`, { vehicleId: vehicle.vehicleId }))
  const cargoConflicts = cargoDispatchConflicts(dataset, vehicle.vehicleId)
  conflicts.push(...cargoConflicts)
  warnings.push(...cargoConflicts.filter((item) => !item.blocking).map((item) => item.message))
  const blockers = conflicts.filter((item) => item.blocking)
  const requiredCapabilities = requiredDockCapabilities(dataset, vehicle.vehicleId)
  const assessments = docks.map((dock) => assessDock(vehicle, dock, requiredCapabilities)).filter((item): item is DispatchDockAssessment => item !== null)
  const blockedDocks = assessments.filter((item) => item.status === 'blocked')
  const undeterminedDocks = assessments.filter((item) => item.status === 'undetermined')
  warnings.push(...undeterminedDocks.flatMap((item) => item.reasons))
  if (blockers.length) {
    return {
      vehicleId: vehicle.vehicleId,
      recommendedDockId: null,
      reason: blockers.map((item) => item.message).join(' '),
      estimatedProcessingTimeMinutes: processingEstimate(averageProcessingMinutes),
      estimatedWaitTimeMinutes: null,
      conflicts,
      blockingConditions: blockers,
      confidence: 'none',
      alternatives: [],
      blockedDocks,
      undeterminedDocks,
      warnings,
    }
  }

  const processing = processingEstimate(averageProcessingMinutes)
  const freeDocks = docks.filter((dock) => !dockUnavailable(dock) && !dockOccupied(dock))
  const compatible = freeDocks.filter((dock) =>
    !assessDock(vehicle, dock, requiredCapabilities))
  const directionRestricted = freeDocks.length > 0 && compatible.length === 0 &&
    blockedDocks.some((item) => item.reasons.some((reason) => /direction/i.test(reason)))
  if (!compatible.length) {
    const compatibilityUnknown = undeterminedDocks.length > 0
    const baseMessage = compatibilityUnknown
      ? undeterminedDocks.flatMap((item) => item.reasons).join(' ')
      : directionRestricted
      ? `No available dock matches ${vehicle.direction} direction.`
      : docks.length === 0
        ? 'No dock records are available for assignment.'
        : 'No available dock can accept this vehicle; docks may be occupied, under maintenance, or cleaning.'
    const additionalReasons = blockedDocks.flatMap((item) => item.reasons)
    const message = [baseMessage, ...additionalReasons].join(' ')
    const noDock = conflict(compatibilityUnknown ? 'DOCK_COMPATIBILITY_UNDETERMINED' : 'NO_COMPATIBLE_DOCK', message, { vehicleId: vehicle.vehicleId })
    return {
      vehicleId: vehicle.vehicleId,
      recommendedDockId: null,
      reason: message,
      estimatedProcessingTimeMinutes: processing,
      estimatedWaitTimeMinutes: null,
      conflicts: [...conflicts, noDock],
      blockingConditions: [noDock],
      confidence: 'none',
      alternatives: [],
      blockedDocks,
      undeterminedDocks,
      warnings,
    }
  }

  const workload = (dock: DispatchDock) => {
    if (typeof dock.workloadMinutes === 'number' && Number.isFinite(dock.workloadMinutes) && dock.workloadMinutes >= 0) return dock.workloadMinutes
    if (!dockOccupied(dock)) return 0
    if (!processing) return 0
    return Math.max(0, (100 - Math.min(100, Math.max(0, dock.progress))) / 100 * processing)
  }
  const upstreamQueue = queue.filter((item) => item.status === 'waiting' || item.status === 'delayed')
  const aheadByPriority = upstreamQueue.filter((item) =>
    item.vehicleId !== vehicle.vehicleId &&
    (priorityScore(item.priority) < priorityScore(vehicle.priority) ||
      priorityScore(item.priority) === priorityScore(vehicle.priority) && item.queuePosition < vehicle.queuePosition),
  ).length
  const alternatives = compatible.map((dock) => {
    const dockWorkload = workload(dock)
    const wait = (aheadByPriority * (processing ?? 0)) + dockWorkload
    const confidence: DispatchCandidate['confidence'] = processing === null
      ? 'limited'
      : dock.workloadMinutes === undefined ? 'moderate' : 'high'
    const reason = [
      'Available and not in maintenance or cleaning.',
      dock.direction === 'All' ? 'No direction restriction is recorded.' : `Direction matches ${vehicle.direction}.`,
      `${dockWorkload.toFixed(0)} min estimated current workload.`,
      processing === null ? 'Processing-time estimate is unavailable.' : `Estimated service time: ${processing} min.`,
    ].join(' ')
    const capabilityMatch: DispatchCandidate['capabilityMatch'] = requiredCapabilities.length ? 'matched' : 'not-required'
    return {
      dockId: dock.id,
      estimatedProcessingTimeMinutes: processing,
      estimatedWaitTimeMinutes: wait,
      currentWorkloadMinutes: dockWorkload,
      reason,
      confidence,
      capabilityMatch,
    }
  }).sort((left, right) =>
    left.estimatedWaitTimeMinutes - right.estimatedWaitTimeMinutes ||
    left.currentWorkloadMinutes - right.currentWorkloadMinutes ||
    left.dockId.localeCompare(right.dockId),
  )
  const recommended = alternatives[0]
  const confidence = processing === null ? 'limited' : recommended.confidence
  return {
    vehicleId: vehicle.vehicleId,
    recommendedDockId: recommended.dockId,
    reason: `${recommended.reason} Lowest estimated wait among ${alternatives.length} available dock${alternatives.length === 1 ? '' : 's'}.`,
    estimatedProcessingTimeMinutes: processing,
    estimatedWaitTimeMinutes: recommended.estimatedWaitTimeMinutes,
    conflicts,
    blockingConditions: [],
    confidence,
    alternatives,
    blockedDocks,
    undeterminedDocks,
    warnings,
  }
}

export function selectNextDispatchVehicle(queue: DispatchVehicle[], docks: DispatchDock[], processingMinutes?: number, dataset?: OperationsDataset): DispatchVehicle | null {
  const ordered = [...queue].sort((left, right) =>
    priorityScore(left.priority) - priorityScore(right.priority) ||
    left.queuePosition - right.queuePosition,
  )
  return ordered.find((vehicle) =>
    (vehicle.status === 'waiting' || vehicle.status === 'delayed') &&
    recommendDispatch(vehicle, queue, docks, processingMinutes, dataset).recommendedDockId !== null,
  ) ?? null
}

const eventCopy: Record<DispatchAction, { type: DispatchEventType; description: (vehicle: DispatchVehicle | undefined, dockId?: string) => string }> = {
  call: { type: 'vehicle-called', description: (vehicle, dockId) => `${vehicle?.plate ?? 'Vehicle'} called to Dock ${dockId}.` },
  assign: { type: 'dock-assigned', description: (vehicle, dockId) => `${vehicle?.plate ?? 'Vehicle'} assigned to Dock ${dockId}.` },
  reassign: { type: 'dock-reassigned', description: (vehicle, dockId) => `${vehicle?.plate ?? 'Vehicle'} reassigned to Dock ${dockId}.` },
  start: { type: 'operation-started', description: (vehicle, dockId) => `Operation started for ${vehicle?.plate ?? 'vehicle'} at Dock ${dockId}.` },
  complete: { type: 'operation-completed', description: (vehicle, dockId) => `Operation completed for ${vehicle?.plate ?? 'vehicle'} at Dock ${dockId}; awaiting dock release.` },
  hold: { type: 'vehicle-held', description: (vehicle) => `${vehicle?.plate ?? 'Vehicle'} placed on hold.` },
  delay: { type: 'vehicle-delayed', description: (vehicle, dockId) => `${vehicle?.plate ?? 'Vehicle'} marked delayed${dockId ? ` at Dock ${dockId}` : ''}.` },
  release: { type: 'dock-released', description: (vehicle, dockId) => `Dock ${dockId} released from ${vehicle?.plate ?? 'vehicle'}.` },
  resume: { type: 'vehicle-resumed', description: (vehicle) => `${vehicle?.plate ?? 'Vehicle'} resumed from hold.` },
}

function createEvent(type: DispatchEventType, description: string, timestamp: string, sequence: number, vehicleId?: string, dockId?: string): DispatchEvent {
  return {
    eventId: `dispatch-${Date.parse(timestamp).toString(36)}-${sequence.toString(36)}-${type}`,
    timestamp,
    type,
    description,
    ...(vehicleId ? { vehicleId } : {}),
    ...(dockId ? { dockId } : {}),
  }
}

function renumber(queue: DispatchVehicle[]) {
  return queue.map((vehicle, index) => ({ ...vehicle, queuePosition: index + 1 }))
}

function dispatchAlert(conflictItem: DispatchConflict, eventId: string): DispatchAlert {
  return {
    source: 'dispatch',
    alertId: `${eventId}-alert`,
    severity: conflictItem.code === 'DOCUMENTATION_BLOCK' || conflictItem.code === 'DOCK_UNAVAILABLE' ? 'warning' : 'critical',
    code: conflictItem.code,
    description: conflictItem.message,
    action: 'Review dispatch conflict',
    elapsedSeconds: 0,
    ...(conflictItem.dockId ? { dockId: conflictItem.dockId } : {}),
    ...(conflictItem.vehicleId ? { vehicleId: conflictItem.vehicleId } : {}),
  }
}

export function applyDispatchAction(
  state: DispatchWorkingState,
  action: DispatchActionRequest,
  timestamp = new Date().toISOString(),
): DispatchActionResult {
  const queue = state.queue ?? []
  const docks = state.docks ?? []
  const vehicleId = action.vehicleId
  const sourceDock = vehicleId ? findAssignedDock(vehicleId, docks) : undefined
  const queuedVehicle = vehicleId ? queue.find((item) => item.vehicleId === vehicleId) : undefined
  const vehicle = queuedVehicle ?? (vehicleId && sourceDock
    ? {
        vehicleId,
        plate: sourceDock.plate,
        carrier: sourceDock.carrier,
        load: '',
        count: '',
        direction: sourceDock.direction,
        priority: 'Standard' as const,
        queuePosition: 0,
        arrival: '',
        call: '',
        arrivalMinutes: null,
        callMinutes: null,
        status: sourceDock.tone === 'called' ? 'called' as const : 'in-progress' as const,
        assignedDockId: sourceDock.id,
      }
    : undefined)
  let issue: DispatchConflict | undefined
  const targetDock = action.dockId ? docks.find((dock) => dock.id === action.dockId) : undefined
  const eventData = eventCopy[action.type]
  const newEvents: DispatchEvent[] = []
  let nextQueue = [...queue]
  let nextDocks = [...docks]
  let nextCalls = [...(state.callingVehicles ?? [])]
  let nextAlerts = [...(state.alerts ?? [])]
  let nextStatuses = { ...(state.vehicleStatuses ?? {}) }
  const requireVehicle = () => {
    if (!vehicle) issue = conflict('VEHICLE_NOT_FOUND', `Vehicle ${vehicleId ?? '(missing ID)'} is not in the active queue or assigned to a dock.`, { vehicleId })
  }
  const requireTarget = () => {
    if (action.dockId && !targetDock) issue = conflict('DOCK_NOT_FOUND', `Dock ${action.dockId} does not exist.`, { vehicleId, dockId: action.dockId })
    else if (!action.dockId) issue = conflict('INVALID_STATE_TRANSITION', 'Choose a dock before performing this action.', { vehicleId })
  }
  const requireFreeTarget = () => {
    requireTarget()
    if (!issue && targetDock && dockUnavailable(targetDock)) issue = conflict('DOCK_UNAVAILABLE', `Dock ${targetDock.id} is under ${targetDock.state.toLowerCase()} and cannot be assigned.`, { vehicleId, dockId: targetDock.id })
    else if (!issue && targetDock && dockOccupied(targetDock)) issue = conflict('DOCK_OCCUPIED', `Dock ${targetDock.id} already has an assigned vehicle.`, { vehicleId, dockId: targetDock.id })
    else if (!issue && targetDock && vehicle && targetDock.direction !== 'All' && vehicle.direction !== 'All' && targetDock.direction !== vehicle.direction) issue = conflict('NO_COMPATIBLE_DOCK', `Dock ${targetDock.id} is restricted to ${targetDock.direction}; ${vehicle.direction} traffic cannot be assigned.`, { vehicleId, dockId: targetDock.id })
    if (!issue && vehicle && (action.type === 'call' || action.type === 'assign' || action.type === 'reassign')) {
      const cargoBlocker = cargoDispatchConflicts(state.operationalDataset, vehicle.vehicleId).find((item) => item.blocking)
      if (cargoBlocker) {
        issue = { ...cargoBlocker, dockId: targetDock?.id }
      } else if (targetDock) {
        const capabilityAssessment = assessDock(vehicle, targetDock, requiredDockCapabilities(state.operationalDataset, vehicle.vehicleId))
        if (capabilityAssessment?.status === 'blocked') {
          issue = conflict('DOCK_CAPABILITY_UNAVAILABLE', capabilityAssessment.reasons.join(' '), { vehicleId, dockId: targetDock.id })
        } else if (capabilityAssessment?.status === 'undetermined') {
          issue = conflict('DOCK_COMPATIBILITY_UNDETERMINED', capabilityAssessment.reasons.join(' '), { vehicleId, dockId: targetDock.id })
        }
      }
    }
  }
  const requireDocumentation = () => {
    if (vehicle?.priority === 'Documentation check') issue = conflict('DOCUMENTATION_BLOCK', `Documentation is incomplete for ${vehicle.plate}; resolve the documentation check before dispatch.`, { vehicleId })
  }
  const createActionEvent = (dockId?: string) => {
    if (!eventData) return
    newEvents.push(createEvent(eventData.type, eventData.description(vehicle, dockId), timestamp, (state.dispatchEvents ?? []).length + newEvents.length, vehicleId, dockId))
  }

  requireVehicle()
  if (!issue) {
    switch (action.type) {
      case 'call':
      case 'assign': {
        requireDocumentation()
        if (!issue && sourceDock) issue = conflict('VEHICLE_ALREADY_ASSIGNED', `${vehicle?.plate} is already assigned to Dock ${sourceDock.id}.`, { vehicleId, dockId: sourceDock.id })
        if (!issue && vehicle?.status !== 'waiting' && vehicle?.status !== 'delayed') issue = conflict('VEHICLE_NOT_WAITING', `${vehicle?.plate} is not waiting and cannot be assigned.`, { vehicleId })
        if (!issue) requireFreeTarget()
        if (!issue && targetDock && vehicle) {
          nextQueue = renumber(queue.filter((item) => item.vehicleId !== vehicle.vehicleId))
          nextStatuses[vehicle.vehicleId] = 'called'
          nextDocks = docks.map((dock) => dock.id === targetDock.id ? {
            ...dock,
            state: 'Available',
            tone: 'called',
            plate: vehicle.plate,
            carrier: vehicle.carrier,
            direction: vehicle.direction,
            vehicleId: vehicle.vehicleId,
            progress: 0,
            elapsedSeconds: 0,
            notes: `Now calling: driver proceed to Dock ${targetDock.id}.`,
          } : dock)
          const call: DispatchCall = {
            vehicleId: vehicle.vehicleId,
            plate: vehicle.plate,
            carrier: vehicle.carrier,
            load: vehicle.load,
            count: vehicle.count,
            dockId: targetDock.id,
            start: vehicle.call,
            startMinutes: vehicle.callMinutes ?? 0,
            note: 'Proceed to assigned dock',
            direction: vehicle.direction,
          }
          nextCalls = [...nextCalls.filter((item) => item.vehicleId !== vehicle.vehicleId), call]
          createActionEvent(targetDock.id)
        }
        break
      }
      case 'reassign': {
        if (!sourceDock || sourceDock.tone !== 'called') issue = conflict('INVALID_STATE_TRANSITION', 'Only a called vehicle can be reassigned; started operations must be completed first.', { vehicleId, dockId: sourceDock?.id })
        if (!issue) requireFreeTarget()
        if (!issue && sourceDock && targetDock && vehicle) {
          nextDocks = docks.map((dock) => {
            if (dock.id === sourceDock.id) return { ...dock, state: 'Available', tone: 'available', plate: '—', carrier: 'Ready for assignment', direction: 'All', vehicleId: null, progress: 0, elapsedSeconds: 0, notes: 'Released for reassignment.' }
            if (dock.id === targetDock.id) return { ...dock, state: 'Available', tone: 'called', plate: vehicle.plate, carrier: vehicle.carrier, direction: vehicle.direction, vehicleId: vehicle.vehicleId, progress: 0, elapsedSeconds: 0, notes: `Now calling: driver proceed to Dock ${targetDock.id}.` }
            return dock
          })
          nextCalls = nextCalls.map((call) => call.vehicleId === vehicle.vehicleId ? { ...call, dockId: targetDock.id } : call)
          createActionEvent(targetDock.id)
        }
        break
      }
      case 'start': {
        if (!sourceDock) issue = conflict('VEHICLE_NOT_ASSIGNED', `${vehicle?.plate ?? vehicleId} must be assigned to a dock before the operation can start.`, { vehicleId })
        else if (sourceDock.tone !== 'called' && !(sourceDock.tone === 'delayed' && sourceDock.progress === 0)) issue = conflict('INVALID_STATE_TRANSITION', `${vehicle?.plate} is not in a called state; only assigned operations can start.`, { vehicleId, dockId: sourceDock.id })
        else {
          requireDocumentation()
          if (!issue && sourceDock && vehicle) {
            const operationState = vehicle.direction === 'Inbound' ? 'Unloading' : 'Loading'
            nextDocks = docks.map((dock) => dock.id === sourceDock.id ? {
              ...dock,
              state: operationState,
              tone: operationState.toLowerCase(),
              progress: 1,
              elapsedSeconds: Math.max(0, dock.elapsedSeconds),
              notes: 'Operation started by operator.',
            } : dock)
            nextCalls = nextCalls.filter((call) => call.vehicleId !== vehicle.vehicleId)
            nextStatuses[vehicle.vehicleId] = 'in-progress'
            createActionEvent(sourceDock.id)
          }
        }
        break
      }
      case 'complete': {
        if (!sourceDock || !['loading', 'unloading', 'delayed'].includes(sourceDock.tone) || sourceDock.progress <= 0) {
          issue = conflict('OPERATION_NOT_STARTED', `${vehicle?.plate ?? vehicleId} cannot be completed because no started operation is assigned.`, { vehicleId, dockId: sourceDock?.id })
        } else if (sourceDock && vehicle) {
          nextDocks = docks.map((dock) => dock.id === sourceDock.id ? {
            ...dock,
            state: 'Completed',
            tone: 'completed',
            progress: 100,
            notes: 'Operation completed; awaiting dock release.',
          } : dock)
          nextCalls = nextCalls.filter((call) => call.vehicleId !== vehicle.vehicleId)
          nextStatuses[vehicle.vehicleId] = 'completed'
          createActionEvent(sourceDock.id)
        }
        break
      }
      case 'hold': {
        if (!queuedVehicle) issue = conflict('INVALID_STATE_TRANSITION', 'Only a queued vehicle can be placed on hold.', { vehicleId })
        else if (vehicle?.priority === 'Documentation check') issue = conflict('DOCUMENTATION_BLOCK', 'This vehicle is already blocked by an incomplete documentation check.', { vehicleId })
        else {
          nextQueue = queue.map((item) => item.vehicleId === vehicleId ? { ...item, status: 'on-hold', tone: 'on-hold' } : item)
          nextStatuses[vehicleId!] = 'on-hold'
          createActionEvent()
        }
        break
      }
      case 'resume': {
        if (!queuedVehicle || queuedVehicle.status !== 'on-hold') issue = conflict('INVALID_STATE_TRANSITION', 'Only a vehicle on hold can be resumed.', { vehicleId })
        else {
          nextQueue = queue.map((item) => item.vehicleId === vehicleId ? {
            ...item,
            status: 'waiting',
            tone: item.priority === 'Priority' ? 'priority' : item.priority === 'Delayed' ? 'delayed' : item.priority === 'Documentation check' ? 'docs' : 'standard',
          } : item)
          nextStatuses[vehicleId!] = 'waiting'
          createActionEvent()
        }
        break
      }
      case 'delay': {
        if (queuedVehicle) {
          nextQueue = queue.map((item) => item.vehicleId === vehicleId ? { ...item, status: 'delayed', tone: 'delayed' } : item)
          nextStatuses[vehicleId!] = 'delayed'
          createActionEvent()
        } else if (sourceDock && vehicle) {
          nextDocks = docks.map((dock) => dock.id === sourceDock.id ? { ...dock, state: 'Delayed', tone: 'delayed', notes: 'Operation marked delayed by operator.' } : dock)
          nextStatuses[vehicle.vehicleId] = 'delayed'
          createActionEvent(sourceDock.id)
        } else issue = conflict('INVALID_STATE_TRANSITION', 'Only a waiting or dock-assigned vehicle can be marked delayed.', { vehicleId })
        break
      }
      case 'release': {
        if (!sourceDock || !['called', 'completed'].includes(sourceDock.tone)) issue = conflict('INVALID_STATE_TRANSITION', 'A dock can be released after cancelling a called assignment or completing its operation.', { vehicleId, dockId: sourceDock?.id })
        else if (sourceDock && vehicle) {
          const wasCompleted = sourceDock.tone === 'completed'
          nextDocks = docks.map((dock) => dock.id === sourceDock.id ? { ...dock, state: 'Available', tone: 'available', plate: '—', carrier: 'Ready for assignment', direction: 'All', vehicleId: null, progress: 0, elapsedSeconds: 0, notes: wasCompleted ? 'Completed operation released; ready for assignment.' : 'Assignment released by operator.' } : dock)
          nextCalls = nextCalls.filter((call) => call.vehicleId !== vehicle.vehicleId)
          if (wasCompleted) {
            nextStatuses[vehicle.vehicleId] = 'completed'
          } else {
            nextQueue = renumber([...queue, { ...vehicle, queuePosition: queue.length + 1, status: 'waiting' }])
            nextStatuses[vehicle.vehicleId] = 'waiting'
          }
          if (wasCompleted) {
            newEvents.push(createEvent('dock-released', `Dock ${sourceDock.id} released after ${vehicle.plate} completed its operation.`, timestamp, (state.dispatchEvents ?? []).length + newEvents.length, vehicle.vehicleId, sourceDock.id))
          } else {
            createActionEvent(sourceDock.id)
          }
        }
        break
      }
    }
  }

  if (!issue && targetDock && vehicle && (action.type === 'call' || action.type === 'assign' || action.type === 'reassign')) {
    const recommendation = recommendDispatch(vehicle, queue, docks, undefined, state.operationalDataset)
    newEvents.push(createEvent(
      'dispatch-recommended',
      `${vehicle.plate}: ${recommendation.recommendedDockId
        ? `Dock ${recommendation.recommendedDockId} recommended. ${recommendation.reason}`
        : `No dock recommendation. ${recommendation.reason}`}`,
      timestamp,
      (state.dispatchEvents ?? []).length,
      vehicle.vehicleId,
      recommendation.recommendedDockId ?? undefined,
    ))
    newEvents.push(createEvent(
      'dispatch-accepted',
      `${vehicle.plate}: Dock ${targetDock.id} accepted for ${action.type}.`,
      timestamp,
      (state.dispatchEvents ?? []).length + 1,
      vehicle.vehicleId,
      targetDock.id,
    ))
  }

  if (issue) {
    const conflictEvent = createEvent('dispatch-conflict', issue.message, timestamp, (state.dispatchEvents ?? []).length, issue.vehicleId, issue.dockId)
    const rejectedEvent = createEvent('dispatch-rejected', `${vehicle?.plate ?? 'Vehicle'} dispatch rejected: ${issue.message}`, timestamp, (state.dispatchEvents ?? []).length + 1, issue.vehicleId, issue.dockId)
    newEvents.splice(0, newEvents.length, conflictEvent, rejectedEvent)
    nextAlerts = [dispatchAlert(issue, conflictEvent.eventId), ...nextAlerts].slice(0, 50)
    return {
      state: {
        ...state,
        alerts: nextAlerts,
        dispatchEvents: [...(state.dispatchEvents ?? []), ...newEvents].slice(-1000),
      },
      conflicts: [issue],
      events: newEvents,
    }
  }
  if (vehicleId && newEvents.length) {
    nextAlerts = nextAlerts.filter((alert) => alert.vehicleId !== vehicleId)
  }
  return {
    state: {
      ...state,
      queue: nextQueue,
      docks: nextDocks,
      callingVehicles: nextCalls,
      alerts: nextAlerts,
      vehicleStatuses: nextStatuses,
      dispatchEvents: [...(state.dispatchEvents ?? []), ...newEvents].slice(-1000),
      manualControl: true,
    },
    conflicts: [],
    events: newEvents,
  }
}
