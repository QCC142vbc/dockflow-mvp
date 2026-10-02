import test from 'node:test'
import assert from 'node:assert/strict'
import demoDataset from '../data/examples/demo-dataset.json' with { type: 'json' }
import { recalculateDatasetIntegrity, validateOperationsDataset } from '../src/data/datasetFactory.ts'
import { validateCargoComplianceData } from '../src/data/cargoComplianceValidation.ts'
import { parseImportedDataset } from '../src/data/datasetStore.js'
import {
  appendAdrAuditHistory,
  deleteAdrRecord,
  duplicateAdrRecord,
  getAdrRecordReferences,
  recordAdrChanges,
  setAdrRecordActive,
} from '../src/data/adrRecordManagement.ts'
import { validateDataset } from '../simulator/src/validate.js'

const applicableAdr = (overrides = {}) => ({
  adrRecordId: 'adr-fuel',
  status: 'applicable',
  active: true,
  unNumber: 'UN 1203',
  properShippingName: 'GASOLINE',
  hazardClass: '3',
  packingGroup: 'II',
  tunnelRestrictionCode: 'D/E',
  additionalNotes: 'Operational description only.',
  ...overrides,
})

const cargoCompliance = (adrRecords = [applicableAdr()], cargo = []) => ({
  cargo,
  containerTypes: [],
  adrRecords,
  handlingRequirements: [],
})

const cargo = (adrRecordId) => ({
  cargoId: 'cargo-1',
  cargoType: 'General',
  description: 'Test cargo',
  quantity: 1,
  quantityUnit: 'load',
  handlingRequirementIds: [],
  ...(adrRecordId ? { adrRecordId } : {}),
})

function datasetWithAdr(records, cargoRecords = []) {
  return recalculateDatasetIntegrity({
    ...structuredClone(demoDataset),
    cargoCompliance: cargoCompliance(records, cargoRecords),
  })
}

test('accepts a structurally valid ADR record and cargo without ADR details', () => {
  assert.deepEqual(validateCargoComplianceData(cargoCompliance(), new Set()), [])
  assert.deepEqual(validateCargoComplianceData(cargoCompliance([], [cargo()]), new Set()), [])
  const nonAdr = cargoCompliance([{ adrRecordId: 'adr-none', status: 'not-applicable' }], [cargo('adr-none')])
  assert.deepEqual(validateCargoComplianceData(nonAdr, new Set()), [])
})

test('rejects malformed UN number, hazard class, and required applicable fields', () => {
  for (const invalidAdr of [
    applicableAdr({ unNumber: '1203' }),
    applicableAdr({ hazardClass: '10' }),
    { adrRecordId: 'adr-incomplete', status: 'applicable', unNumber: 'UN 1234' },
    applicableAdr({ packingGroup: 'IV' }),
  ]) {
    assert.ok(validateCargoComplianceData(cargoCompliance([invalidAdr]), new Set()).some((error) => error.includes('ADR record')))
  }
})

test('edits and duplicates ADR records while recording only factual changes', () => {
  const original = applicableAdr()
  const changed = applicableAdr({
    unNumber: 'UN 1263',
    properShippingName: 'PAINT',
    hazardClass: '3',
    packingGroup: 'III',
    tunnelRestrictionCode: 'C/D',
  })
  const changes = recordAdrChanges(original, changed, '2026-10-02T18:00:00.000Z', 0)
  assert.deepEqual(changes.map((event) => event.eventType), [
    'un-number-changed',
    'proper-shipping-name-changed',
    'packing-group-changed',
    'tunnel-restriction-changed',
  ])
  assert.equal(changes[0].previousValue, 'UN 1203')
  assert.equal(changes[0].newValue, 'UN 1263')

  const copy = duplicateAdrRecord(changed, [original, changed])
  assert.notEqual(copy.adrRecordId, changed.adrRecordId)
  assert.equal(copy.status, 'unknown')
  assert.equal(copy.unNumber, undefined)
  assert.equal(copy.active, true)
  assert.equal(recordAdrChanges(undefined, copy, '2026-10-02T18:01:00.000Z').some((event) => event.eventType === 'adr-enabled'), false)
})

test('deactivation preserves cargo references and deletion is blocked while referenced', () => {
  const data = cargoCompliance([applicableAdr()], [cargo('adr-fuel')])
  assert.equal(getAdrRecordReferences(data, 'adr-fuel').length, 1)
  assert.throws(() => deleteAdrRecord(data, 'adr-fuel'), /1 cargo record/)
  const deactivated = setAdrRecordActive(data, 'adr-fuel', false)
  assert.equal(deactivated.adrRecords[0].active, false)
  assert.equal(deactivated.cargo[0].adrRecordId, 'adr-fuel')
  assert.equal(deleteAdrRecord({ ...deactivated, cargo: [] }, 'adr-fuel').adrRecords.length, 0)

  const audited = appendAdrAuditHistory(
    { ...data, cargo: [] },
    recordAdrChanges(undefined, applicableAdr(), '2026-10-02T18:02:00.000Z'),
  )
  assert.throws(() => deleteAdrRecord(audited, 'adr-fuel'), /audit event.*reference/i)
})

test('dataset export/import retains ADR records and audit history; malformed ADR data is rejected', () => {
  const adr = applicableAdr({ packingGroup: 'III' })
  const history = recordAdrChanges(undefined, adr, '2026-10-02T18:00:00.000Z')
  const dataset = datasetWithAdr([adr])
  dataset.cargoCompliance = appendAdrAuditHistory(dataset.cargoCompliance, history)
  const exportable = recalculateDatasetIntegrity(dataset)

  const imported = parseImportedDataset(JSON.stringify(exportable))
  assert.deepEqual(imported.cargoCompliance.adrRecords, [adr])
  assert.deepEqual(imported.cargoCompliance.adrAuditHistory, history)
  assert.equal(validateDataset(imported).valid, true)

  const malformed = structuredClone(imported)
  malformed.cargoCompliance.adrRecords[0].hazardClass = '10'
  recalculateDatasetIntegrity(malformed)
  assert.throws(() => parseImportedDataset(JSON.stringify(malformed)), /ADR record/)
  assert.equal(validateOperationsDataset(malformed).valid, false)
  assert.equal(validateDataset(malformed).valid, false)
})

test('legacy dataset remains valid and gets no fabricated ADR audit history', () => {
  const legacy = structuredClone(demoDataset)
  assert.equal(Object.hasOwn(legacy, 'cargoCompliance'), false)
  assert.equal(validateOperationsDataset(legacy).valid, true)
  assert.equal(validateDataset(legacy).valid, true)
})
