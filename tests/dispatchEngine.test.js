import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDispatchAction,
  recommendDispatch,
  selectNextDispatchVehicle,
} from '../src/data/dispatchEngine.ts'
import { advanceOperationsState, withWorkingOperations } from '../src/data/operationsData.js'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { validateOperationsDataset } from '../src/data/datasetFactory.ts'
import { validateDataset } from '../simulator/src/validate.js'

const timestamp = '2026-10-02T18:00:00.000Z'

function vehicle(overrides = {}) {
  return {
    vehicleId: 'vehicle-1',
    plate: 'TRK-001',
    carrier: 'North Freight',
    load: 'Palletized goods',
    count: '12 pallets',
    direction: 'Inbound',
    priority: 'Standard',
    queuePosition: 1,
    arrival: '17:00',
    call: '18:00',
    arrivalMinutes: 1020,
    callMinutes: 1080,
    status: 'waiting',
    ...overrides,
  }
}

function dock(overrides = {}) {
  return {
    id: '01',
    state: 'Available',
    plate: '—',
    carrier: 'Ready for assignment',
    tone: 'available',
    direction: 'All',
    progress: 0,
    elapsedSeconds: 0,
    notes: 'Ready for assignment.',
    vehicleId: null,
    ...overrides,
  }
}

function workingState({ queue = [vehicle()], docks = [dock()], calls = [] } = {}) {
  return {
    queue,
    docks,
    callingVehicles: calls,
    alerts: [],
    dispatchEvents: [],
    manualControl: false,
    autoCallVehicleIds: [],
    vehicleStatuses: {},
    tick: 0,
  }
}

function cargoDataset({ cargo = {}, containerTypes = [], adrRecords = [], handlingRequirements = [] } = {}) {
  const dataset = structuredClone(demoDataset)
  const vehicleId = dataset.queue[0].vehicleId
  dataset.cargoCompliance = {
    cargo: [{
      cargoId: 'cargo-1',
      cargoType: 'General cargo',
      description: 'Dispatch test cargo',
      quantity: 1,
      quantityUnit: 'pallet',
      handlingRequirementIds: [],
      vehicleId,
      ...cargo,
    }],
    containerTypes,
    adrRecords,
    handlingRequirements,
  }
  const record = dataset.vehicles.find((item) => item.vehicleId === vehicleId)
  return {
    dataset,
    vehicleId,
    dispatchVehicle: vehicle({ vehicleId, plate: record.plate, direction: record.direction }),
  }
}

function testContainer(overrides = {}) {
  return {
    containerTypeId: 'container-1',
    code: 'BOX',
    name: 'Test container',
    category: 'standard',
    nominalLengthM: 6,
    widthM: 2.4,
    heightM: 2.6,
    maxGrossWeightKg: 10000,
    tareWeightKg: 1000,
    payloadCapacityKg: 8000,
    refrigerated: false,
    tank: false,
    openTop: false,
    flatRack: false,
    active: true,
    ...overrides,
  }
}

function testAdr(overrides = {}) {
  return {
    adrRecordId: 'adr-1',
    status: 'applicable',
    unNumber: 'UN 1203',
    properShippingName: 'Test dangerous goods',
    hazardClass: '3',
    packingGroup: 'II',
    ...overrides,
  }
}

test('recommends an available dock for a waiting vehicle with transparent estimates', () => {
  const item = vehicle()
  const result = recommendDispatch(item, [item], [dock()], 40)
  assert.equal(result.recommendedDockId, '01')
  assert.equal(result.estimatedProcessingTimeMinutes, 40)
  assert.equal(result.estimatedWaitTimeMinutes, 0)
  assert.match(result.reason, /available/i)
  assert.equal(result.confidence, 'moderate')
})

test('legacy dataset and ordinary cargo remain dispatchable without capability configuration', () => {
  const item = vehicle()
  assert.equal(recommendDispatch(item, [item], [dock()], 40).recommendedDockId, '01')
  const fixture = cargoDataset()
  assert.equal(recommendDispatch(fixture.dispatchVehicle, [fixture.dispatchVehicle], [dock()], 40, fixture.dataset).recommendedDockId, '01')
})

