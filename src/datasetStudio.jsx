import React, { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Download, FileUp, Plus, Trash2, X } from 'lucide-react'
import {
  createDatasetPreview,
  createDefaultConfig,
  generateOperationsDataset,
  getScenarioDefaults,
  validateSimulationConfig,
} from './data/datasetFactory.ts'
import { parseImportedDataset } from './data/datasetStore.js'

const SCENARIOS = [
  { value: 'normal', label: 'Normal' },
  { value: 'busy-day', label: 'Busy' },
  { value: 'disruption', label: 'Disruption' },
  { value: 'maintenance', label: 'Maintenance' },
]

const scenarioLabel = (scenario) => SCENARIOS.find((item) => item.value === scenario)?.label ?? scenario ?? 'Unknown'
const datasetTitle = (dataset) => dataset?.datasetName || dataset?.simulationConfig?.datasetName || dataset?.warehouse?.name || 'Untitled dataset'
const recordCount = (dataset) => ['vehicles', 'queue', 'docks', 'alerts'].reduce((sum, key) => sum + (Array.isArray(dataset?.[key]) ? dataset[key].length : 0), 0)
const formatDate = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString()
}

function Field({ id, label, error, hint, children, className = '' }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return <div className={`ds-field ${className}`}>
    <label htmlFor={id}>{label}</label>
    {React.cloneElement(children, {
      id,
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': describedBy,
    })}
    {hint && <small id={`${id}-hint`} className="ds-hint">{hint}</small>}
    {error && <small id={`${id}-error`} className="ds-field-error" role="alert">{error}</small>}
  </div>
}

function FormSection({ title, children, description }) {
  return <section className="ds-form-section">
    <div className="ds-section-title"><h3>{title}</h3>{description && <p>{description}</p>}</div>
    <div className="ds-form-grid">{children}</div>
  </section>
}

function Metric({ label, value, detail }) {
  return <div className="ds-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
}

