import type { CargoAssignmentEvent, CargoComplianceData, CargoRecord, OperationsDataset } from './datasetTypes'
import { recalculateDatasetIntegrity, validateOperationsDataset } from './datasetFactory.ts'

const CARGO_ASSIGNMENT_HISTORY_LIMIT = 500

export interface OperationalCargoReferences {
  containerTypeId?: string
  adrRecordId?: string
  handlingRequirementIds: string[]
}

export function createCargoAssignmentEvents(
  data: CargoComplianceData,
  previous: CargoComplianceData['cargo'][number] | undefined,
  next: CargoComplianceData['cargo'][number],
  timestamp: string,
): CargoAssignmentEvent[] {
  if (!previous?.vehicleId && !next.vehicleId) return []
  const events: CargoAssignmentEvent[] = []
  const append = (type: CargoAssignmentEvent['type'], description: string) => {
    const sequence = (data.cargoAssignmentHistory?.length ?? 0) + events.length
    events.push({
      eventId: `cargo-${Date.parse(timestamp).toString(36)}-${sequence.toString(36)}-${next.cargoId.slice(-36)}`,
      timestamp,
      type,
      vehicleId: next.vehicleId ?? previous?.vehicleId ?? '',
      cargoId: next.cargoId,
      description,
    })
  }

  if (!previous?.vehicleId && next.vehicleId) {
    append('cargo-assigned', `Cargo ${next.cargoId} assigned to vehicle ${next.vehicleId}.`)
  } else if (previous?.vehicleId && !next.vehicleId) {
    append('cargo-unassigned', `Cargo ${next.cargoId} unassigned from vehicle ${previous.vehicleId}.`)
  } else if (previous?.vehicleId && next.vehicleId && previous.vehicleId !== next.vehicleId) {
    append('cargo-unassigned', `Cargo ${next.cargoId} unassigned from vehicle ${previous.vehicleId}.`)
    append('cargo-assigned', `Cargo ${next.cargoId} assigned to vehicle ${next.vehicleId}.`)
  }

  if (previous?.containerTypeId !== next.containerTypeId) {
    append('container-type-changed', `Container type for cargo ${next.cargoId} changed from ${previous?.containerTypeId ?? 'not specified'} to ${next.containerTypeId ?? 'not specified'}.`)
  }
  if (previous?.adrRecordId !== next.adrRecordId) {
    append('adr-information-changed', `ADR reference for cargo ${next.cargoId} changed from ${previous?.adrRecordId ?? 'not specified'} to ${next.adrRecordId ?? 'not specified'}.`)
  }
  const previousRequirements = new Set(previous?.handlingRequirementIds ?? [])
  const nextRequirements = new Set(next.handlingRequirementIds)
  const requirementsChanged = previousRequirements.size !== nextRequirements.size ||
    [...previousRequirements].some((requirementId) => !nextRequirements.has(requirementId))
  if (requirementsChanged) {
    append('handling-requirement-changed', `Handling requirement references for cargo ${next.cargoId} were updated.`)
  }
  return events
}

function withCargoAssignmentHistory(
  data: CargoComplianceData,
  events: readonly CargoAssignmentEvent[],
): CargoComplianceData {
  if (!events.length) return data
  return {
    ...data,
    cargoAssignmentHistory: [...(data.cargoAssignmentHistory ?? []), ...events].slice(-CARGO_ASSIGNMENT_HISTORY_LIMIT),
  }
}

export function appendCargoAssignmentChanges(
  data: CargoComplianceData,
  previous: CargoComplianceData['cargo'][number] | undefined,
  next: CargoComplianceData['cargo'][number],
  timestamp = new Date().toISOString(),
): CargoComplianceData {
  return withCargoAssignmentHistory(data, createCargoAssignmentEvents(data, previous, next, timestamp))
}

export function validateOperationalCargoReferenceActivity(
  data: CargoComplianceData,
  previous: Pick<CargoRecord, 'vehicleId' | 'containerTypeId' | 'adrRecordId' | 'handlingRequirementIds'>,
  references: OperationalCargoReferences,
  newAssignment: boolean,
): void {
  if ((newAssignment || references.containerTypeId !== previous.containerTypeId) && references.containerTypeId) {
    const container = data.containerTypes.find((item) => item.containerTypeId === references.containerTypeId)
    if (!container) throw new Error(`Container type ${references.containerTypeId} does not exist.`)
    if (!container.active) throw new Error(`Container type ${container.name} is inactive.`)
  }
  if ((newAssignment || references.adrRecordId !== previous.adrRecordId) && references.adrRecordId) {
    const adr = data.adrRecords.find((item) => item.adrRecordId === references.adrRecordId)
    if (!adr) throw new Error(`ADR record ${references.adrRecordId} does not exist.`)
    if (adr.active === false) throw new Error(`ADR record ${adr.adrRecordId} is inactive.`)
  }
  const previousRequirements = new Set(previous.handlingRequirementIds)
  for (const requirementId of references.handlingRequirementIds) {
    if (previousRequirements.has(requirementId) && !newAssignment) continue
    const requirement = data.handlingRequirements.find((item) => item.handlingRequirementId === requirementId)
    if (!requirement) throw new Error(`Handling requirement ${requirementId} does not exist.`)
    if (!requirement.active) throw new Error(`Handling requirement ${requirement.name} is inactive.`)
  }
}

