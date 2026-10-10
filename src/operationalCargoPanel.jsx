import React, { useMemo, useState } from 'react'
import { Box, FileWarning, Package, Pencil, Plus, ShieldCheck, X } from 'lucide-react'
import { saveOperationalCargoReferences, unassignOperationalCargo } from './data/operationalCargo.ts'

const displayDimension = (value) => value === undefined ? null : `${value} m`
const activeAdr = (record) => record.active !== false

function CargoReferenceEditor({ dataset, vehicleId, initialCargo, onSave, onCancel }) {
  const data = dataset.cargoCompliance
  const choices = useMemo(() => data.cargo.filter((item) => !item.vehicleId || item.vehicleId === vehicleId), [data.cargo, vehicleId])
  const [cargoId, setCargoId] = useState(initialCargo?.cargoId ?? '')
  const selected = data.cargo.find((item) => item.cargoId === cargoId)
  const [containerTypeId, setContainerTypeId] = useState(initialCargo?.containerTypeId ?? '')
  const [adrRecordId, setAdrRecordId] = useState(initialCargo?.adrRecordId ?? '')
  const [handlingRequirementIds, setHandlingRequirementIds] = useState(initialCargo?.handlingRequirementIds ?? [])
  const [error, setError] = useState('')

  const selectCargo = (nextCargoId) => {
    const nextCargo = data.cargo.find((item) => item.cargoId === nextCargoId)
    setCargoId(nextCargoId)
    setContainerTypeId(nextCargo?.containerTypeId ?? '')
    setAdrRecordId(nextCargo?.adrRecordId ?? '')
    setHandlingRequirementIds(nextCargo?.handlingRequirementIds ?? [])
    setError('')
  }
  const updateRequirement = (requirementId, checked) => {
    setHandlingRequirementIds((current) => checked
      ? [...current, requirementId]
      : current.filter((id) => id !== requirementId))
  }
  const optionIsActive = (item, id, selectedId) => item.active || id === selectedId

  const submit = (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = saveOperationalCargoReferences(dataset, vehicleId, cargoId, {
        containerTypeId: containerTypeId || undefined,
        adrRecordId: adrRecordId || undefined,
        handlingRequirementIds,
      })
      onSave(result.dataset)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Cargo references could not be saved.')
    }
  }

  return <div className="op-cargo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="op-cargo-dialog" role="dialog" aria-modal="true" aria-labelledby="op-cargo-form-title" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
      <button type="button" className="op-cargo-close" onClick={onCancel} aria-label="Close cargo assignment form"><X size={16} /></button>
      <span className="dispatch-eyebrow">Vehicle cargo references</span>
      <h3 id="op-cargo-form-title">{initialCargo ? 'Edit assigned cargo' : 'Assign cargo to vehicle'}</h3>
      <form onSubmit={submit}>
        <label className="op-cargo-field"><span>Cargo record</span><select autoFocus value={cargoId} required disabled={Boolean(initialCargo)} onChange={(event) => selectCargo(event.target.value)}>
          <option value="">Select cargo</option>
          {choices.map((item) => <option key={item.cargoId} value={item.cargoId}>{item.description} · {item.cargoId}</option>)}
        </select></label>
        {selected && <>
          <div className="op-cargo-current-summary"><strong>{selected.cargoType}</strong><span>{selected.weightKg === undefined ? 'Weight not recorded' : `${selected.weightKg.toLocaleString()} kg`}{selected.quantityUnit ? ` · ${selected.quantity} ${selected.quantityUnit}` : ''}</span></div>
          <label className="op-cargo-field"><span>Container type</span><select value={containerTypeId} onChange={(event) => setContainerTypeId(event.target.value)}>
            <option value="">Not specified</option>
            {data.containerTypes.filter((item) => optionIsActive(item, item.containerTypeId, selected.containerTypeId)).map((item) => <option key={item.containerTypeId} value={item.containerTypeId}>{item.name} · {item.code}</option>)}
          </select></label>
          <label className="op-cargo-field"><span>ADR information</span><select value={adrRecordId} onChange={(event) => setAdrRecordId(event.target.value)}>
            <option value="">Not specified</option>
            {data.adrRecords.filter((item) => activeAdr(item) || item.adrRecordId === selected.adrRecordId).map((item) => <option key={item.adrRecordId} value={item.adrRecordId}>{item.status === 'applicable' ? `${item.unNumber ?? 'UN not recorded'} · ${item.properShippingName ?? 'Name not recorded'}` : `ADR ${item.status}`} · ${item.adrRecordId}</option>)}
          </select></label>
          <fieldset className="op-cargo-requirements"><legend>Handling requirements</legend>
            {data.handlingRequirements.filter((item) => item.active || selected.handlingRequirementIds.includes(item.handlingRequirementId)).map((item) => <label key={item.handlingRequirementId}><input type="checkbox" checked={handlingRequirementIds.includes(item.handlingRequirementId)} onChange={(event) => updateRequirement(item.handlingRequirementId, event.target.checked)} /><span>{item.name}</span></label>)}
            {!data.handlingRequirements.some((item) => item.active || selected.handlingRequirementIds.includes(item.handlingRequirementId)) && <small>No handling requirements configured.</small>}
          </fieldset>
        </>}
        {error && <p className="op-cargo-error" role="alert">{error}</p>}
        <div className="op-cargo-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="dispatch-action-primary" disabled={!selected}>{initialCargo ? 'Save references' : 'Assign cargo'}</button></div>
      </form>
    </section>
  </div>
}