export default function DatasetStudio({
  datasets = [],
  activeDatasetId = null,
  initialTab = 'manage',
  onClose = () => {},
  onCreate = () => {},
  onSelect = () => {},
  onDelete = () => {},
  onDuplicate = () => {},
  onImport = () => {},
  onExport = () => {},
}) {
  const [tab, setTab] = useState(initialTab)
  const [config, setConfig] = useState(() => createDefaultConfig())
  const [touched, setTouched] = useState(() => new Set())
  const [attempted, setAttempted] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewDataset, setPreviewDataset] = useState(null)
  const [createdDataset, setCreatedDataset] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const importInput = useRef(null)
  const selected = datasets.find((dataset) => dataset.datasetId === activeDatasetId)

  const validatedErrors = useMemo(() => validateSimulationConfig(config), [config])
  const displayedErrors = attempted
    ? validatedErrors
    : Object.fromEntries(Object.entries(validatedErrors).filter(([key]) => touched.has(key)))

  const setField = (key, value) => {
    setConfig((previous) => ({ ...previous, [key]: value }))
    setTouched((previous) => new Set(previous).add(key))
    setPreviewDataset(null)
    setError('')
  }

  const changeScenario = (scenario) => {
    const defaults = getScenarioDefaults(scenario)
    setConfig((previous) => {
      const next = { ...defaults, scenario }
      touched.forEach((key) => {
        if (key !== 'scenario') next[key] = previous[key]
      })
      return next
    })
    setTouched((previous) => new Set(previous).add('scenario'))
    setPreviewDataset(null)
    setError('')
  }

  const openPreview = () => {
    setAttempted(true)
    const issues = validateSimulationConfig(config)
    if (Object.keys(issues).length) return
    try {
      const summary = createDatasetPreview(config)
      const generated = generateOperationsDataset(config)
      setPreview({ ...summary, datasetId: generated.datasetId, records: recordCount(generated) })
      setPreviewDataset(generated)
      setTab('preview')
      setError('')
    } catch {
      setError('We could not prepare this dataset preview. Check the configuration and try again.')
    }
  }

  const editConfiguration = () => {
    setTab('create')
    setAttempted(false)
    setError('')
  }

  const generateDataset = async () => {
    setBusy(true)
    setError('')
    try {
      const dataset = previewDataset || generateOperationsDataset(config)
      await onCreate(dataset)
      setCreatedDataset(dataset)
      setTab('success')
    } catch {
      setError('The dataset could not be generated or saved. Please check your configuration and try again.')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    setError('')
    setNotice('')
    if (!file) return
    try {
      const dataset = parseImportedDataset(await file.text())
      await onImport(dataset)
      setNotice(`Imported “${datasetTitle(dataset)}” successfully.`)
      setTab('manage')
    } catch (importError) {
      setError(importError instanceof Error && importError.message
        ? importError.message
        : 'This file could not be imported. Choose a valid DockFlow dataset JSON file.')
    } finally {
      input.value = ''
    }
  }

  const runDatasetAction = async (action, message) => {
    setError('')
    try {
      await action()
      if (message) setNotice(message)
      return true
    } catch {
      setError('That dataset action could not be completed. Please try again.')
      return false
    }
  }

  const scenarioPreview = preview || {}
  const totalRecords = preview?.records ?? 0
  const mainTitle = tab === 'manage' ? 'Manage datasets' : tab === 'create' ? 'Create dataset' : tab === 'preview' ? 'Review simulation' : 'Dataset created'

  const renderConfigForm = () => <>
    <FormSection title="Dataset" description="Name and schedule your operations snapshot.">
      <Field id="datasetName" label="Dataset name" error={displayedErrors.datasetName}>
        <input type="text" maxLength={100} value={config.datasetName} onChange={(event) => setField('datasetName', event.target.value)} />
      </Field>
      <Field id="simulationDateTime" label="Simulation date and time" error={displayedErrors.simulationDateTime}>
        <input type="datetime-local" value={config.simulationDateTime} onChange={(event) => setField('simulationDateTime', event.target.value)} />
      </Field>
      <Field id="optionalNotes" label="Notes (optional)" error={displayedErrors.optionalNotes} className="ds-wide">
        <textarea rows={3} value={config.optionalNotes} onChange={(event) => setField('optionalNotes', event.target.value)} placeholder="Add context for this dataset" />
      </Field>
    </FormSection>

    <FormSection title="Scenario" description="Scenario defaults update automatically; edited values are kept.">
      <Field id="scenario" label="Operating scenario" error={displayedErrors.scenario}>
        <select value={config.scenario} onChange={(event) => changeScenario(event.target.value)}>
          {SCENARIOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </Field>
      {config.scenario === 'maintenance' && <Field id="maintenanceDockCount" label="Docks under maintenance" error={displayedErrors.maintenanceDockCount}>
        <input type="number" min="0" max="24" step="1" value={config.maintenanceDockCount} onChange={(event) => setField('maintenanceDockCount', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>}
      {config.scenario === 'disruption' && <Field id="disruptionDelayMinutes" label="Disruption delay (minutes)" error={displayedErrors.disruptionDelayMinutes}>
        <input type="number" min="0" max="1440" step="1" value={config.disruptionDelayMinutes} onChange={(event) => setField('disruptionDelayMinutes', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>}
    </FormSection>

    <FormSection title="Simulation" description="Set the scale of the generated operation.">
      <Field id="vehicleCount" label="Vehicle count" error={displayedErrors.vehicleCount}>
        <input type="number" min="0" max="500" step="1" value={config.vehicleCount} onChange={(event) => setField('vehicleCount', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="seed" label="Generation seed" error={displayedErrors.seed}>
        <input type="number" min="0" max="2147483647" step="1" value={config.seed} onChange={(event) => setField('seed', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
    </FormSection>

    <FormSection title="Infrastructure" description="Configure the warehouse floor and available dock capacity.">
      <Field id="warehouseName" label="Warehouse name" error={displayedErrors.warehouseName}>
        <input type="text" value={config.warehouseName} onChange={(event) => setField('warehouseName', event.target.value)} />
      </Field>
      <Field id="dockCount" label="Total docks" error={displayedErrors.dockCount}>
        <input type="number" min="1" max="24" step="1" value={config.dockCount} onChange={(event) => setField('dockCount', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
    </FormSection>

    <FormSection title="Traffic" description="Plan inbound and outbound shipment flow.">
      <Field id="incomingShipments" label="Incoming shipments" error={displayedErrors.incomingShipments}>
        <input type="number" min="0" max="500" step="1" value={config.incomingShipments} onChange={(event) => setField('incomingShipments', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="outgoingShipments" label="Outgoing shipments" error={displayedErrors.outgoingShipments}>
        <input type="number" min="0" max="500" step="1" value={config.outgoingShipments} onChange={(event) => setField('outgoingShipments', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="averageArrivalIntervalMinutes" label="Average arrival interval (minutes)" error={displayedErrors.averageArrivalIntervalMinutes}>
        <input type="number" min="0.1" max="1440" step="0.1" value={config.averageArrivalIntervalMinutes} onChange={(event) => setField('averageArrivalIntervalMinutes', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="priorityPercent" label="Priority shipments (%)" error={displayedErrors.priorityPercent}>
        <input type="number" min="0" max="100" step="1" value={config.priorityPercent} onChange={(event) => setField('priorityPercent', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="carrierName" label="Primary carrier (optional)" error={displayedErrors.carrierName} hint="If blank, vehicles use “Unassigned carrier.”">
        <input type="text" value={config.carrierName} onChange={(event) => setField('carrierName', event.target.value)} />
      </Field>
    </FormSection>

    <FormSection title="Operational Parameters" description="Tune service times and expected dock utilization.">
      <Field id="utilizationTarget" label="Target utilization (%)" error={displayedErrors.utilizationTarget}>
        <input type="number" min="0" max="100" step="1" value={config.utilizationTarget} onChange={(event) => setField('utilizationTarget', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
      <Field id="averageServiceMinutes" label="Average service time (minutes)" error={displayedErrors.averageServiceMinutes}>
        <input type="number" min="0.1" max="1440" step="0.1" value={config.averageServiceMinutes} onChange={(event) => setField('averageServiceMinutes', event.target.value === '' ? '' : Number(event.target.value))} />
      </Field>
    </FormSection>
  </>

  return <div className="ds-backdrop">
    <section className="ds-studio" role="dialog" aria-modal="true" aria-labelledby="ds-title">
      <header className="ds-header">
        <div><span className="ds-eyebrow">Operations data studio</span><h1 id="ds-title">{mainTitle}</h1><p>Create, review and manage reusable DockFlow datasets.</p></div>
        <button className="ds-icon-button" type="button" onClick={onClose} aria-label="Close dataset studio"><X size={19} /></button>
      </header>

      {tab !== 'success' && <nav className="ds-tabs" aria-label="Dataset studio sections">
        <button type="button" className={tab === 'manage' ? 'is-active' : ''} aria-current={tab === 'manage' ? 'page' : undefined} onClick={() => { setTab('manage'); setError('') }}>Manage <span>{datasets.length}</span></button>
        <button type="button" className={tab !== 'manage' ? 'is-active' : ''} aria-current={tab !== 'manage' ? 'page' : undefined} onClick={() => { setTab('create'); setError('') }}><Plus size={14} /> Create</button>
      </nav>}

      <div className="ds-content">
        {notice && <div className="ds-notice" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button></div>}
        {error && <div className="ds-error-banner" role="alert">{error}</div>}

        {tab === 'manage' && <>
          <div className="ds-manage-toolbar">
            <div><h2>Saved datasets</h2><p>Select a snapshot to open it in the dashboard.</p></div>
            <div className="ds-toolbar-actions">
              {selected && <button className="ds-button ds-button-secondary" type="button" onClick={() => runDatasetAction(() => onExport(selected))}><Download size={15} /> Export selected</button>}
              <button className="ds-button ds-button-primary" type="button" onClick={() => { setTab('create'); setNotice(''); setError('') }}><Plus size={15} /> New dataset</button>
            </div>
          </div>
          {datasets.length === 0
            ? <div className="ds-empty"><div className="ds-empty-mark"><FileUp size={22} /></div><h3>No saved datasets yet</h3><p>Create a simulation or import a DockFlow dataset to get started.</p><button className="ds-button ds-button-primary" type="button" onClick={() => setTab('create')}><Plus size={15} /> Create dataset</button></div>
            : <div className="ds-dataset-list">{datasets.map((dataset) => {
              const active = dataset.datasetId === activeDatasetId
              const counts = dataset.integrity?.recordCounts
              const count = counts ? Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0) : recordCount(dataset)
              return <article className={`ds-dataset-card ${active ? 'is-selected' : ''}`} key={dataset.datasetId}>
                <div className="ds-card-main">
                  <div className="ds-card-title"><span className="ds-selection-indicator">{active && <Check size={12} />}</span><div><h3>{datasetTitle(dataset)}</h3><p>{dataset.datasetId || 'Dataset ID unavailable'}</p></div></div>
                  <span className={`ds-scenario ds-scenario-${dataset.scenario || 'unknown'}`}>{scenarioLabel(dataset.scenario)}</span>
                </div>
                <div className="ds-card-meta">
                  <span><b>Created</b>{formatDate(dataset.generatedAt || dataset.simulatedAt)}</span>
                  <span><b>Scenario</b>{scenarioLabel(dataset.scenario)}</span>
                  <span><b>Docks</b>{dataset.docks?.length ?? counts?.docks ?? 0}</span>
                  <span><b>Trucks</b>{dataset.vehicles?.length ?? counts?.vehicles ?? 0}</span>
                  <span><b>Records</b>{count}</span>
                  <span><b>Selection</b>{active ? 'Current' : 'Available'}</span>
                </div>
                <div className="ds-card-actions">
                  <button className="ds-button ds-button-primary" type="button" onClick={() => runDatasetAction(() => onSelect(dataset.datasetId))} disabled={active}>{active ? 'Selected' : 'Open dashboard'}</button>
                  <button className="ds-button ds-button-secondary" type="button" onClick={() => runDatasetAction(() => onDuplicate(dataset))}><Copy size={14} /> Duplicate</button>
                  <button className="ds-button ds-button-danger" type="button" onClick={() => { setDeleteTarget(dataset); setError('') }} aria-label={`Delete ${datasetTitle(dataset)}`} disabled={datasets.length === 1} title={datasets.length === 1 ? 'Keep at least one dataset in the library.' : undefined}><Trash2 size={14} /> Delete</button>
                </div>
              </article>
            })}</div>}
          <div className="ds-import-row">
            <div><h3>Import dataset</h3><p>Choose a validated DockFlow dataset JSON file.</p></div>
            <input ref={importInput} className="ds-file-input" type="file" accept=".json,application/json" onChange={importFile} aria-label="Import dataset JSON file" />
            <button className="ds-button ds-button-secondary" type="button" onClick={() => importInput.current?.click()}><FileUp size={15} /> Choose JSON file</button>
          </div>
        </>}

        {tab === 'create' && <form onSubmit={(event) => { event.preventDefault(); openPreview() }}>
          {renderConfigForm()}
          <div className="ds-form-actions"><button type="button" className="ds-button ds-button-secondary" onClick={() => setTab('manage')}>Cancel</button><button type="submit" className="ds-button ds-button-primary">Preview dataset <span aria-hidden="true">→</span></button></div>
        </form>}

        {tab === 'preview' && preview && <>
          <div className="ds-preview-intro"><button type="button" className="ds-back-link" onClick={editConfiguration}><ArrowLeft size={15} /> Back to edit</button><div className="ds-preview-heading"><span className={`ds-scenario ds-scenario-${scenarioPreview.scenario}`}>{scenarioLabel(scenarioPreview.scenario)}</span><h2>{config.datasetName}</h2><p>Confirm this operational snapshot before it is added to your dataset library.</p></div></div>
          <div className="ds-preview-id"><span>Dataset ID</span><code>{preview.datasetId}</code></div>
          <div className="ds-metrics-grid">
            <Metric label="Scenario" value={scenarioLabel(scenarioPreview.scenario)} />
            <Metric label="Docks / vehicles" value={`${scenarioPreview.dockCount} / ${scenarioPreview.vehicleCount}`} />
            <Metric label="Expected utilization" value={`${scenarioPreview.capacityUtilization}%`} />
            <Metric label="Expected throughput" value={`${Math.round((scenarioPreview.availableCapacity * 60 / config.averageServiceMinutes) * config.utilizationTarget / 100)} / hr`} />
            <Metric label="Estimated wait" value={`${scenarioPreview.estimatedAverageWaitMinutes} min`} />
            <Metric label="Generated records" value={totalRecords.toLocaleString()} detail="Vehicles, queue, docks and alerts" />
          </div>
          <div className="ds-preview-detail"><span>{config.warehouseName}</span><span>{formatDate(config.simulationDateTime)}</span><span>{scenarioPreview.availableCapacity} operational docks</span></div>
          <div className="ds-form-actions"><button type="button" className="ds-button ds-button-secondary" onClick={editConfiguration}>Back / edit</button><button type="button" className="ds-button ds-button-primary" onClick={generateDataset} disabled={busy}>{busy ? 'Generating…' : 'Generate dataset'}</button></div>
        </>}

        {tab === 'success' && createdDataset && <div className="ds-success">
          <div className="ds-success-icon"><Check size={26} /></div><span className="ds-eyebrow">Generation complete</span><h2>{datasetTitle(createdDataset)} is ready</h2><p>The dataset has been added to your library and can now be opened in the operations dashboard.</p>
          <div className="ds-preview-id"><span>Dataset ID</span><code>{createdDataset.datasetId}</code></div>
          <button className="ds-button ds-button-primary" type="button" onClick={onClose}>Open dashboard <span aria-hidden="true">→</span></button>
          <button className="ds-back-link" type="button" onClick={() => { setTab('manage'); setNotice('Dataset created successfully.') }}>Back to dataset library</button>
        </div>}
      </div>

      {deleteTarget && <div className="ds-confirm-backdrop">
        <section className="ds-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ds-delete-title" aria-describedby="ds-delete-description">
          <span className="ds-eyebrow">Confirm deletion</span><h2 id="ds-delete-title">Delete this dataset?</h2>
          <p id="ds-delete-description">“{datasetTitle(deleteTarget)}” will be removed from your dataset library. This cannot be undone.</p>
          <div className="ds-confirm-actions"><button type="button" className="ds-button ds-button-secondary" onClick={() => setDeleteTarget(null)}>Keep dataset</button><button type="button" className="ds-button ds-button-danger" onClick={() => runDatasetAction(() => onDelete(deleteTarget.datasetId)).then((success) => success && setDeleteTarget(null))}><Trash2 size={14} /> Delete dataset</button></div>
        </section>
      </div>}
    </section>
  </div>
}