export function saveOperationalCargoReferences(
  dataset: OperationsDataset,
  vehicleId: string,
  cargoId: string,
  references: OperationalCargoReferences,
  timestamp = new Date().toISOString(),
): { dataset: OperationsDataset; events: CargoAssignmentEvent[] } {
  const data = dataset.cargoCompliance
  if (!data) throw new Error('This dataset has no Cargo & Compliance catalog. Open Cargo & Compliance to configure it first.')
  if (!references || !Array.isArray(references.handlingRequirementIds) ||
    references.handlingRequirementIds.some((id) => typeof id !== 'string') ||
    new Set(references.handlingRequirementIds).size !== references.handlingRequirementIds.length ||
    references.containerTypeId !== undefined && typeof references.containerTypeId !== 'string' ||
    references.adrRecordId !== undefined && typeof references.adrRecordId !== 'string') {
    throw new Error('Cargo references must contain valid IDs and a unique handling-requirement list.')
  }
  if (Number.isNaN(Date.parse(timestamp)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) {
    throw new Error('Cargo assignment timestamp must be a valid UTC ISO timestamp.')
  }
  if (!dataset.vehicles.some((vehicle) => vehicle.vehicleId === vehicleId)) {
    throw new Error(`Vehicle ${vehicleId} does not exist in this dataset.`)
  }
  const previous = data.cargo.find((item) => item.cargoId === cargoId)
  if (!previous) throw new Error(`Cargo ${cargoId} does not exist in this dataset.`)
  if (previous.vehicleId && previous.vehicleId !== vehicleId) {
    throw new Error(`Cargo ${cargoId} is already assigned to vehicle ${previous.vehicleId}.`)
  }
  validateOperationalCargoReferenceActivity(data, previous, references, !previous.vehicleId)

  const nextCargo = {
    ...previous,
    vehicleId,
    ...(references.containerTypeId ? { containerTypeId: references.containerTypeId } : {}),
    ...(!references.containerTypeId ? { containerTypeId: undefined } : {}),
    ...(references.adrRecordId ? { adrRecordId: references.adrRecordId } : {}),
    ...(!references.adrRecordId ? { adrRecordId: undefined } : {}),
    handlingRequirementIds: [...references.handlingRequirementIds],
  }
  if (!references.containerTypeId) delete nextCargo.containerTypeId
  if (!references.adrRecordId) delete nextCargo.adrRecordId
  const events = createCargoAssignmentEvents(data, previous, nextCargo, timestamp)
  const nextData = withCargoAssignmentHistory({
    ...data,
    cargo: data.cargo.map((item) => item.cargoId === cargoId ? nextCargo : item),
  }, events)
  const nextDataset = recalculateDatasetIntegrity({ ...dataset, cargoCompliance: nextData })
  const validation = validateOperationsDataset(nextDataset)
  if (!validation.valid) throw new Error(`Cargo assignment is invalid: ${validation.errors.join(' ')}`)
  return { dataset: nextDataset, events }
}

export function unassignOperationalCargo(
  dataset: OperationsDataset,
  vehicleId: string,
  cargoId: string,
  timestamp = new Date().toISOString(),
): { dataset: OperationsDataset; events: CargoAssignmentEvent[] } {
  const data = dataset.cargoCompliance
  if (!data) throw new Error('This dataset has no Cargo & Compliance catalog.')
  const previous = data.cargo.find((item) => item.cargoId === cargoId)
  if (!previous) throw new Error(`Cargo ${cargoId} does not exist in this dataset.`)
  if (previous.vehicleId !== vehicleId) throw new Error(`Cargo ${cargoId} is not assigned to vehicle ${vehicleId}.`)

  const nextCargo = { ...previous }
  delete nextCargo.vehicleId
  const events = createCargoAssignmentEvents(data, previous, nextCargo, timestamp)
  const nextData = withCargoAssignmentHistory({
    ...data,
    cargo: data.cargo.map((item) => item.cargoId === cargoId ? nextCargo : item),
  }, events)
  const nextDataset = recalculateDatasetIntegrity({ ...dataset, cargoCompliance: nextData })
  const validation = validateOperationsDataset(nextDataset)
  if (!validation.valid) throw new Error(`Cargo assignment is invalid: ${validation.errors.join(' ')}`)
  return { dataset: nextDataset, events }
}
