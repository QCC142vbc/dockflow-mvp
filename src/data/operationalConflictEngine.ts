import type { CargoRecord, ContainerTypeDefinition, OperationsDataset } from './datasetTypes'

export type OperationalConflictSeverity = 'blocking' | 'warning' | 'info'
export type OperationalConflictType =
  | 'ADR_REFERENCE_MISSING'
  | 'ADR_DETAILS_MISSING'
  | 'ADR_STATUS_UNKNOWN'
  | 'INVALID_CONTAINER_REFERENCE'
  | 'INACTIVE_CONTAINER_ASSIGNED'
  | 'CONTAINER_PAYLOAD_EXCEEDED'
  | 'CONTAINER_CAPACITY_UNAVAILABLE'
  | 'INVALID_HANDLING_REFERENCE'
  | 'INACTIVE_HANDLING_REQUIREMENT'
  | 'INACTIVE_ADR_RECORD'
  | 'INVALID_VEHICLE_REFERENCE'
  | 'MULTIPLE_DOCK_ASSIGNMENTS'
  | 'VEHICLE_QUEUED_AND_DOCKED'
  | 'DOCK_UNAVAILABLE_WHILE_OCCUPIED'
  | 'DOCK_VEHICLE_REFERENCE_INVALID'
  | 'OPERATION_NOT_FOUND'

export type OperationalConflictEntity = 'cargo' | 'container' | 'adr' | 'handling-requirement' | 'vehicle' | 'dock' | 'operation'

export interface OperationalConflictRelatedRecord {
  entity: OperationalConflictEntity
  entityId: string
}

export interface OperationalConflict {
  conflictId: string
  type: OperationalConflictType
  severity: OperationalConflictSeverity
  entity: OperationalConflictEntity
  entityId: string
  message: string
  evidence: Record<string, string | number | boolean | null>
  blocking: boolean
  relatedRecords: OperationalConflictRelatedRecord[]
}

export interface OperationalValidationResult {
  valid: boolean
  conflicts: OperationalConflict[]
  blockingConflicts: OperationalConflict[]
  warnings: OperationalConflict[]
  informational: OperationalConflict[]
}

function conflict(
  type: OperationalConflictType,
  severity: OperationalConflictSeverity,
  entity: OperationalConflictEntity,
  entityId: string,
  message: string,
  evidence: OperationalConflict['evidence'],
  relatedRecords: OperationalConflictRelatedRecord[],
): OperationalConflict {
  return {
    conflictId: `ops-${type.toLowerCase()}-${String(evidence.cargoId ?? entityId)}`.slice(0, 100),
    type,
    severity,
    entity,
    entityId,
    message,
    evidence,
    blocking: severity === 'blocking',
    relatedRecords,
  }
}

function relatedForCargo(cargo: CargoRecord): OperationalConflictRelatedRecord[] {
  return [
    { entity: 'cargo', entityId: cargo.cargoId },
    ...(cargo.vehicleId ? [{ entity: 'vehicle' as const, entityId: cargo.vehicleId }] : []),
    ...(cargo.containerTypeId ? [{ entity: 'container' as const, entityId: cargo.containerTypeId }] : []),
    ...(cargo.adrRecordId ? [{ entity: 'adr' as const, entityId: cargo.adrRecordId }] : []),
    ...(cargo.operationId ? [{ entity: 'operation' as const, entityId: cargo.operationId }] : []),
    ...cargo.handlingRequirementIds.map((entityId) => ({ entity: 'handling-requirement' as const, entityId })),
  ]
}

function payloadCapacity(container: ContainerTypeDefinition): { value: number; source: string } | undefined {
  const grossLessTare = container.tareWeightKg === undefined
    ? undefined
    : container.maxGrossWeightKg - container.tareWeightKg
  if (container.payloadCapacityKg !== undefined && grossLessTare !== undefined) {
    return {
      value: Math.min(container.payloadCapacityKg, grossLessTare),
      source: 'lowest-of-payloadCapacityKg-and-maxGrossWeightKg-minus-tareWeightKg',
    }
  }
  if (container.payloadCapacityKg !== undefined) {
    return { value: container.payloadCapacityKg, source: 'payloadCapacityKg' }
  }
  return grossLessTare === undefined
    ? undefined
    : { value: grossLessTare, source: 'maxGrossWeightKg-minus-tareWeightKg' }
}

