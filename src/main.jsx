import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useSimulation } from './simulation'
import { AttentionPanel, DockDetailModal, DockGrid, Header, MetricsBar, NowCallingPanel, QueueTable } from './components'
import CapacityAnalysisSection from './capacityAnalysis'
import DispatchConsole from './dispatchConsole'
import { analyzeCapacity } from './data/capacityAnalysis'
import { withWorkingOperations } from './data/operationsData'
import DatasetStudio from './datasetStudio'
import demoDataset from '../data/examples/demo-dataset.json'
import { deleteDataset, duplicateDataset, loadDatasets, saveDataset, updateDataset as updateSavedDataset } from './data/datasetStore'
import './styles.css'
import CargoComplianceStudio from './cargoComplianceStudio.jsx'
import { validateAllOperationalCargo } from './data/operationalConflictEngine.ts'

function App() {
  const [library, setLibrary] = useState(() => {
    try {
      return { datasets: loadDatasets(demoDataset), error: '' }
    } catch {
      return { datasets: [demoDataset], error: 'Saved datasets could not be loaded from this browser. New changes may not persist until storage is available.' }
    }
  })
  const [activeDatasetId, setActiveDatasetId] = useState(() => library.datasets[0]?.datasetId ?? demoDataset.datasetId)
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioTab, setStudioTab] = useState('manage')
  const [now, setNow] = useState(() => new Date())
  const [live, setLive] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [directionFilter, setDirectionFilter] = useState('All')
  const [selectedDock, setSelectedDock] = useState(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [activeSection, setActiveSection] = useState('dashboard')
  const activeDataset = library.datasets.find((dataset) => dataset.datasetId === activeDatasetId) ?? library.datasets[0] ?? demoDataset
  const simulationDataset = activeDataset
  const { state, pulse, dispatchAction } = useSimulation(live, now, simulationDataset)
  const analysisDataset = useMemo(() => withWorkingOperations(activeDataset, state), [activeDataset, state])
  const capacityAnalysis = useMemo(() => analyzeCapacity(analysisDataset), [analysisDataset])
  const operationalConflictAlerts = useMemo(() => validateAllOperationalCargo(activeDataset).map((conflict) => {
    const vehicleId = conflict.relatedRecords.find((record) => record.entity === 'vehicle')?.entityId
    const cargoId = conflict.relatedRecords.find((record) => record.entity === 'cargo')?.entityId
    return {
      alertId: conflict.conflictId,
      severity: conflict.severity === 'blocking' ? 'critical' : conflict.severity,
      attentionLevel: conflict.severity.toUpperCase(),
      code: conflict.type,
      description: conflict.message,
      action: 'Review the linked dataset record. This finding does not automatically block dispatch.',
      elapsedSeconds: 0,
      ...(vehicleId ? { vehicleId } : {}),
      ...(cargoId ? { cargoId } : {}),
    }
  }), [activeDataset])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const calledVehicle = state.callingVehicles?.[state.callingIndex]
  const filteredDocks = useMemo(() => state.docks.filter((dock) => (statusFilter === 'All' || dock.state === statusFilter) && (directionFilter === 'All' || dock.direction === directionFilter)), [directionFilter, state.docks, statusFilter])

  const refreshLibrary = () => {
    const datasets = loadDatasets(demoDataset)
    setLibrary({ datasets, error: '' })
    return datasets
  }

  const withStorageError = (action) => {
    try {
      const result = action()
      setLibrary((current) => ({ ...current, error: '' }))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser storage could not complete the dataset operation.'
      setLibrary((current) => ({ ...current, error: message }))
      throw error
    }
  }

  const handleCreate = (dataset) => withStorageError(() => {
    saveDataset(dataset)
    refreshLibrary()
    setActiveDatasetId(dataset.datasetId)
  })

  const handleCargoSave = (dataset) => withStorageError(() => {
    updateSavedDataset(dataset)
    const datasets = refreshLibrary()
    setActiveDatasetId(dataset.datasetId)
  })

  const handleImport = (dataset) => withStorageError(() => {
    if (library.datasets.some((item) => item.datasetId === dataset.datasetId)) {
      throw new Error('A dataset with this ID already exists. Rename the dataset or remove the existing copy first.')
    }

    saveDataset(dataset)
    refreshLibrary()
    setActiveDatasetId(dataset.datasetId)
  })

  const handleDuplicate = (dataset) => withStorageError(() => {
    const copy = duplicateDataset(dataset)
    refreshLibrary()
    setActiveDatasetId(copy.datasetId)
    return copy
  })

  const handleDelete = (datasetId) => withStorageError(() => {
    if (library.datasets.length <= 1) throw new Error('Keep at least one dataset in the library.')
    deleteDataset(datasetId, demoDataset)
    const datasets = refreshLibrary()
    if (datasetId === activeDatasetId) setActiveDatasetId(datasets[0]?.datasetId ?? '')
  })

  const handleExport = (dataset) => {
    const blob = new Blob([`${JSON.stringify(dataset, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${dataset.datasetId}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const openStudio = (tab) => {
    setStudioTab(tab)
    setStudioOpen(true)
  }

  return <main className={pulse ? 'app is-pulsing' : 'app'}>
    <Header now={now} warehouse={state.warehouse} />
    <section className="dataset-toolbar" aria-label="Dataset controls">
      <div className="dataset-current"><label htmlFor="active-dataset">Active dataset</label><select id="active-dataset" value={activeDatasetId} onChange={(event) => { setActiveDatasetId(event.target.value); setSelectedDock(null); setSelectedVehicleId('') }}>{library.datasets.map((dataset) => <option key={dataset.datasetId} value={dataset.datasetId}>{dataset.datasetName || dataset.simulationConfig?.datasetName || dataset.warehouse.name} · {dataset.scenario}</option>)}</select></div>
      <div className="dataset-toolbar-actions"><button type="button" onClick={() => openStudio('manage')}>Manage datasets</button><button type="button" className="dataset-create-button" onClick={() => openStudio('create')}>＋ New simulation</button></div>
    </section>
    <nav className="primary-navigation" aria-label="Main navigation">
      <button type="button" className={activeSection === 'dashboard' ? 'active' : ''} aria-current={activeSection === 'dashboard' ? 'page' : undefined} onClick={() => setActiveSection('dashboard')}>Operations Dashboard</button>
      <button type="button" className={activeSection === 'cargo' ? 'active' : ''} aria-current={activeSection === 'cargo' ? 'page' : undefined} onClick={() => { setStudioOpen(false); setActiveSection('cargo') }}>Cargo &amp; Compliance</button>
    </nav>
    {library.error && <div className="dataset-storage-error" role="alert">{library.error}</div>}
    {studioOpen
      ? <DatasetStudio datasets={library.datasets} activeDatasetId={activeDatasetId} initialTab={studioTab} onClose={() => setStudioOpen(false)} onCreate={handleCreate} onImport={handleImport} onSelect={(datasetId) => { setActiveDatasetId(datasetId); setSelectedDock(null); setSelectedVehicleId(''); setStudioOpen(false) }} onDelete={handleDelete} onDuplicate={handleDuplicate} onExport={handleExport} />
      : activeSection === 'cargo'
        ? <CargoComplianceStudio dataset={activeDataset} onSave={handleCargoSave} />
        : <><NowCallingPanel vehicle={calledVehicle} /><AttentionPanel alerts={[...operationalConflictAlerts, ...state.alerts]} docks={state.docks} onSelect={setSelectedDock} onSelectVehicle={setSelectedVehicleId} onSelectCargo={() => setActiveSection('cargo')} /><section className="content-grid"><QueueTable queue={state.queue} live={live} setLive={setLive} selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} /><DockGrid docks={filteredDocks} statusFilter={statusFilter} setStatusFilter={setStatusFilter} directionFilter={directionFilter} setDirectionFilter={setDirectionFilter} onSelect={setSelectedDock} /></section><DispatchConsole key={selectedVehicleId ?? 'no-vehicle'} state={state} onAction={dispatchAction} selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} dataset={activeDataset} onCargoSave={handleCargoSave} onOpenCargo={() => setActiveSection('cargo')} /><CapacityAnalysisSection dataset={analysisDataset} analysis={capacityAnalysis} /><MetricsBar state={state} analysis={capacityAnalysis} />{selectedDock && <DockDetailModal dock={selectedDock} onClose={() => setSelectedDock(null)} />}</>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
