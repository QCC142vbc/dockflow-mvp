export const scenario = {
  name: 'maintenance',
  label: 'Dock maintenance and safety incident',
  queueDelayMinutes: 18,
  extraAlerts: [{ id: 'alert-safety-hold', severity: 'critical', dockId: '05', code: 'SAFETY_HOLD', description: 'Safety hold after spill response', action: 'Awaiting supervisor release' }],
  dockOverrides: { '05': { state: 'Maintenance', status: 'maintenance', progress: 0 } },
}