function validateCargoRecord(
  dataset: OperationsDataset,
  cargo: CargoRecord,
): OperationalConflict[] {
  const cargoCompliance = dataset.cargoCompliance
  if (!cargoCompliance) return []
  const relatedRecords = relatedForCargo(cargo)
  const conflicts: OperationalConflict[] = []

  if (cargo.vehicleId && !dataset.vehicles.some((vehicle) => vehicle.vehicleId === cargo.vehicleId)) {
    conflicts.push(conflict(
      'INVALID_VEHICLE_REFERENCE',
      'blocking',
      'vehicle',
      cargo.vehicleId,
      `Cargo ${cargo.cargoId} references vehicle ${cargo.vehicleId}, which is not present in this dataset.`,
      { cargoId: cargo.cargoId, vehicleId: cargo.vehicleId },
      relatedRecords,
    ))
  }

  if (cargo.containerTypeId) {
    const container = cargoCompliance.containerTypes.find((item) => item.containerTypeId === cargo.containerTypeId)
    if (!container) {
      conflicts.push(conflict(
        'INVALID_CONTAINER_REFERENCE',
        'blocking',
        'cargo',
        cargo.cargoId,
        `Cargo ${cargo.cargoId} references container type ${cargo.containerTypeId}, which does not exist.`,
        { cargoId: cargo.cargoId, containerTypeId: cargo.containerTypeId },
        relatedRecords,
      ))
    } else {
      if (!container.active) {
        conflicts.push(conflict(
          'INACTIVE_CONTAINER_ASSIGNED',
          'warning',
          'container',
          container.containerTypeId,
          `Cargo ${cargo.cargoId} is assigned to inactive container type ${container.name} (${container.code}).`,
          { cargoId: cargo.cargoId, containerTypeId: container.containerTypeId, active: false },
          relatedRecords,
        ))
      }
      if (cargo.weightKg !== undefined) {
        const capacityKg = payloadCapacity(container)
        if (capacityKg === undefined) {
          conflicts.push(conflict(
            'CONTAINER_CAPACITY_UNAVAILABLE',
            'info',
            'container',
            container.containerTypeId,
            `Cargo ${cargo.cargoId} weighs ${cargo.weightKg} kg, but ${container.name} has no configured payload capacity or tare weight for a payload comparison.`,
            { cargoId: cargo.cargoId, cargoWeightKg: cargo.weightKg, payloadCapacityKg: null },
            relatedRecords,
          ))
        } else if (cargo.weightKg > capacityKg.value) {
          conflicts.push(conflict(
            'CONTAINER_PAYLOAD_EXCEEDED',
            'blocking',
            'cargo',
            cargo.cargoId,
            `Cargo payload ${cargo.weightKg.toLocaleString('en-US')} kg exceeds the ${container.name} payload limit of ${capacityKg.value.toLocaleString('en-US')} kg.`,
            {
              cargoId: cargo.cargoId,
              cargoWeightKg: cargo.weightKg,
              payloadCapacityKg: capacityKg.value,
              capacitySource: capacityKg.source,
              maxGrossWeightKg: container.maxGrossWeightKg,
              tareWeightKg: container.tareWeightKg ?? null,
              containerTypeId: container.containerTypeId,
            },
            relatedRecords,
          ))
        }
      }
    }
  }

  if (cargo.adrRecordId) {
    const adr = cargoCompliance.adrRecords.find((item) => item.adrRecordId === cargo.adrRecordId)
    if (!adr) {
      conflicts.push(conflict(
        'ADR_REFERENCE_MISSING',
        'blocking',
        'cargo',
        cargo.cargoId,
        `Cargo ${cargo.cargoId} references ADR record ${cargo.adrRecordId}, which does not exist.`,
        { cargoId: cargo.cargoId, adrRecordId: cargo.adrRecordId },
        relatedRecords,
      ))
    } else {
      if (adr.active === false) {
        conflicts.push(conflict(
          'INACTIVE_ADR_RECORD',
          'warning',
          'adr',
          adr.adrRecordId,
          `Cargo ${cargo.cargoId} references inactive ADR record ${adr.adrRecordId}.`,
          { cargoId: cargo.cargoId, adrRecordId: adr.adrRecordId, active: false },
          relatedRecords,
        ))
      }
      if (adr.status === 'unknown') {
        conflicts.push(conflict(
          'ADR_STATUS_UNKNOWN',
          'warning',
          'adr',
          adr.adrRecordId,
          `ADR applicability for cargo ${cargo.cargoId} is marked unknown; the dataset does not establish whether dangerous-goods details apply.`,
          { cargoId: cargo.cargoId, adrRecordId: adr.adrRecordId, status: adr.status },
          relatedRecords,
        ))
      } else if (adr.status === 'applicable') {
        const missingFields = [
          !adr.unNumber ? 'unNumber' : null,
          !adr.properShippingName ? 'properShippingName' : null,
          !adr.hazardClass ? 'hazardClass' : null,
        ].filter((field): field is string => field !== null)
        if (missingFields.length) {
          conflicts.push(conflict(
            'ADR_DETAILS_MISSING',
            'blocking',
            'adr',
            adr.adrRecordId,
            `Applicable ADR record ${adr.adrRecordId} linked to cargo ${cargo.cargoId} is missing required fields: ${missingFields.join(', ')}.`,
            { cargoId: cargo.cargoId, adrRecordId: adr.adrRecordId, missingFields: missingFields.join(', ') },
            relatedRecords,
          ))
        }
      }
    }
  }

  for (const requirementId of cargo.handlingRequirementIds) {
    const requirement = cargoCompliance.handlingRequirements.find((item) => item.handlingRequirementId === requirementId)
    if (!requirement) {
      conflicts.push(conflict(
        'INVALID_HANDLING_REFERENCE',
        'blocking',
        'cargo',
        cargo.cargoId,
        `Cargo ${cargo.cargoId} references handling requirement ${requirementId}, which does not exist.`,
        { cargoId: cargo.cargoId, handlingRequirementId: requirementId },
        relatedRecords,
      ))
    } else if (!requirement.active) {
      conflicts.push(conflict(
        'INACTIVE_HANDLING_REQUIREMENT',
        'warning',
        'handling-requirement',
        requirement.handlingRequirementId,
        `Cargo ${cargo.cargoId} references inactive handling requirement ${requirement.name}.`,
        { cargoId: cargo.cargoId, handlingRequirementId: requirement.handlingRequirementId, active: false },
        relatedRecords,
      ))
    }
  }

  return conflicts
}