function ContainerDetails({ container }) {
  if (!container) return <span>Not specified</span>
  const dimensions = [container.nominalLengthM, container.widthM, container.heightM]
    .map(displayDimension).filter(Boolean).join(' × ')
  const capabilities = [
    container.refrigerated && 'Refrigerated',
    container.tank && 'Tank',
    container.openTop && 'Open top',
    container.flatRack && 'Flat rack',
  ].filter(Boolean)
  return <span>{container.name}{dimensions ? ` · ${dimensions}` : ''}{container.maxGrossWeightKg !== undefined ? ` · ${container.maxGrossWeightKg.toLocaleString()} kg max gross` : ''}{container.payloadCapacityKg !== undefined ? ` · ${container.payloadCapacityKg.toLocaleString()} kg payload` : ''}{capabilities.length ? ` · ${capabilities.join(', ')}` : ''}</span>
}

function AdrDetails({ adr }) {
  if (!adr) return <span>None recorded</span>
  if (adr.status !== 'applicable') return <span>ADR {adr.status}</span>
  return <span className="op-cargo-adr-value">
    <strong>{adr.unNumber ?? 'UN number not recorded'}</strong>
    {adr.properShippingName && <span>{adr.properShippingName}</span>}
    {adr.hazardClass && <span>Class {adr.hazardClass}</span>}
    {adr.packingGroup && <span>Packing Group {adr.packingGroup}</span>}
    {adr.tunnelRestrictionCode && <span>Tunnel {adr.tunnelRestrictionCode}</span>}
    {adr.additionalNotes && <span>{adr.additionalNotes}</span>}
  </span>
}

export default function OperationalCargoPanel({ dataset, vehicleId, onSave, onOpenCargo }) {
  const [editingCargo, setEditingCargo] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [error, setError] = useState('')
  const data = dataset.cargoCompliance
  const assignedCargo = data?.cargo.filter((item) => item.vehicleId === vehicleId) ?? []
  const unassignedCargo = data?.cargo.filter((item) => !item.vehicleId) ?? []

  const save = (nextDataset) => {
    try {
      onSave(nextDataset)
      setEditorOpen(false)
      setEditingCargo(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Cargo assignment could not be saved.')
      throw saveError
    }
  }

  const unassign = (cargoId) => {
    setError('')
    try {
      const result = unassignOperationalCargo(dataset, vehicleId, cargoId)
      save(result.dataset)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Cargo could not be unassigned.')
    }
  }

  return <section className="operational-cargo" aria-labelledby="operational-cargo-title">
    <div className="operational-cargo-heading">
      <div><span className="dispatch-eyebrow">Operational data</span><h4 id="operational-cargo-title"><Package size={14} /> Cargo &amp; Compliance</h4></div>
      {data && <button type="button" onClick={() => { setEditingCargo(null); setEditorOpen(true); setError('') }} disabled={!unassignedCargo.length}><Plus size={13} />Assign cargo</button>}
    </div>
    {!data
      ? <div className="operational-cargo-empty"><span>No Cargo &amp; Compliance data is configured for this dataset.</span><button type="button" onClick={onOpenCargo}>Open Cargo &amp; Compliance</button></div>
      : assignedCargo.length === 0
        ? <div className="operational-cargo-empty"><span>No cargo records are assigned to this vehicle.</span>{!unassignedCargo.length && <button type="button" onClick={onOpenCargo}>Create cargo records</button>}</div>
        : <div className="operational-cargo-list">{assignedCargo.map((cargo) => {
          const container = data.containerTypes.find((item) => item.containerTypeId === cargo.containerTypeId)
          const adr = data.adrRecords.find((item) => item.adrRecordId === cargo.adrRecordId)
          const requirements = (cargo.handlingRequirementIds ?? []).map((id) => data.handlingRequirements.find((item) => item.handlingRequirementId === id)).filter(Boolean)
          return <article className="operational-cargo-card" key={cargo.cargoId}>
            <header><div><strong>{cargo.description}</strong><small>{cargo.cargoType} · {cargo.cargoId}</small></div><button type="button" className="op-cargo-edit" onClick={() => { setEditingCargo(cargo); setEditorOpen(true); setError('') }} aria-label={`Edit ${cargo.description} references`}><Pencil size={13} />Edit</button></header>
            <div className="operational-cargo-facts"><span>Weight</span><strong>{cargo.weightKg === undefined ? 'Not recorded' : `${cargo.weightKg.toLocaleString()} kg`}</strong><span>Quantity</span><strong>{cargo.quantity} {cargo.quantityUnit}</strong></div>
            <div className="op-cargo-detail-row"><Box size={13} /><strong>Container</strong><ContainerDetails container={container} /></div>
            <div className={`op-cargo-detail-row ${adr?.status === 'applicable' ? 'dangerous-goods' : ''}`}><FileWarning size={13} /><strong>ADR</strong><AdrDetails adr={adr} /></div>
            <div className="op-cargo-detail-row"><ShieldCheck size={13} /><strong>Handling</strong><span className="op-cargo-badges">{requirements.length ? requirements.map((item) => <span className={`op-cargo-badge ${item.category}`} key={item.handlingRequirementId}>{item.name}</span>) : 'None recorded'}</span></div>
            <button type="button" className="op-cargo-unassign" onClick={() => unassign(cargo.cargoId)}>Unassign from vehicle</button>
          </article>
        })}</div>}
    {error && <p className="op-cargo-error" role="alert">{error}</p>}
    {editorOpen && data && <CargoReferenceEditor key={editingCargo?.cargoId ?? 'new'} dataset={dataset} vehicleId={vehicleId} initialCargo={editingCargo} onSave={save} onCancel={() => setEditorOpen(false)} />}
  </section>
}
