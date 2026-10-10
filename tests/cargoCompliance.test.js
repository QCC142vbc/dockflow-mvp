import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { validateOperationsDataset, recalculateDatasetIntegrity } from '../src/data/datasetFactory.ts'
import { validateDataset } from '../simulator/src/validate.js'
import { createStarterMasterData, mergeStarterMasterData } from '../src/data/masterDataDefaults.ts'

const validCargoCompliance = () => ({
  containerTypes: [{
    containerTypeId: 'container-40rf',
    code: '40RF',
    name: '40ft Reefer',
    category: 'reefer',
    nominalLengthM: 12.192,
    widthM: 2.438,
    heightM: 2.896,
    maxGrossWeightKg: 34000,
    tareWeightKg: 4800,
    refrigerated: true,
    tank: false,
    openTop: false,
    flatRack: false,
    active: true,
  }],
  adrRecords: [{
    adrRecordId: 'adr-un1203',
    status: 'applicable',
    unNumber: 'UN 1203',
    properShippingName: 'GASOLINE',
    hazardClass: '3',
    packingGroup: 'II',
    tunnelRestrictionCode: 'D/E',
  }],
  handlingRequirements: [{
    handlingRequirementId: 'handling-cool',
    code: 'COOL',
    name: 'Temperature controlled',
    category: 'temperature',
    active: true,
    attributes: { minimumCelsius: 2, maximumCelsius: 8 },
  }],
  cargo: [{
    cargoId: 'cargo-001',
    cargoType: 'Produce',
    description: 'Temperature controlled produce',
    quantity: 20,
    quantityUnit: 'pallets',
    weightKg: 1200,
    volumeM3: 18.5,
    containerTypeId: 'container-40rf',
    adrRecordId: 'adr-un1203',
    handlingRequirementIds: ['handling-cool'],
    vehicleId: 'veh-001',
  }],
})

function datasetWithCargo(cargoCompliance = validCargoCompliance()) {
  const dataset = structuredClone(demoDataset)
  dataset.cargoCompliance = cargoCompliance
  return recalculateDatasetIntegrity(dataset)
}

test('accepts valid cargo, configurable container, ADR, and handling references', () => {
  const dataset = datasetWithCargo()
  assert.deepEqual(validateOperationsDataset(dataset), { valid: true, errors: [] })
  assert.equal(validateDataset(dataset).valid, true)
})

test('accepts a valid custom container type and rejects invalid dimensions or weights', () => {
  const valid = datasetWithCargo()
  assert.equal(validateOperationsDataset(valid).valid, true)

  const invalid = validCargoCompliance()
  invalid.containerTypes[0].widthM = 0
  invalid.containerTypes[0].tareWeightKg = invalid.containerTypes[0].maxGrossWeightKg
  const result = validateOperationsDataset(datasetWithCargo(invalid))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('container type')))
  assert.equal(validateDataset(datasetWithCargo(invalid)).valid, false)
})

test('requires ADR details for applicable records and validates UN number and hazard class', () => {
  const missingDetails = validCargoCompliance()
  missingDetails.adrRecords[0].unNumber = '1203'
  missingDetails.adrRecords[0].hazardClass = '10'
  const result = validateOperationsDataset(datasetWithCargo(missingDetails))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('ADR record')))
  assert.equal(validateDataset(datasetWithCargo(missingDetails)).valid, false)

  const validNonApplicable = validCargoCompliance()
  validNonApplicable.adrRecords = [{ adrRecordId: 'adr-none', status: 'not-applicable' }]
  validNonApplicable.cargo[0].adrRecordId = 'adr-none'
  assert.equal(validateOperationsDataset(datasetWithCargo(validNonApplicable)).valid, true)
})

test('rejects missing cargo fields, invalid quantities, and dangling references', () => {
  const invalid = validCargoCompliance()
  delete invalid.cargo[0].description
  invalid.cargo[0].quantity = -1
  invalid.cargo[0].weightKg = Number.NaN
  invalid.cargo[0].containerTypeId = 'missing-container'
  const dataset = datasetWithCargo(invalid)
  const result = validateOperationsDataset(dataset)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('cargo record')))
  assert.ok(result.errors.some((error) => error.includes('unknown containerTypeId')))
  assert.equal(validateDataset(dataset).valid, false)
})

test('rejects duplicate IDs and unknown vehicle/handling references', () => {
  const invalid = validCargoCompliance()
  invalid.containerTypes.push({ ...invalid.containerTypes[0], name: 'Duplicate ID' })
  invalid.cargo[0].vehicleId = 'missing-vehicle'
  invalid.cargo[0].handlingRequirementIds = ['missing-handling']
  const result = validateOperationsDataset(datasetWithCargo(invalid))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('duplicate containerTypeId')))
  assert.ok(result.errors.some((error) => error.includes('unknown vehicleId')))
  assert.ok(result.errors.some((error) => error.includes('unknown handlingRequirementId')))
})

test('continues to accept legacy datasets without Cargo & Compliance data', () => {
  const legacy = structuredClone(demoDataset)
  assert.equal(Object.hasOwn(legacy, 'cargoCompliance'), false)
  assert.equal(validateOperationsDataset(legacy).valid, true)
  assert.equal(validateDataset(legacy).valid, true)
})

