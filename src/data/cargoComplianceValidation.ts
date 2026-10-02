import type {
  ADRHazardClass,
  ADRAuditEventType,
  ADRPackingGroup,
  ADRStatus,
  ContainerCategory,
  HandlingRequirementCategory,
  HandlingRequirementValue,
} from './datasetTypes'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/
const UN_NUMBER_PATTERN = /^UN [0-9]{4}$/
const ADR_STATUSES: ADRStatus[] = ['applicable', 'not-applicable', 'unknown']
const ADR_CLASSES: ADRHazardClass[] = ['1', '2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9']
const PACKING_GROUPS: ADRPackingGroup[] = ['I', 'II', 'III']
const CONTAINER_CATEGORIES: ContainerCategory[] = ['standard', 'reefer', 'tank', 'open-top', 'flat-rack', 'other']
const HANDLING_CATEGORIES: HandlingRequirementCategory[] = ['temperature', 'environment', 'security', 'safety', 'physical', 'other']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value)
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const optionalText = (record: Record<string, unknown>, key: string) =>
  record[key] === undefined || typeof record[key] === 'string'
const optionalNonNegative = (record: Record<string, unknown>, key: string) =>
  record[key] === undefined || isNonNegative(record[key])
const optionalPositive = (record: Record<string, unknown>, key: string) =>
  record[key] === undefined || isPositive(record[key])