function validateDockAssignments(dataset: OperationsDataset, vehicleId: string): OperationalConflict[] {
  const assignedDocks = dataset.docks.filter((dock) => dock.vehicleId === vehicleId)
  const conflicts: OperationalConflict[] = []
  if (assignedDocks.length > 1) {
    conflicts.push(conflict(
      'MULTIPLE_DOCK_ASSIGNMENTS',
      'blocking',
      'vehicle',
      vehicleId,
      `Vehicle ${vehicleId} is assigned to ${assignedDocks.length} docks (${assignedDocks.map((dock) => dock.dockId).join(', ')}). A vehicle can be assigned to only one dock in the current dataset model.`,
      { vehicleId, dockIds: assignedDocks.map((dock) => dock.dockId).join(', '), assignmentCount: assignedDocks.length },
      [
        { entity: 'vehicle', entityId: vehicleId },
        ...assignedDocks.map((dock) => ({ entity: 'dock' as const, entityId: dock.dockId })),
      ],
    ))
  }
  const queued = dataset.queue.some((item) => item.vehicleId === vehicleId)
  if (queued && assignedDocks.length) {
    conflicts.push(conflict(
      'VEHICLE_QUEUED_AND_DOCKED',
      'blocking',
      'vehicle',
      vehicleId,
      `Vehicle ${vehicleId} appears in the waiting queue and is assigned to Dock ${assignedDocks[0].dockId}; the dataset requires a vehicle to be queued or dock-assigned, not both.`,
      { vehicleId, queueRecordIds: dataset.queue.filter((item) => item.vehicleId === vehicleId).map((item) => item.queueId).join(', '), dockIds: assignedDocks.map((dock) => dock.dockId).join(', ') },
      [
        { entity: 'vehicle', entityId: vehicleId },
        ...assignedDocks.map((dock) => ({ entity: 'dock' as const, entityId: dock.dockId })),
      ],
    ))
  }
  for (const dock of assignedDocks) {
    if (dock.status === 'maintenance' || dock.status === 'cleaning') {
      conflicts.push(conflict(
        'DOCK_UNAVAILABLE_WHILE_OCCUPIED',
        'warning',
        'dock',
        dock.dockId,
        `Vehicle ${vehicleId} is assigned to Dock ${dock.dockId}, whose current status is ${dock.state}.`,
        { vehicleId, dockId: dock.dockId, dockStatus: dock.status, dockState: dock.state },
        [{ entity: 'vehicle', entityId: vehicleId }, { entity: 'dock', entityId: dock.dockId }],
      ))
    }
  }
  return conflicts
}

