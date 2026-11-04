import { validateOperationsDataset } from './legacyDatasetValidation.ts'

export function validateDataset(dataset) {
  const result = validateOperationsDataset(dataset)
  return { valid: result.valid, errors: result.errors }
}
