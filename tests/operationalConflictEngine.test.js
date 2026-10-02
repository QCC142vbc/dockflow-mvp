import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { recalculateDatasetIntegrity } from '../src/data/datasetFactory.ts'
import {
  validateAllOperationalCargo,
  validateOperation,
  validateVehicle,
} from '../src/data/operationalConflictEngine.ts'

const vehicleId = demoDataset.vehicles[0].vehicleId

function container(overrides = {}) {
  return {
    containerTypeId: 'container-standard',
    code: 'STD',
    name: 'Standard Container',
    category: 'standard',
    nominalLengthM: 6,
    widthM: 2.4,
    heightM: 2.6,
    maxGrossWeightKg: 30000,
    tareWeightKg: 3000,
    payloadCapacityKg: 27000,
    refrigerated: false,
    tank: false,
    openTop: false,
    flatRack: false,
    active: true,
    ...overrides,
  }
}

function applicableAdr(overrides = {}) {
  return {
    adrRecordId: 'adr-1',
    status: 'applicable',
    unNumber: 'UN 1203',
    properShippingName: 'GASOLINE',
    hazardClass: '3',
    packingGroup: 'II',
    ...overrides,
  }
}

function handling(overrides = {}) {
  return {
    handlingRequirementId: 'handling-dry',
    code: 'DRY',
    name: 'Keep Dry',
    category: 'environment',
    active: true,
    ...overrides,
  }
}

function cargo(overrides = {}) {
  return {
    cargoId: 'cargo-1',
    cargoType: 'General Cargo',
    description: 'Wrapped pallet load',
    quantity: 1,
    quantityUnit: 'load',
    weightKg: 18000,
    containerTypeId: 'container-standard',
    adrRecordId: 'adr-1',
    handlingRequirementIds: ['handling-dry'],
    vehicleId,
    operationId: 'operation-1',
    ...overrides,
  }
}

function operationalDataset({
  cargoRecords = [cargo()],
  containers = [container()],
  adrRecords = [applicableAdr()],
  requirements = [handling()],
  base = demoDataset,
} = {}) {
  return recalculateDatasetIntegrity({
    ...structuredClone(base),
    cargoCompliance: {
      cargo: cargoRecords,
      containerTypes: containers,
      adrRecords,
      handlingRequirements: requirements,
    },
  })
}

test('valid operation has no conflicts and can be queried by operation or vehicle', () => {
  const dataset = operationalDataset()
  const operationResult = validateOperation(dataset, 'operation-1')
  const vehicleResult = validateVehicle(dataset, vehicleId)
  assert.equal(operationResult.valid, true)
  assert.deepEqual(operationResult.conflicts, [])
  assert.equal(vehicleResult.valid, true)
  assert.deepEqual(vehicleResult.blockingConflicts, [])
  assert.deepEqual(vehicleResult.warnings, [])
  assert.deepEqual(validateAllOperationalCargo(dataset), [])
})

test('missing applicable ADR fields are a blocking conflict with field evidence', () => {
  const result = validateOperation(operationalDataset({
    adrRecords: [applicableAdr({ unNumber: undefined, properShippingName: undefined })],
  }), 'operation-1')
  const issue = result.blockingConflicts.find((item) => item.type === 'ADR_DETAILS_MISSING')
  assert.equal(result.valid, false)
  assert.deepEqual(issue.evidence.missingFields.split(', '), ['unNumber', 'properShippingName'])
  assert.match(issue.message, /UN number|unNumber/)
})

test('invalid container and handling references are blocking and explain the missing IDs', () => {
  const result = validateOperation(operationalDataset({
    cargoRecords: [cargo({ containerTypeId: 'container-missing', handlingRequirementIds: ['handling-missing'] })],
  }), 'operation-1')
  assert.equal(result.blockingConflicts.length, 2)
  assert.ok(result.conflicts.some((item) => item.type === 'INVALID_CONTAINER_REFERENCE' && /container-missing/.test(item.message)))
  assert.ok(result.conflicts.some((item) => item.type === 'INVALID_HANDLING_REFERENCE' && /handling-missing/.test(item.message)))
})

test('cargo weight exceeding configured payload produces an evidence-backed blocking conflict', () => {
  const result = validateOperation(operationalDataset({
    cargoRecords: [cargo({ weightKg: 28000 })],
    containers: [container({ payloadCapacityKg: 27000 })],
  }), 'operation-1')
  const issue = result.blockingConflicts.find((item) => item.type === 'CONTAINER_PAYLOAD_EXCEEDED')
  assert.equal(issue.evidence.cargoWeightKg, 28000)
  assert.equal(issue.evidence.payloadCapacityKg, 27000)
  assert.equal(issue.evidence.capacitySource, 'lowest-of-payloadCapacityKg-and-maxGrossWeightKg-minus-tareWeightKg')
  assert.match(issue.message, /28,000 kg.*27,000 kg/)
})

