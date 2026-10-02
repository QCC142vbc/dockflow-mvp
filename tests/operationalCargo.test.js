import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { validateOperationsDataset, recalculateDatasetIntegrity } from '../src/data/datasetFactory.ts'
import { parseImportedDataset } from '../src/data/datasetStore.js'
import { saveOperationalCargoReferences, unassignOperationalCargo } from '../src/data/operationalCargo.ts'
import { validateDataset } from '../simulator/src/validate.js'

const vehicleId = demoDataset.vehicles[0].vehicleId
const secondVehicleId = demoDataset.vehicles[1].vehicleId
const timestamp = '2026-10-02T18:50:00.000Z'

function baseCargoCompliance() {
  return {
    containerTypes: [{
      containerTypeId: 'container-hc',
      code: '40HC',
      name: '40ft High Cube',
      category: 'standard',
      nominalLengthM: 12.192,
      widthM: 2.438,
      heightM: 2.896,
      maxGrossWeightKg: 30480,
      payloadCapacityKg: 26780,
      refrigerated: false,
      tank: false,
      openTop: false,
      flatRack: false,
      active: true,
    }],
    adrRecords: [{
      adrRecordId: 'adr-fuel',
      status: 'applicable',
      unNumber: 'UN 1203',
      properShippingName: 'GASOLINE',
      hazardClass: '3',
      packingGroup: 'II',
    }],
    handlingRequirements: [{
      handlingRequirementId: 'handling-dry',
      code: 'DRY',
      name: 'Keep Dry',
      category: 'environment',
      active: true,
    }],
    cargo: [{
      cargoId: 'cargo-load-1',
      cargoType: 'General Cargo',
      description: 'Wrapped pallet load',
      quantity: 12,
      quantityUnit: 'pallets',
      weightKg: 18400,
      handlingRequirementIds: [],
    }],
  }
}

function datasetWithCargo(cargoCompliance = baseCargoCompliance()) {
  return recalculateDatasetIntegrity({
    ...structuredClone(demoDataset),
    cargoCompliance,
  })
}

const noReferences = { handlingRequirementIds: [] }

test('assigns cargo, container, ADR, and handling references to a real vehicle', () => {
  const dataset = datasetWithCargo()
  const result = saveOperationalCargoReferences(dataset, vehicleId, 'cargo-load-1', {
    containerTypeId: 'container-hc',
    adrRecordId: 'adr-fuel',
    handlingRequirementIds: ['handling-dry'],
  }, timestamp)
  const assigned = result.dataset.cargoCompliance.cargo[0]
  assert.equal(assigned.vehicleId, vehicleId)
  assert.equal(assigned.containerTypeId, 'container-hc')
  assert.equal(assigned.adrRecordId, 'adr-fuel')
  assert.deepEqual(assigned.handlingRequirementIds, ['handling-dry'])
  assert.deepEqual(result.events.map((event) => event.type), [
    'cargo-assigned',
    'container-type-changed',
    'adr-information-changed',
    'handling-requirement-changed',
  ])
  assert.equal(validateOperationsDataset(result.dataset).valid, true)
})

test('assigns cargo when optional container, ADR, and handling information is absent', () => {
  const result = saveOperationalCargoReferences(datasetWithCargo(), vehicleId, 'cargo-load-1', noReferences, timestamp)
  const assigned = result.dataset.cargoCompliance.cargo[0]
  assert.equal(assigned.vehicleId, vehicleId)
  assert.equal(Object.hasOwn(assigned, 'containerTypeId'), false)
  assert.equal(Object.hasOwn(assigned, 'adrRecordId'), false)
  assert.deepEqual(assigned.handlingRequirementIds, [])
  assert.deepEqual(result.events.map((event) => event.type), ['cargo-assigned'])
})

test('edits existing operational references and logs only actual changes', () => {
  const data = baseCargoCompliance()
  data.containerTypes.push({
    ...data.containerTypes[0],
    containerTypeId: 'container-reefer',
    code: '40RF',
    name: '40ft Reefer',
    category: 'reefer',
    refrigerated: true,
  })
  data.adrRecords.push({ adrRecordId: 'adr-none', status: 'not-applicable' })
  data.handlingRequirements.push({
    handlingRequirementId: 'handling-fragile',
    code: 'FRAG',
    name: 'Fragile',
    category: 'physical',
    active: true,
  })
  data.cargo[0] = {
    ...data.cargo[0],
    vehicleId,
    containerTypeId: 'container-hc',
    adrRecordId: 'adr-fuel',
    handlingRequirementIds: ['handling-dry'],
  }
  const result = saveOperationalCargoReferences(datasetWithCargo(data), vehicleId, 'cargo-load-1', {
    containerTypeId: 'container-reefer',
    adrRecordId: 'adr-none',
    handlingRequirementIds: ['handling-dry', 'handling-fragile'],
  }, timestamp)
  assert.deepEqual(result.events.map((event) => event.type), [
    'container-type-changed',
    'adr-information-changed',
    'handling-requirement-changed',
  ])
  assert.equal(result.dataset.cargoCompliance.cargo[0].vehicleId, vehicleId)
  assert.equal(result.dataset.cargoCompliance.cargo[0].containerTypeId, 'container-reefer')
})