test('ADR cargo dispatches only to a dock matching its explicitly configured capability', () => {
  const fixture = cargoDataset({
    cargo: { adrRecordId: 'adr-1' },
    adrRecords: [testAdr({ requiredDockCapabilityCode: 'ADR-3' })],
  })
  const result = recommendDispatch(fixture.dispatchVehicle, [fixture.dispatchVehicle], [dock({ capabilityCodes: ['ADR-3'] })], 40, fixture.dataset)
  assert.equal(result.recommendedDockId, '01')
  assert.equal(result.alternatives[0].capabilityMatch, 'matched')
  assert.equal(result.blockedDocks.length, 0)
})

test('blocking cargo conflict prevents recommendation and manual assignment with exact evidence', () => {
  const fixture = cargoDataset({
    cargo: { containerTypeId: 'container-1', weightKg: 9000 },
    containerTypes: [testContainer()],
  })
  const state = workingState({
    queue: [fixture.dispatchVehicle],
    docks: [dock()],
  })
  state.operationalDataset = fixture.dataset
  const recommendation = recommendDispatch(fixture.dispatchVehicle, state.queue, state.docks, 40, fixture.dataset)
  assert.equal(recommendation.recommendedDockId, null)
  assert.match(recommendation.reason, /9,000 kg.*8,000 kg/)
  const result = applyDispatchAction(state, { type: 'assign', vehicleId: fixture.vehicleId, dockId: '01' }, timestamp)
  assert.equal(result.conflicts[0].code, 'CARGO_COMPLIANCE_BLOCK')
  assert.match(result.conflicts[0].message, /payload.*exceeds/i)
  assert.deepEqual(result.events.map((event) => event.type), ['dispatch-conflict', 'dispatch-rejected'])
  assert.equal(result.state.queue.length, 1)
  assert.equal(result.state.docks[0].vehicleId, null)
})

test('warning-only ADR uncertainty stays visible without preventing assignment', () => {
  const fixture = cargoDataset({
    cargo: { adrRecordId: 'adr-1' },
    adrRecords: [testAdr({ status: 'unknown', unNumber: undefined, properShippingName: undefined, hazardClass: undefined })],
  })
  const state = workingState({ queue: [fixture.dispatchVehicle], docks: [dock()] })
  state.operationalDataset = fixture.dataset
  const recommendation = recommendDispatch(fixture.dispatchVehicle, state.queue, state.docks, 40, fixture.dataset)
  assert.equal(recommendation.recommendedDockId, '01')
  assert.ok(recommendation.warnings.some((message) => /marked unknown/i.test(message)))
  const result = applyDispatchAction(state, { type: 'assign', vehicleId: fixture.vehicleId, dockId: '01' }, timestamp)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.state.docks[0].vehicleId, fixture.vehicleId)
})

test('dock capability mismatch blocks that dock and an unconfigured dock is reported as undetermined', () => {
  const fixture = cargoDataset({
    cargo: { containerTypeId: 'container-1' },
    containerTypes: [testContainer({ requiredDockCapabilityCode: 'REEFER' })],
  })
  const item = fixture.dispatchVehicle
  const knownMismatch = recommendDispatch(item, [item], [dock({ capabilityCodes: [] })], 40, fixture.dataset)
  assert.equal(knownMismatch.recommendedDockId, null)
  assert.match(knownMismatch.blockedDocks[0].reasons[0], /lacks required configured capability/i)
  const unknown = recommendDispatch(item, [item], [dock()], 40, fixture.dataset)
  assert.equal(unknown.recommendedDockId, null)
  assert.equal(unknown.blockingConditions[0].code, 'DOCK_COMPATIBILITY_UNDETERMINED')
  assert.match(unknown.reason, /Insufficient configuration to determine compatibility/)
  const actionState = workingState({ queue: [item], docks: [dock({ capabilityCodes: [] })] })
  actionState.operationalDataset = fixture.dataset
  const rejected = applyDispatchAction(actionState, { type: 'assign', vehicleId: fixture.vehicleId, dockId: '01' }, timestamp)
  assert.equal(rejected.conflicts[0].code, 'DOCK_CAPABILITY_UNAVAILABLE')
})

