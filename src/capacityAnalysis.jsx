import React, { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Gauge, Layers3, X } from 'lucide-react'
import { analyzeCapacity, projectCapacityScenario } from './data/capacityAnalysis'

const number = (value, suffix = '') => value === null || value === undefined || !Number.isFinite(value)
  ? '—'
  : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`

const scenarios = [
  { value: 'add-1-dock', label: '+1 dock' },
  { value: 'add-2-docks', label: '+2 docks' },
  { value: 'remove-1-dock', label: '−1 dock' },
  { value: 'remove-2-docks', label: '−2 docks' },
  { value: 'reduce-processing-10', label: 'Reduce processing time by 10%' },
  { value: 'increase-arrivals-10', label: 'Increase arrival volume by 10%' },
  { value: 'increase-arrivals-20', label: 'Increase arrival volume by 20%' },
]

function Metric({ label, value, detail, tone = '' }) {
  return <div className={`capacity-metric ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </div>
}

function BottleneckDetails({ bottleneck, onClose }) {
  if (!bottleneck) return null
  return <aside className="bottleneck-detail" aria-labelledby="bottleneck-detail-title">
    <div className="capacity-subheading">
      <div><span className="capacity-eyebrow">Evidence detail</span><h3 id="bottleneck-detail-title">{bottleneck.affectedArea}</h3></div>
      <button type="button" className="capacity-icon-button" onClick={onClose} aria-label="Close bottleneck details"><X size={17} /></button>
    </div>
    <p className="bottleneck-statement">{bottleneck.type} · {bottleneck.estimatedImpact}</p>
    <div className="bottleneck-facts">
      <Metric label="Current metric" value={bottleneck.currentMetric} />
      <Metric label="System average" value={bottleneck.systemAverage} />
      <Metric label="Peak / reference value" value={bottleneck.peakValue} />
      <Metric label="Affected operations" value={number(bottleneck.affectedOperations)} />
    </div>
    <div className="bottleneck-detail-columns">
      <div><strong>Evidence</strong><ul>{bottleneck.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div><strong>Related metrics</strong><ul>{bottleneck.relatedMetrics.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>
    <p className="capacity-period">Analysis period: {bottleneck.timePeriod}</p>
  </aside>
}

export default function CapacityAnalysisSection({ dataset, analysis: suppliedAnalysis }) {
  const analysis = useMemo(() => suppliedAnalysis ?? analyzeCapacity(dataset), [dataset, suppliedAnalysis])
  const { metrics, bottlenecks, possibleContributingFactors, dataLimitations, timePeriod } = analysis
  const [selectedId, setSelectedId] = useState('')
  const [scenario, setScenario] = useState('add-1-dock')
  const selectedBottleneck = bottlenecks.find((item) => item.id === selectedId) ?? null
  const projection = useMemo(() => projectCapacityScenario(dataset, scenario), [dataset, scenario])
  const severityOrder = { high: 0, medium: 1, low: 2 }
  const outlierDocks = new Set(bottlenecks.filter((item) => item.id.startsWith('dock-utilization-')).map((item) => item.id.slice('dock-utilization-'.length)))
  const orderedBottlenecks = [...bottlenecks].sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity])

  return <section className="capacity-analysis panel" aria-labelledby="capacity-analysis-title">
    <div className="capacity-heading">
      <div>
        <span className="capacity-eyebrow"><Activity size={13} /> Operational analysis</span>
        <h2 id="capacity-analysis-title">Capacity &amp; Bottlenecks</h2>
        <p>Evidence from the active dataset · {timePeriod}</p>
      </div>
      <div className="capacity-heading-tag"><Gauge size={15} /> Dataset snapshot</div>
    </div>

    <div className="capacity-overview">
      <Metric label="Dock capacity" value={`${metrics.availableDockCapacity} / ${metrics.totalDockCapacity}`} detail="Available / total docks" />
      <Metric label="Capacity utilization" value={number(metrics.capacityUtilizationPercent, '%')} detail={`${metrics.usedDockCapacity} docks currently in use`} tone="green" />
      <Metric label="Average / peak dock utilization" value={`${number(metrics.averageDockUtilizationPercent, '%')} / ${number(metrics.peakDockUtilizationPercent, '%')}`} detail="Snapshot utilization across available docks" />
      <Metric label="Average wait" value={metrics.averageWaitingMinutes === null ? '—' : `${number(metrics.averageWaitingMinutes)} min`} detail="Dataset KPI or queue-time estimate" tone="amber" />
      <Metric label="Processing time" value={metrics.averageProcessingMinutes === null ? '—' : `${number(metrics.averageProcessingMinutes)} min`} detail="Dataset KPI or configured average" />
      <Metric label="Throughput" value={metrics.throughputPerHour === null ? '—' : `${number(metrics.throughputPerHour)} / hr`} detail="Estimated operations per hour" />
      <Metric label="Queue / delayed" value={`${metrics.queueLength} / ${metrics.delayedOperations}`} detail="Operations in queue / delayed" tone={metrics.queueLength || metrics.delayedOperations ? 'amber' : ''} />
      <Metric label="Capacity surplus / deficit" value={`${metrics.capacitySurplusDocks} / ${metrics.capacityDeficitDocks}`} detail="Free docks / queued work beyond free docks" />
    </div>

    <div className="capacity-main-grid">
      <section className="capacity-subpanel" aria-labelledby="bottleneck-list-title">
        <div className="capacity-subheading">
          <div><span className="capacity-eyebrow">Ranked by evidence severity</span><h3 id="bottleneck-list-title">Detected constraints</h3></div>
          <span className="capacity-count">{orderedBottlenecks.length}</span>
        </div>
        {orderedBottlenecks.length
          ? <div className="bottleneck-list">{orderedBottlenecks.map((item) => <button type="button" key={item.id} className={`bottleneck-row ${item.severity} ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(selectedId === item.id ? '' : item.id)} aria-expanded={selectedId === item.id}>
            <span className="bottleneck-severity"><AlertTriangle size={15} />{item.severity}</span>
            <span className="bottleneck-row-copy"><strong>{item.type}</strong><small>{item.affectedArea} · {item.currentMetric}</small><small>{item.estimatedImpact}</small></span>
            <span className="bottleneck-affected">{item.affectedOperations}<small>affected</small></span>
          </button>)}</div>
          : <div className="capacity-empty"><Layers3 size={20} /><strong>No bottlenecks detected</strong><span>The active dataset has no measured constraint matching the available evidence.</span></div>}
        <BottleneckDetails bottleneck={selectedBottleneck} onClose={() => setSelectedId('')} />
      </section>

      <section className="capacity-subpanel dock-heatmap-panel" aria-labelledby="dock-heatmap-title">
        <div className="capacity-subheading">
          <div><span className="capacity-eyebrow">Per-dock snapshot</span><h3 id="dock-heatmap-title">Dock utilization heatmap</h3></div>
          <span className="heatmap-legend"><i /> Higher utilization</span>
        </div>
        {metrics.dockMetrics.length
          ? <div className="dock-heatmap-wrap"><table className="dock-heatmap">
            <thead><tr><th>Dock</th><th>Utilization</th><th>Avg process</th><th>Wait</th><th>Operations</th><th>Delays</th></tr></thead>
            <tbody>{metrics.dockMetrics.map((dock) => <tr key={dock.dockId} className={dock.unavailable ? 'unavailable' : outlierDocks.has(dock.dockId) ? 'heat-high' : dock.utilizationPercent !== null && dock.utilizationPercent > (metrics.averageDockUtilizationPercent ?? 0) ? 'heat-mid' : ''}>
              <th scope="row">Dock {dock.dockId}<small>{dock.state}</small></th>
              <td><span className="heatmap-value">{dock.utilizationPercent === null ? 'Unavailable' : `${number(dock.utilizationPercent)}%`}</span>{dock.utilizationPercent !== null && <span className="heatmap-track"><span style={{ width: `${Math.max(0, Math.min(100, dock.utilizationPercent))}%` }} /></span>}</td>
              <td>{dock.processingMinutes === null ? '—' : `${number(dock.processingMinutes)} min`}</td>
              <td>{dock.waitingMinutes === null ? '—' : `${number(dock.waitingMinutes)} min`}</td>
              <td>{dock.operationCount}</td><td>{dock.delayCount}</td>
            </tr>)}</tbody>
          </table></div>
          : <div className="capacity-empty"><Layers3 size={20} /><strong>No dock records</strong><span>The selected dataset has no dock records to analyze.</span></div>}
        <p className="heatmap-note">Wait time is not attributed to individual docks in this dataset; “—” avoids implying a dock-level measurement.</p>
      </section>
    </div>

    <div className="capacity-bottom-grid">
      <section className="capacity-subpanel contributing-factors" aria-labelledby="contributing-factors-title">
        <div className="capacity-subheading"><div><span className="capacity-eyebrow">Dataset-supported hypotheses</span><h3 id="contributing-factors-title">Possible contributing factors</h3></div></div>
        {possibleContributingFactors.length
          ? <ul>{possibleContributingFactors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
          : <p>No contributing factor can be supported by the currently available dataset metrics.</p>}
      </section>

      <section className="capacity-subpanel what-if-panel" aria-labelledby="what-if-title">
        <div className="capacity-subheading"><div><span className="capacity-eyebrow">Temporary projection</span><h3 id="what-if-title">What if?</h3></div><span className="what-if-badge">Does not change dataset</span></div>
        <label className="what-if-select-label" htmlFor="capacity-scenario">Test an operational change</label>
        <select id="capacity-scenario" value={scenario} onChange={(event) => setScenario(event.target.value)}>{scenarios.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
        <div className="what-if-results">
          <Metric label="Projected docks" value={`${projection.availableDockCapacity} / ${projection.totalDockCapacity}`} detail="Available / total" />
          <Metric label="Projected utilization estimate" value={number(projection.capacityUtilizationPercent, '%')} detail="Rate-based where arrival data exists" />
          <Metric label="Projected throughput" value={projection.throughputPerHour === null ? '—' : `${number(projection.throughputPerHour)} / hr`} />
          <Metric label="Demand / capacity balance" value={projection.throughputBalancePerHour === null ? '—' : `${number(projection.throughputBalancePerHour)} / hr`} detail={projection.queuePressure === 'unavailable' ? 'Insufficient arrival-rate data' : projection.queuePressure === 'lower' ? 'Queue pressure may ease' : projection.queuePressure === 'higher' ? 'Queue pressure may increase' : 'No modeled change'} tone={projection.queuePressure === 'lower' ? 'green' : projection.queuePressure === 'higher' ? 'amber' : ''} />
        </div>
        <ul className="what-if-assumptions">{projection.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      </section>
    </div>

    {dataLimitations.length > 0 && <details className="capacity-limitations">
      <summary>Data scope &amp; interpretation</summary>
      <ul>{dataLimitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
    </details>}
  </section>
}
