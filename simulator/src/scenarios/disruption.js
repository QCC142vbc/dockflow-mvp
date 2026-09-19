export const scenario = {
  name: 'disruption',
  label: 'Delayed documentation and late arrivals',
  queueDelayMinutes: 25,
  extraAlerts: [{ id: 'alert-late-arrival', severity: 'critical', dockId: '11', code: 'LATE_ARRIVAL', description: 'Inbound appointment missed by 24 minutes', action: 'Operations lead reviewing ETA' }],
  dockOverrides: { '11': { state: 'Delayed', status: 'delayed', progress: 18 } },
}