test('rejects missing records, cross-vehicle reassignment, and newly selected inactive references', () => {
  const dataset = datasetWithCargo()
  assert.throws(() => saveOperationalCargoReferences(dataset, vehicleId, 'missing-cargo', noReferences), /does not exist/)
  assert.throws(() => saveOperationalCargoReferences(dataset, 'missing-vehicle', 'cargo-load-1', noReferences), /Vehicle .* does not exist/)
  assert.throws(() => saveOperationalCargoReferences(dataset, vehicleId, 'cargo-load-1', {
    ...noReferences,
    containerTypeId: 'missing-container',
  }), /does not exist/)
  assert.throws(() => saveOperationalCargoReferences(dataset, vehicleId, 'cargo-load-1', {
    ...noReferences,
    adrRecordId: 'missing-adr',
  }), /does not exist/)
  assert.throws(() => saveOperationalCargoReferences(dataset, vehicleId, 'cargo-load-1', {
    handlingRequirementIds: ['missing-handling'],
  }), /does not exist/)

  const inactive = baseCargoCompliance()
  inactive.containerTypes[0].active = false
  inactive.adrRecords[0].active = false
  inactive.handlingRequirements[0].active = false
  const inactiveDataset = datasetWithCargo(inactive)
  for (const references of [
    { ...noReferences, containerTypeId: 'container-hc' },
    { ...noReferences, adrRecordId: 'adr-fuel' },
    { handlingRequirementIds: ['handling-dry'] },
  ]) {
    assert.throws(() => saveOperationalCargoReferences(inactiveDataset, vehicleId, 'cargo-load-1', references), /inactive/)
  }

  inactive.cargo[0].vehicleId = vehicleId
  const assigned = datasetWithCargo(inactive)
  assert.throws(() => saveOperationalCargoReferences(assigned, secondVehicleId, 'cargo-load-1', noReferences), /already assigned/)
})

test('unassigns cargo without deleting it and records a factual event', () => {
  const data = baseCargoCompliance()
  data.cargo[0].vehicleId = vehicleId
  const dataset = datasetWithCargo(data)
  const result = unassignOperationalCargo(dataset, vehicleId, 'cargo-load-1', timestamp)
  assert.equal(Object.hasOwn(result.dataset.cargoCompliance.cargo[0], 'vehicleId'), false)
  assert.equal(result.dataset.cargoCompliance.cargo.length, 1)
  assert.equal(result.events[0].type, 'cargo-unassigned')
  assert.match(result.events[0].description, new RegExp(vehicleId))
  assert.throws(() => unassignOperationalCargo(dataset, secondVehicleId, 'cargo-load-1'), /not assigned/)
})

test('optional cargo is absent safely on legacy datasets and import/export preserves assignments and events', () => {
  const legacy = structuredClone(demoDataset)
  assert.equal(Object.hasOwn(legacy, 'cargoCompliance'), false)
  assert.equal(validateOperationsDataset(legacy).valid, true)
  assert.equal(validateDataset(legacy).valid, true)
  assert.throws(() => saveOperationalCargoReferences(legacy, vehicleId, 'cargo-1', noReferences), /no Cargo & Compliance catalog/)

  const assigned = saveOperationalCargoReferences(datasetWithCargo(), vehicleId, 'cargo-load-1', {
    containerTypeId: 'container-hc',
    adrRecordId: 'adr-fuel',
    handlingRequirementIds: ['handling-dry'],
  }, timestamp).dataset
  const imported = parseImportedDataset(JSON.stringify(assigned))
  assert.equal(imported.cargoCompliance.cargo[0].vehicleId, vehicleId)
  assert.equal(imported.cargoCompliance.cargoAssignmentHistory.length, 4)
  assert.equal(validateDataset(imported).valid, true)
  assert.equal(validateOperationsDataset(imported).valid, true)
})

test('rejects malformed cargo assignment audit records during dataset validation/import', () => {
  const dataset = datasetWithCargo()
  dataset.cargoCompliance.cargoAssignmentHistory = [{
    eventId: 'cargo-event-1',
    timestamp,
    type: 'unknown-event',
    vehicleId,
    cargoId: 'cargo-load-1',
    description: 'Malformed event',
  }]
  const invalid = recalculateDatasetIntegrity(dataset)
  assert.equal(validateOperationsDataset(invalid).valid, false)
  assert.equal(validateDataset(invalid).valid, false)
  assert.throws(() => parseImportedDataset(JSON.stringify(invalid)), /cargo assignment event/)
})
