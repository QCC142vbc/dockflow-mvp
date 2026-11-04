const API_BASE = import.meta.env.VITE_OPERATIONS_API_URL || `http://${window.location.hostname}:8001/api/v1`

class OperationsApiClient {
  constructor() {
    this.token = localStorage.getItem('dockflow_token') || ''
  }

  setToken(token) {
    this.token = token
    if (token) {
      localStorage.setItem('dockflow_token', token)
    } else {
      localStorage.removeItem('dockflow_token')
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {}),
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const message = errorBody.detail || `API request failed with status ${response.status}`
        throw new Error(message)
      }

      return response.status === 204 ? null : await response.json()
    } catch (err) {
      console.warn(`[OperationsApiClient] Error on ${options.method || 'GET'} ${endpoint}:`, err.message)
      throw err
    }
  }

  // Health check
  async checkHealth() {
    return this.request('/../../health')
  }

  // Auth endpoints
  async login(username, password) {
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Authentication failed')
    }

    const data = await response.json()
    this.setToken(data.access_token)
    return data
  }

  async getMe() {
    return this.request('/auth/me')
  }

  // Docks endpoints
  async getDocks() {
    return this.request('/docks/')
  }

  async getWarehouses() {
    return this.request('/warehouses/')
  }

  async updateDock(dockId, updateData) {
    return this.request(`/docks/${dockId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })
  }

  async getVehicles({ search = '', includeInactive = false } = {}) {
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (includeInactive) query.set('include_inactive', 'true')
    return this.request(`/dispatch/vehicles?${query}`)
  }

  async addDemoVehiclePresets() {
    return this.request('/dispatch/vehicles/demo-presets', { method: 'POST' })
  }

  async createVehicle(vehicleData) {
    return this.request('/dispatch/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleData),
    })
  }

  async updateVehicle(vehicleId, updateData) {
    return this.request(`/dispatch/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })
  }

  async deleteVehicle(vehicleId) {
    return this.request(`/dispatch/vehicles/${vehicleId}`, { method: 'DELETE' })
  }

  async getQueue({ search = '', status = '' } = {}) {
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (status) query.set('entry_status', status)
    return this.request(`/dispatch/queue?${query}`)
  }

  async addQueueEntry(entryData) {
    return this.request('/dispatch/queue', {
      method: 'POST',
      body: JSON.stringify(entryData),
    })
  }

  async updateQueueEntry(entryId, updateData) {
    return this.request(`/dispatch/queue/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })
  }

  async deleteQueueEntry(entryId) {
    return this.request(`/dispatch/queue/${entryId}`, { method: 'DELETE' })
  }

  async updateQueueStatus(entryId, status) {
    return this.request(`/dispatch/queue/${entryId}/status?status_value=${encodeURIComponent(status)}`, {
      method: 'PATCH',
    })
  }

  // Operations lifecycle
  async getOperations() {
    return this.request('/operations/')
  }

  async deleteOperation(operationId) {
    return this.request(`/operations/${operationId}`, { method: 'DELETE' })
  }

  async startOperation(operationData) {
    return this.request('/operations/', {
      method: 'POST',
      body: JSON.stringify(operationData),
    })
  }

  async updateOperation(operationId, updateData) {
    return this.request(`/operations/${operationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })
  }

  async getShipments(filters = {}) {
    const query = new URLSearchParams()
    if (filters.search) query.set('search', filters.search)
    if (filters.status) query.set('shipment_status', filters.status)
    return this.request(`/shipments/?${query}`)
  }

  async getAdrCatalog() {
    return this.request('/adr-catalog/')
  }

  async createShipment(shipmentData) {
    return this.request('/shipments/', {
      method: 'POST',
      body: JSON.stringify(shipmentData),
    })
  }

  async updateShipment(shipmentId, updateData) {
    return this.request(`/shipments/${shipmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })
  }

  async deleteShipment(shipmentId) {
    return this.request(`/shipments/${shipmentId}`, { method: 'DELETE' })
  }
}

export const operationsApi = new OperationsApiClient()