test('multiple eligible docks are listed transparently and assignment decisions are logged', () => {
  const fixture = cargoDataset({
    cargo: { adrRecordId: 'adr-1' },
    adrRecords: [testAdr({ requiredDockCapabilityCode: 'ADR-3' })],
  })
  const item = fixture.dispatchVehicle
  const docks = [dock({ id: '07', capabilityCodes: ['ADR-3'], workloadMinutes: 5 }), dock({ id: '03', capabilityCodes: ['ADR-3'], workloadMinutes: 0 })]
  const recommendation = recommendDispatch(item, [item], docks, 40, fixture.dataset)
  assert.equal(recommendation.recommendedDockId, '03')
  assert.equal(recommendation.alternatives.length, 2)
  const state = workingState({ queue: [item], docks })
  state.operationalDataset = fixture.dataset
  const assigned = applyDispatchAction(state, { type: 'call', vehicleId: fixture.vehicleId, dockId: '03' }, timestamp)
  assert.deepEqual(assigned.conflicts, [])
  assert.deepEqual(assigned.events.map((event) => event.type), ['vehicle-called', 'dispatch-recommended', 'dispatch-accepted'])
  assert.ok(assigned.events.every((event) => event.vehicleId === fixture.vehicleId && event.dockId === '03'))
})

test('simulation does not auto-assign a vehicle with a blocking cargo conflict', () => {
  const fixture = cargoDataset({
    cargo: { containerTypeId: 'container-1', weightKg: 9000 },
    containerTypes: [testContainer()],
  })
  const state = workingState({ queue: [fixture.dispatchVehicle], docks: [dock()] })
  state.operationalDataset = fixture.dataset
  const ticked = advanceOperationsState(state, timestamp)
  assert.equal(ticked.queue.length, 1)
  assert.equal(ticked.docks[0].vehicleId, null)
})

test('bundled demo has one coherent queue-to-dock assignment per vehicle', () => {
  const assigned = new Set(demoDataset.docks.flatMap((item) => item.vehicleId ? [item.vehicleId] : []))
  assert.equal(demoDataset.queue.some((item) => assigned.has(item.vehicleId)), false)
  assert.equal(validateOperationsDataset(demoDataset).valid, true)
  assert.equal(validateDataset(demoDataset).valid, true)
})

test('does not recommend a maintenance dock', () => {
  const item = vehicle()
  const result = recommendDispatch(item, [item], [dock({ state: 'Maintenance', tone: 'maintenance' })], 40)
  assert.equal(result.recommendedDockId, null)
  assert.equal(result.blockingConditions[0].code, 'NO_COMPATIBLE_DOCK')
})

test('does not recommend an occupied dock', () => {
  const item = vehicle()
  const result = recommendDispatch(item, [item], [dock({ tone: 'loading', state: 'Loading', plate: 'BUSY-1', vehicleId: 'other' })], 40)
  assert.equal(result.recommendedDockId, null)
  assert.equal(result.blockingConditions[0].code, 'NO_COMPATIBLE_DOCK')
})

test('selects higher-priority vehicles ahead of earlier standard work', () => {
  const early = vehicle({ vehicleId: 'standard', plate: 'STD-1', queuePosition: 1 })
  const priority = vehicle({ vehicleId: 'priority', plate: 'PRI-1', priority: 'Priority', queuePosition: 2 })
  assert.equal(selectNextDispatchVehicle([early, priority], [dock()], 40)?.vehicleId, 'priority')
})

test('documentation-blocked vehicle cannot be recommended or assigned', () => {
  const blocked = vehicle({ priority: 'Documentation check' })
  const result = recommendDispatch(blocked, [blocked], [dock()], 40)
  assert.equal(result.recommendedDockId, null)
  assert.equal(result.blockingConditions[0].code, 'DOCUMENTATION_BLOCK')
  const applied = applyDispatchAction(workingState({ queue: [blocked] }), { type: 'call', vehicleId: blocked.vehicleId, dockId: '01' }, timestamp)
  assert.equal(applied.conflicts[0].code, 'DOCUMENTATION_BLOCK')
  assert.equal(applied.state.queue.length, 1)
  assert.equal(applied.state.dispatchEvents[0].type, 'dispatch-conflict')
})

test('reports a clear conflict when there is no suitable dock', () => {
  const item = vehicle()
  const result = recommendDispatch(item, [item], [], 40)
  assert.equal(result.recommendedDockId, null)
  assert.match(result.blockingConditions[0].message, /No dock records/)
})