test('inactive definitions produce warnings but do not make the operation invalid', () => {
  const result = validateOperation(operationalDataset({
    containers: [container({ active: false })],
    requirements: [handling({ active: false })],
    adrRecords: [applicableAdr({ active: false })],
  }), 'operation-1')
  assert.equal(result.valid, true)
  assert.equal(result.blockingConflicts.length, 0)
  assert.equal(result.warnings.length, 3)
  assert.ok(result.warnings.some((item) => item.type === 'INACTIVE_CONTAINER_ASSIGNED'))
  assert.ok(result.warnings.some((item) => item.type === 'INACTIVE_HANDLING_REQUIREMENT'))
  assert.ok(result.warnings.some((item) => item.type === 'INACTIVE_ADR_RECORD'))
})

test('multiple conflicts are returned together with distinct records and severities', () => {
  const result = validateOperation(operationalDataset({
    cargoRecords: [cargo({ weightKg: 29000, handlingRequirementIds: ['missing'], vehicleId: 'unknown-vehicle' })],
    containers: [container({ active: false, payloadCapacityKg: 25000 })],
    adrRecords: [applicableAdr({ status: 'unknown', unNumber: undefined, hazardClass: undefined })],
  }), 'operation-1')
  assert.ok(result.conflicts.length >= 4)
  assert.ok(result.blockingConflicts.some((item) => item.type === 'INVALID_VEHICLE_REFERENCE'))
  assert.ok(result.blockingConflicts.some((item) => item.type === 'CONTAINER_PAYLOAD_EXCEEDED'))
  assert.ok(result.warnings.some((item) => item.type === 'INACTIVE_CONTAINER_ASSIGNED'))
  assert.ok(result.warnings.some((item) => item.type === 'ADR_STATUS_UNKNOWN'))
  assert.equal(result.valid, false)
  assert.ok(result.conflicts.every((item) =>
    item.conflictId && item.type && item.severity && item.entity && item.entityId &&
    item.message && item.evidence && typeof item.blocking === 'boolean' && Array.isArray(item.relatedRecords)))
})

test('unknown ADR status warns, while absent optional ADR and handling information is not inferred', () => {
  const unknownAdr = validateOperation(operationalDataset({
    cargoRecords: [cargo({ adrRecordId: 'adr-unknown', handlingRequirementIds: [] })],
    adrRecords: [{ adrRecordId: 'adr-unknown', status: 'unknown' }],
  }), 'operation-1')
  assert.equal(unknownAdr.valid, true)
  assert.equal(unknownAdr.warnings[0].type, 'ADR_STATUS_UNKNOWN')

  const noInformation = validateOperation(operationalDataset({
    cargoRecords: [cargo({ adrRecordId: undefined, containerTypeId: undefined, handlingRequirementIds: [] })],
    containers: [],
    adrRecords: [],
    requirements: [],
  }), 'operation-1')
  assert.deepEqual(noInformation.conflicts, [])
})

test('capacity without configured payload data is informational rather than a guessed restriction', () => {
  const result = validateOperation(operationalDataset({
    cargoRecords: [cargo({ weightKg: 50000 })],
    containers: [container({ payloadCapacityKg: undefined, tareWeightKg: undefined })],
  }), 'operation-1')
  assert.equal(result.valid, true)
  assert.equal(result.informational[0].type, 'CONTAINER_CAPACITY_UNAVAILABLE')
  assert.equal(result.informational[0].evidence.payloadCapacityKg, null)
})

test('gross weight minus configured tare weight provides the capacity basis when explicit payload is absent', () => {
  const result = validateOperation(operationalDataset({
    cargoRecords: [cargo({ weightKg: 28000 })],
    containers: [container({ payloadCapacityKg: undefined })],
  }), 'operation-1')
  const issue = result.blockingConflicts.find((item) => item.type === 'CONTAINER_PAYLOAD_EXCEEDED')
  assert.equal(issue.evidence.payloadCapacityKg, 27000)
  assert.equal(issue.evidence.capacitySource, 'maxGrossWeightKg-minus-tareWeightKg')
})

test('dock and queue contradictions are reported without inventing dock capability rules', () => {
  const base = structuredClone(demoDataset)
  const sampleVehicleId = base.vehicles[0].vehicleId
  base.queue.push({
    queueId: 'queued-duplicate',
    position: 999,
    vehicleId: sampleVehicleId,
    plate: base.vehicles[0].plate,
    carrier: base.vehicles[0].carrier,
    loadType: base.vehicles[0].loadType,
    arrivalTime: '08:00',
    estimatedCallTime: '09:00',
    priority: 'Standard',
  })
  base.docks[0].vehicleId = sampleVehicleId
  const dataset = operationalDataset({ base, cargoRecords: [cargo({ vehicleId: sampleVehicleId })] })
  const result = validateVehicle(dataset, sampleVehicleId)
  assert.ok(result.blockingConflicts.some((item) => item.type === 'VEHICLE_QUEUED_AND_DOCKED'))
  assert.equal(result.conflicts.some((item) => item.type === 'DOCK_UNAVAILABLE_WHILE_OCCUPIED'), false)
})

test('legacy datasets and unknown operation IDs are informational or conflict-free, never crashes', () => {
  assert.deepEqual(validateAllOperationalCargo(demoDataset), [])
  assert.equal(validateVehicle(demoDataset, vehicleId).valid, true)
  const unknownOperation = validateOperation(demoDataset, 'operation-not-present')
  assert.equal(unknownOperation.valid, true)
  assert.equal(unknownOperation.informational[0].type, 'OPERATION_NOT_FOUND')
})