export function validateCargoComplianceData(value: unknown, vehicleIds: ReadonlySet<string>): string[] {
  const errors: string[] = []
  const fail = (message: string) => errors.push(`cargoCompliance: ${message}`)
  if (!isRecord(value)) return ['cargoCompliance must be an object.']

  const collectionNames = ['cargo', 'containerTypes', 'adrRecords', 'handlingRequirements'] as const
  for (const name of collectionNames) {
    if (!Array.isArray(value[name])) fail(`${name} must be an array.`)
  }
  if (collectionNames.some((name) => !Array.isArray(value[name]))) return errors

  const containerTypes = value.containerTypes as unknown[]
  const adrRecords = value.adrRecords as unknown[]
  const handlingRequirements = value.handlingRequirements as unknown[]
  const cargoRecords = value.cargo as unknown[]
  const containerTypeIds = new Set<string>()
  const containerCodes = new Set<string>()
  const adrRecordIds = new Set<string>()
  const handlingRequirementIds = new Set<string>()
  const handlingCodes = new Set<string>()
  const cargoIds = new Set<string>()

  for (const entry of containerTypes) {
    if (!isRecord(entry)) {
      fail('container type entries must be objects.')
      continue
    }
    const { containerTypeId, code, category } = entry
    if (!isId(containerTypeId) || !isNonEmptyString(code) || !CODE_PATTERN.test(code) ||
      !isNonEmptyString(entry.name) || !CONTAINER_CATEGORIES.includes(category as ContainerCategory) ||
      !isPositive(entry.nominalLengthM) || !isPositive(entry.widthM) || !isPositive(entry.heightM) ||
      !isPositive(entry.maxGrossWeightKg) ||
      !['refrigerated', 'tank', 'openTop', 'flatRack', 'active'].every((key) => typeof entry[key] === 'boolean') ||
      !optionalNonNegative(entry, 'tareWeightKg') || !optionalPositive(entry, 'payloadCapacityKg') || !optionalText(entry, 'notes') ||
      entry.requiredDockCapabilityCode !== undefined &&
        (!isNonEmptyString(entry.requiredDockCapabilityCode) || !CODE_PATTERN.test(entry.requiredDockCapabilityCode)) ||
      (isNonNegative(entry.tareWeightKg) && isPositive(entry.maxGrossWeightKg) && entry.tareWeightKg >= entry.maxGrossWeightKg) ||
      (isPositive(entry.payloadCapacityKg) && isPositive(entry.maxGrossWeightKg) &&
        entry.payloadCapacityKg > entry.maxGrossWeightKg - (isNonNegative(entry.tareWeightKg) ? entry.tareWeightKg : 0))) {
      fail(`container type ${String(containerTypeId ?? '(missing ID)')} is malformed or has invalid dimensions/weights.`)
    }
    if (isId(containerTypeId)) {
      if (containerTypeIds.has(containerTypeId)) fail(`duplicate containerTypeId ${containerTypeId}.`)
      containerTypeIds.add(containerTypeId)
    }
    if (isNonEmptyString(code)) {
      const normalizedCode = code.toUpperCase()
      if (containerCodes.has(normalizedCode)) fail(`duplicate container type code ${code}.`)
      containerCodes.add(normalizedCode)
    }
  }

  for (const entry of adrRecords) {
    if (!isRecord(entry)) {
      fail('ADR entries must be objects.')
      continue
    }
    const { adrRecordId, status } = entry
    if (!isId(adrRecordId) || !ADR_STATUSES.includes(status as ADRStatus) ||
      entry.active !== undefined && typeof entry.active !== 'boolean' ||
      entry.requiredDockCapabilityCode !== undefined &&
        (!isNonEmptyString(entry.requiredDockCapabilityCode) || !CODE_PATTERN.test(entry.requiredDockCapabilityCode)) ||
      !optionalText(entry, 'unNumber') || !optionalText(entry, 'properShippingName') ||
      !optionalText(entry, 'tunnelRestrictionCode') || !optionalText(entry, 'additionalNotes') ||
      entry.unNumber !== undefined && !UN_NUMBER_PATTERN.test(String(entry.unNumber)) ||
      entry.hazardClass !== undefined && !ADR_CLASSES.includes(entry.hazardClass as ADRHazardClass) ||
      entry.packingGroup !== undefined && !PACKING_GROUPS.includes(entry.packingGroup as ADRPackingGroup) ||
      status === 'applicable' && (!UN_NUMBER_PATTERN.test(String(entry.unNumber ?? '')) ||
        !isNonEmptyString(entry.properShippingName) || !ADR_CLASSES.includes(entry.hazardClass as ADRHazardClass))) {
      fail(`ADR record ${String(adrRecordId ?? '(missing ID)')} is malformed or incomplete.`)
    }
    if (isId(adrRecordId)) {
      if (adrRecordIds.has(adrRecordId)) fail(`duplicate adrRecordId ${adrRecordId}.`)
      adrRecordIds.add(adrRecordId)
    }
  }

  if (value.adrAuditHistory !== undefined) {
    if (!Array.isArray(value.adrAuditHistory)) {
      fail('adrAuditHistory must be an array when provided.')
    } else {
      if (value.adrAuditHistory.length > 500) fail('adrAuditHistory cannot contain more than 500 events.')
      const eventIds = new Set<string>()
      const eventTypes: ADRAuditEventType[] = [
        'record-created',
        'record-activated',
        'record-deactivated',
        'adr-enabled',
        'adr-status-changed',
        'un-number-changed',
        'proper-shipping-name-changed',
        'hazard-class-changed',
        'packing-group-changed',
        'tunnel-restriction-changed',
      ]
      for (const entry of value.adrAuditHistory) {
        if (!isRecord(entry)) {
          fail('ADR audit events must be objects.')
          continue
        }
        const valid = isId(entry.eventId) && isId(entry.adrRecordId) &&
          typeof entry.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(entry.timestamp) &&
          !Number.isNaN(Date.parse(entry.timestamp)) &&
          eventTypes.includes(entry.eventType as ADRAuditEventType) &&
          optionalText(entry, 'previousValue') && optionalText(entry, 'newValue')
        if (!valid) fail(`ADR audit event ${String(entry.eventId ?? '(missing ID)')} is malformed.`)
        if (isId(entry.eventId)) {
          if (eventIds.has(entry.eventId)) fail(`duplicate ADR audit event ID ${entry.eventId}.`)
          eventIds.add(entry.eventId)
        }
      }
    }
  }

  if (value.cargoAssignmentHistory !== undefined) {
    if (!Array.isArray(value.cargoAssignmentHistory)) {
      fail('cargoAssignmentHistory must be an array when provided.')
    } else {
      if (value.cargoAssignmentHistory.length > 500) fail('cargoAssignmentHistory cannot contain more than 500 events.')
      const eventIds = new Set<string>()
      const eventTypes = [
        'cargo-assigned',
        'cargo-unassigned',
        'container-type-changed',
        'adr-information-changed',
        'handling-requirement-changed',
      ] as const
      for (const entry of value.cargoAssignmentHistory) {
        if (!isRecord(entry)) {
          fail('cargo assignment events must be objects.')
          continue
        }
        const valid = isId(entry.eventId) && isId(entry.vehicleId) && isId(entry.cargoId) &&
          typeof entry.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(entry.timestamp) &&
          !Number.isNaN(Date.parse(entry.timestamp)) &&
          eventTypes.includes(entry.type as typeof eventTypes[number]) && isNonEmptyString(entry.description)
        if (!valid) fail(`cargo assignment event ${String(entry.eventId ?? '(missing ID)')} is malformed.`)
        if (isId(entry.eventId)) {
          if (eventIds.has(entry.eventId)) fail(`duplicate cargo assignment event ID ${entry.eventId}.`)
          eventIds.add(entry.eventId)
        }
      }
    }
  }

  for (const entry of handlingRequirements) {
    if (!isRecord(entry)) {
      fail('handling requirement entries must be objects.')
      continue
    }
    const { handlingRequirementId, code } = entry
    const validAttributes = entry.attributes === undefined || isRecord(entry.attributes) &&
      Object.values(entry.attributes).every((item: unknown): item is HandlingRequirementValue =>
        typeof item === 'string' || typeof item === 'boolean' ||
        typeof item === 'number' && Number.isFinite(item))
    if (!isId(handlingRequirementId) || !isNonEmptyString(code) || !CODE_PATTERN.test(code) ||
      !isNonEmptyString(entry.name) || !HANDLING_CATEGORIES.includes(entry.category as HandlingRequirementCategory) ||
      typeof entry.active !== 'boolean' || !optionalText(entry, 'description') ||
      entry.requiredDockCapabilityCode !== undefined &&
        (!isNonEmptyString(entry.requiredDockCapabilityCode) || !CODE_PATTERN.test(entry.requiredDockCapabilityCode)) ||
      !validAttributes) {
      fail(`handling requirement ${String(handlingRequirementId ?? '(missing ID)')} is malformed.`)
    }
    if (isId(handlingRequirementId)) {
      if (handlingRequirementIds.has(handlingRequirementId)) fail(`duplicate handlingRequirementId ${handlingRequirementId}.`)
      handlingRequirementIds.add(handlingRequirementId)
    }
    if (isNonEmptyString(code)) {
      if (handlingCodes.has(code)) fail(`duplicate handling requirement code ${code}.`)
      handlingCodes.add(code)
    }
  }

  for (const entry of cargoRecords) {
    if (!isRecord(entry)) {
      fail('cargo entries must be objects.')
      continue
    }
    const { cargoId, containerTypeId, adrRecordId, handlingRequirementIds: requirementRefs, vehicleId } = entry
    if (!isId(cargoId) || !isNonEmptyString(entry.cargoType) || !isNonEmptyString(entry.description) ||
      !isPositive(entry.quantity) || !isNonEmptyString(entry.quantityUnit) ||
      !optionalNonNegative(entry, 'weightKg') || !optionalNonNegative(entry, 'volumeM3') ||
      !Array.isArray(requirementRefs) || !optionalText(entry, 'notes') ||
      ['shipmentId', 'operationId'].some((key) => entry[key] !== undefined && !isId(entry[key])) ||
      vehicleId !== undefined && !isId(vehicleId)) {
      fail(`cargo record ${String(cargoId ?? '(missing ID)')} is malformed or has invalid quantities/measurements.`)
    }
    if (isId(cargoId)) {
      if (cargoIds.has(cargoId)) fail(`duplicate cargoId ${cargoId}.`)
      cargoIds.add(cargoId)
    }
    if (containerTypeId !== undefined && (!isId(containerTypeId) || !containerTypeIds.has(containerTypeId))) {
      fail(`cargo ${String(cargoId)} references unknown containerTypeId ${String(containerTypeId)}.`)
    }
    if (adrRecordId !== undefined && (!isId(adrRecordId) || !adrRecordIds.has(adrRecordId))) {
      fail(`cargo ${String(cargoId)} references unknown adrRecordId ${String(adrRecordId)}.`)
    }
    if (vehicleId !== undefined && (!isId(vehicleId) || !vehicleIds.has(vehicleId))) {
      fail(`cargo ${String(cargoId)} references unknown vehicleId ${String(vehicleId)}.`)
    }
    if (Array.isArray(requirementRefs)) {
      const seen = new Set<string>()
      for (const reference of requirementRefs) {
        if (!isId(reference) || !handlingRequirementIds.has(reference)) {
          fail(`cargo ${String(cargoId)} references unknown handlingRequirementId ${String(reference)}.`)
        } else if (seen.has(reference)) {
          fail(`cargo ${String(cargoId)} contains duplicate handlingRequirementId ${reference}.`)
        } else {
          seen.add(reference)
        }
      }
    }
  }

  return errors
}