test('manual assignment updates queue, dock, now-calling data, and activity event', () => {
  const initial = workingState()
  const result = applyDispatchAction(initial, { type: 'assign', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.state.queue.length, 0)
  assert.equal(result.state.docks[0].vehicleId, 'vehicle-1')
  assert.equal(result.state.docks[0].tone, 'called')
  assert.equal(result.state.callingVehicles[0].dockId, '01')
  assert.equal(result.state.manualControl, true)
  assert.equal(result.events[0].type, 'dock-assigned')
  assert.equal(result.events[0].timestamp, timestamp)
})

test('start requires a valid assignment and a called dock', () => {
  const unassigned = applyDispatchAction(workingState(), { type: 'start', vehicleId: 'vehicle-1' }, timestamp)
  assert.equal(unassigned.conflicts[0].code, 'VEHICLE_NOT_ASSIGNED')
  const assigned = applyDispatchAction(workingState(), { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  const started = applyDispatchAction(assigned.state, { type: 'start', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.deepEqual(started.conflicts, [])
  assert.equal(started.state.docks[0].tone, 'unloading')
  assert.equal(started.events[0].type, 'operation-started')
})

test('completion requires a started operation and changes dock to completed-awaiting-release', () => {
  const assigned = applyDispatchAction(workingState(), { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  const beforeStart = applyDispatchAction(assigned.state, { type: 'complete', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.equal(beforeStart.conflicts[0].code, 'OPERATION_NOT_STARTED')
  const started = applyDispatchAction(assigned.state, { type: 'start', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  const complete = applyDispatchAction({ ...started.state, docks: started.state.docks.map((item) => ({ ...item, progress: 100 })) }, { type: 'complete', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.equal(complete.state.docks[0].tone, 'completed')
  assert.equal(complete.state.docks[0].vehicleId, 'vehicle-1')
  assert.equal(complete.events[0].type, 'operation-completed')
})

test('releasing completed operation makes dock available and logs a release event', () => {
  const completed = dock({ state: 'Completed', tone: 'completed', vehicleId: 'vehicle-1', plate: 'TRK-001', carrier: 'North Freight', direction: 'Inbound', progress: 100 })
  const result = applyDispatchAction(workingState({ queue: [], docks: [completed] }), { type: 'release', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.state.docks[0].tone, 'available')
  assert.equal(result.state.docks[0].vehicleId, null)
  assert.equal(result.state.queue.length, 0)
  assert.equal(result.events[0].type, 'dock-released')
})

test('manual operator ownership prevents auto-dispatch from replacing an assignment', () => {
  const initial = workingState({ queue: [vehicle(), vehicle({ vehicleId: 'vehicle-2', plate: 'TRK-002', queuePosition: 2 })] })
  const called = applyDispatchAction(initial, { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp).state
  const afterTick = advanceOperationsState(called, timestamp)
  assert.equal(called.manualControl, true)
  assert.equal(afterTick.docks[0].tone, 'called')
  assert.equal(afterTick.docks[0].vehicleId, 'vehicle-1')
  assert.equal(afterTick.queue.length, 1)
  assert.equal(afterTick.queue[0].vehicleId, 'vehicle-2')
  assert.equal(afterTick.callingVehicles[0].vehicleId, 'vehicle-1')
  assert.equal(afterTick.autoCallVehicleIds.length, 0)
  const started = applyDispatchAction(afterTick, { type: 'start', vehicleId: 'vehicle-1', dockId: '01' }, timestamp).state
  const progressed = advanceOperationsState(started, timestamp)
  assert.equal(progressed.docks[0].vehicleId, 'vehicle-1')
  assert.equal(progressed.docks[0].tone, 'unloading')
  assert.equal(progressed.docks[0].progress, 11)
  assert.equal(progressed.queue.length, 1)
})

test('reassign moves a called vehicle atomically and records the new dock', () => {
  const initial = workingState({ docks: [dock(), dock({ id: '02' })] })
  const assigned = applyDispatchAction(initial, { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  const reassigned = applyDispatchAction(assigned.state, { type: 'reassign', vehicleId: 'vehicle-1', dockId: '02' }, timestamp)
  assert.deepEqual(reassigned.conflicts, [])
  assert.equal(reassigned.state.docks[0].tone, 'available')
  assert.equal(reassigned.state.docks[0].vehicleId, null)
  assert.equal(reassigned.state.docks[1].vehicleId, 'vehicle-1')
  assert.equal(reassigned.state.callingVehicles[0].dockId, '02')
  assert.equal(reassigned.events[0].type, 'dock-reassigned')
})

test('marking a waiting vehicle delayed updates its state and timeline', () => {
  const result = applyDispatchAction(workingState(), { type: 'delay', vehicleId: 'vehicle-1' }, timestamp)
  assert.equal(result.state.queue[0].status, 'delayed')
  assert.equal(result.state.queue[0].priority, 'Standard')
  assert.equal(result.events[0].type, 'vehicle-delayed')
  const analysisDataset = withWorkingOperations({ kpis: { delayedShipments: 0 } }, result.state)
  assert.equal(analysisDataset.kpis.delayedShipments, 1)
  assert.equal(analysisDataset.queue[0].priority, 'Delayed')
  const documented = applyDispatchAction(workingState({ queue: [vehicle({ priority: 'Documentation check' })] }), { type: 'delay', vehicleId: 'vehicle-1' }, timestamp)
  assert.equal(documented.state.queue[0].priority, 'Documentation check')
  assert.equal(recommendDispatch(documented.state.queue[0], documented.state.queue, [dock()], 40).blockingConditions[0].code, 'DOCUMENTATION_BLOCK')
})

test('automatic live ticks dispatch by priority and skip documentation blocks', () => {
  const standard = vehicle({ vehicleId: 'standard', plate: 'STD-1', queuePosition: 1 })
  const docs = vehicle({ vehicleId: 'docs', plate: 'DOC-1', queuePosition: 2, priority: 'Documentation check' })
  const priority = vehicle({ vehicleId: 'priority', plate: 'PRI-1', queuePosition: 3, priority: 'Priority' })
  const initial = workingState({ queue: [standard, docs, priority] })
  const next = advanceOperationsState(initial, timestamp)
  assert.equal(next.docks[0].vehicleId, 'priority')
  assert.deepEqual(next.queue.map((item) => item.vehicleId), ['standard', 'docs'])
  assert.equal(next.dispatchEvents[0].type, 'vehicle-called')
  assert.equal(next.manualControl, false)
})

test('hold blocks recommendation until resumed', () => {
  const held = { ...vehicle(), status: 'on-hold' }
  const recommendation = recommendDispatch(held, [held], [dock()], 40)
  assert.equal(recommendation.blockingConditions[0].code, 'VEHICLE_ON_HOLD')
  const holdResult = applyDispatchAction(workingState(), { type: 'hold', vehicleId: 'vehicle-1' }, timestamp)
  assert.equal(holdResult.state.queue[0].status, 'on-hold')
  const resumed = applyDispatchAction(holdResult.state, { type: 'resume', vehicleId: 'vehicle-1' }, timestamp)
  assert.equal(resumed.state.queue[0].status, 'waiting')
  assert.equal(resumed.events[0].type, 'vehicle-resumed')
})

test('rejects maintenance, occupied, duplicate and invalid-ID assignments without mutation', () => {
  for (const blockedDock of [
    dock({ state: 'Maintenance', tone: 'maintenance' }),
    dock({ state: 'Loading', tone: 'loading', vehicleId: 'other', plate: 'BUSY' }),
  ]) {
    const original = workingState({ docks: [blockedDock] })
    const snapshot = structuredClone(original)
    const result = applyDispatchAction(original, { type: 'assign', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
    assert.ok(['DOCK_UNAVAILABLE', 'DOCK_OCCUPIED'].includes(result.conflicts[0].code))
    assert.deepEqual(original, snapshot)
  }
  const state = workingState()
  assert.equal(applyDispatchAction(state, { type: 'assign', vehicleId: 'missing', dockId: '01' }, timestamp).conflicts[0].code, 'VEHICLE_NOT_FOUND')
  assert.equal(applyDispatchAction(state, { type: 'assign', vehicleId: 'vehicle-1', dockId: 'missing' }, timestamp).conflicts[0].code, 'DOCK_NOT_FOUND')
  const assigned = applyDispatchAction(state, { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.equal(applyDispatchAction(assigned.state, { type: 'assign', vehicleId: 'vehicle-1', dockId: '01' }, timestamp).conflicts[0].code, 'VEHICLE_ALREADY_ASSIGNED')
})

test('releasing an unstarted call returns that vehicle to queue and frees dock', () => {
  const assigned = applyDispatchAction(workingState(), { type: 'call', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  const released = applyDispatchAction(assigned.state, { type: 'release', vehicleId: 'vehicle-1', dockId: '01' }, timestamp)
  assert.equal(released.state.queue.length, 1)
  assert.equal(released.state.queue[0].status, 'waiting')
  assert.equal(released.state.docks[0].tone, 'available')
  assert.equal(released.events[0].type, 'dock-released')
})
