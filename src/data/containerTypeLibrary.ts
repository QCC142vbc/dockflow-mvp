import type { CargoComplianceData, ContainerTypeDefinition } from './datasetTypes'
import { validateCargoComplianceData } from './cargoComplianceValidation.ts'

export function duplicateContainerType(
  source: ContainerTypeDefinition,
  existing: readonly ContainerTypeDefinition[],
): ContainerTypeDefinition {
  const ids = new Set(existing.map((item) => item.containerTypeId))
  const codes = new Set(existing.map((item) => item.code.toUpperCase()))
  const baseCode = source.code.slice(0, 25)
  const baseId = source.containerTypeId.slice(0, 80)
  let suffix = 1
  let containerTypeId = `${baseId}-copy-${suffix}`
  let code = `${baseCode}-COPY-${suffix}`
  while (ids.has(containerTypeId) || codes.has(code.toUpperCase())) {
    suffix += 1
    containerTypeId = `${baseId}-copy-${suffix}`
    code = `${baseCode}-COPY-${suffix}`
  }
  return {
    ...source,
    containerTypeId,
    code,
    name: `${source.name} (Copy)`,
    active: true,
    notes: source.notes ?? '',
  }
}

export function upsertContainerType(
  data: CargoComplianceData,
  containerType: ContainerTypeDefinition,
  vehicleIds: ReadonlySet<string> = new Set(),
): CargoComplianceData {
  const exists = data.containerTypes.some((item) => item.containerTypeId === containerType.containerTypeId)
  const containerTypes = exists
    ? data.containerTypes.map((item) => item.containerTypeId === containerType.containerTypeId ? containerType : item)
    : [...data.containerTypes, containerType]
  const next = { ...data, containerTypes }
  const errors = validateCargoComplianceData(next, vehicleIds)
  if (errors.length) throw new Error(errors[0].replace(/^cargoCompliance:\s*/, ''))
  return next
}

export function getContainerTypeReferences(data: CargoComplianceData, containerTypeId: string) {
  return data.cargo.filter((cargo) => cargo.containerTypeId === containerTypeId)
}

export function deleteContainerType(data: CargoComplianceData, containerTypeId: string): CargoComplianceData {
  const references = getContainerTypeReferences(data, containerTypeId)
  if (references.length) {
    throw new Error(`Cannot delete this container type while ${references.length} cargo record${references.length === 1 ? '' : 's'} reference it. Deactivate it instead.`)
  }
  return {
    ...data,
    containerTypes: data.containerTypes.filter((item) => item.containerTypeId !== containerTypeId),
  }
}

export function setContainerTypeActive(
  data: CargoComplianceData,
  containerTypeId: string,
  active: boolean,
): CargoComplianceData {
  return {
    ...data,
    containerTypes: data.containerTypes.map((item) =>
      item.containerTypeId === containerTypeId ? { ...item, active } : item),
  }
}