test('creates a versioned editable master-data catalog that validates and round-trips', () => {
  const masterData = createStarterMasterData()
  assert.equal(masterData.catalogDefaultsVersion, '2')
  assert.equal(masterData.containerTypes.length, 12)
  assert.equal(masterData.packagingTypes?.length, 12)
  assert.equal(masterData.handlingRequirements.length, 15)
  assert.equal(masterData.temperatureProfiles?.length, 7)
  assert.equal(masterData.cargo.length, 20)
  assert.ok(masterData.handlingRequirements.every((item) => item.cargoExamples?.length === 2))
  assert.ok(masterData.packagingTypes?.every((item) => item.typicalCargo.length >= 2))
  assert.equal(masterData.adrRecords.length, 31)

  const dataset = datasetWithCargo(masterData)
  assert.deepEqual(validateOperationsDataset(dataset), { valid: true, errors: [] })
  assert.equal(validateDataset(dataset).valid, true)
  const imported = JSON.parse(JSON.stringify(dataset))
  assert.deepEqual(validateOperationsDataset(imported), { valid: true, errors: [] })
  assert.equal(imported.cargoCompliance.packagingTypes.length, 12)
  assert.equal(imported.cargoCompliance.temperatureProfiles.length, 7)
})

test('starter catalog migration preserves user records and does not reapply after initialization', () => {
  const userContainer = {
    containerTypeId: 'container-user',
    code: '20STD',
    name: 'User Standard Container',
    category: 'standard',
    nominalLengthM: 5.9,
    widthM: 2.35,
    heightM: 2.39,
    maxGrossWeightKg: 30000,
    refrigerated: false,
    tank: false,
    openTop: false,
    flatRack: false,
    active: true,
  }
  const migrated = mergeStarterMasterData({
    ...validCargoCompliance(),
    cargo: [],
    containerTypes: [userContainer],
  })
  assert.equal(migrated.containerTypes.find((record) => record.containerTypeId === userContainer.containerTypeId)?.name, userContainer.name)
  assert.equal(migrated.containerTypes.some((record) => record.containerTypeId === 'container-20-standard'), false)
  assert.ok(migrated.cargo.length > 0)

  const afterUserEdit = {
    ...migrated,
    cargo: migrated.cargo.map((record) => ({ ...record, name: `Custom ${record.name}` })),
  }
  assert.equal(mergeStarterMasterData(afterUserEdit), afterUserEdit)
  assert.ok(afterUserEdit.cargo.every((record) => record.name.startsWith('Custom ')))
})

test('validates packaging references, ADR-required references, and temperature ranges', () => {
  const data = createStarterMasterData()
  const dataset = datasetWithCargo(data)
  const temperature = data.temperatureProfiles.find((item) => item.temperatureProfileId === 'temp-frozen')
  assert.equal(temperature.minimumCelsius, -18)

  const invalid = structuredClone(data)
  invalid.cargo[0].packagingTypeId = 'missing-packaging'
  invalid.cargo[0].temperatureProfileId = 'missing-temperature'
  invalid.cargo[1].adrRequired = true
  invalid.temperatureProfiles[0].minimumCelsius = 30
  invalid.temperatureProfiles[0].maximumCelsius = 20
  const result = validateOperationsDataset(datasetWithCargo(invalid))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('unknown packagingTypeId')))
  assert.ok(result.errors.some((error) => error.includes('unknown temperatureProfileId')))
  assert.ok(result.errors.some((error) => error.includes('requires an ADR reference')))
  assert.ok(result.errors.some((error) => error.includes('temperature profile')))
  assert.equal(validateDataset(datasetWithCargo(invalid)).valid, false)
})

test('validates explicitly configured dock capability codes in cargo definitions and docks', () => {
  const configured = validCargoCompliance()
  configured.containerTypes[0].requiredDockCapabilityCode = 'REEFER'
  configured.adrRecords[0].requiredDockCapabilityCode = 'ADR-3'
  configured.handlingRequirements[0].requiredDockCapabilityCode = 'COLD'
  const dataset = datasetWithCargo(configured)
  dataset.docks[0].capabilityCodes = ['REEFER', 'ADR-3', 'COLD']
  const valid = recalculateDatasetIntegrity(dataset)
  assert.equal(validateOperationsDataset(valid).valid, true)
  assert.equal(validateDataset(valid).valid, true)
  const roundTrip = JSON.parse(JSON.stringify(valid))
  assert.equal(validateOperationsDataset(roundTrip).valid, true)
  assert.equal(validateDataset(roundTrip).valid, true)
  assert.deepEqual(roundTrip.cargoCompliance.adrRecords[0].requiredDockCapabilityCode, 'ADR-3')
  assert.deepEqual(roundTrip.docks[0].capabilityCodes, ['REEFER', 'ADR-3', 'COLD'])

  const invalid = structuredClone(valid)
  invalid.docks[0].capabilityCodes = ['bad code', 'REEFER', 'REEFER']
  const malformed = recalculateDatasetIntegrity(invalid)
  assert.equal(validateOperationsDataset(malformed).valid, false)
  assert.equal(validateDataset(malformed).valid, false)
})

test('rejects repeated UN numbers even when ADR record IDs differ', () => {
  const records = validCargoCompliance()
  records.adrRecords.push({ ...records.adrRecords[0], adrRecordId: 'adr-duplicate-number' })
  const dataset = datasetWithCargo(records)
  assert.equal(validateOperationsDataset(dataset).valid, false)
  assert.equal(validateDataset(dataset).valid, false)
})