function summarize(conflicts: OperationalConflict[]): OperationalValidationResult {
  const unique = [...new Map(conflicts.map((item) => [item.conflictId, item])).values()]
  const blockingConflicts = unique.filter((item) => item.blocking)
  return {
    valid: blockingConflicts.length === 0,
    conflicts: unique,
    blockingConflicts,
    warnings: unique.filter((item) => item.severity === 'warning'),
    informational: unique.filter((item) => item.severity === 'info'),
  }
}

export function validateVehicle(dataset: OperationsDataset, vehicleId: string): OperationalValidationResult {
  if (!dataset.vehicles.some((vehicle) => vehicle.vehicleId === vehicleId)) {
    return summarize([conflict(
      'INVALID_VEHICLE_REFERENCE',
      'blocking',
      'vehicle',
      vehicleId,
      `Vehicle ${vehicleId} does not exist in this dataset.`,
      { vehicleId },
      [{ entity: 'vehicle', entityId: vehicleId }],
    )])
  }
  const cargoRecords = dataset.cargoCompliance?.cargo.filter((cargo) => cargo.vehicleId === vehicleId) ?? []
  return summarize([
    ...cargoRecords.flatMap((cargo) => validateCargoRecord(dataset, cargo)),
    ...validateDockAssignments(dataset, vehicleId),
  ])
}

export function validateOperation(dataset: OperationsDataset, operationId: string): OperationalValidationResult {
  const cargoRecords = dataset.cargoCompliance?.cargo.filter((cargo) => cargo.operationId === operationId) ?? []
  if (!cargoRecords.length) {
    return summarize([conflict(
      'OPERATION_NOT_FOUND',
      'info',
      'operation',
      operationId,
      `No cargo record references operation ${operationId}; this dataset does not define a separate operation record to validate.`,
      { operationId, operationRecordsAvailable: false },
      [{ entity: 'operation', entityId: operationId }],
    )])
  }
  const conflicts = cargoRecords.flatMap((cargo) => [
    ...validateCargoRecord(dataset, cargo),
    ...(cargo.vehicleId ? validateDockAssignments(dataset, cargo.vehicleId) : []),
  ])
  return summarize(conflicts)
}

export function validateAllOperationalCargo(dataset: OperationsDataset): OperationalConflict[] {
  const conflicts = (dataset.cargoCompliance?.cargo ?? []).flatMap((cargo) => validateCargoRecord(dataset, cargo))
  const vehicleIds = new Set(dataset.vehicles.map((vehicle) => vehicle.vehicleId))
  for (const vehicleId of vehicleIds) conflicts.push(...validateDockAssignments(dataset, vehicleId))
  for (const dock of dataset.docks) {
    if (dock.vehicleId && !dataset.vehicles.some((vehicle) => vehicle.vehicleId === dock.vehicleId)) {
      conflicts.push(conflict(
        'DOCK_VEHICLE_REFERENCE_INVALID',
        'blocking',
        'dock',
        dock.dockId,
        `Dock ${dock.dockId} references vehicle ${dock.vehicleId}, which is not present in this dataset.`,
        { dockId: dock.dockId, vehicleId: dock.vehicleId },
        [{ entity: 'dock', entityId: dock.dockId }, { entity: 'vehicle', entityId: dock.vehicleId }],
      ))
    }
  }
  return summarize(conflicts).conflicts
}
