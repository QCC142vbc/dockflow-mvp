import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDataset, persistDataset } from './generate.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, 'data')
const port = Number(process.env.PORT || 8787)
const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); response.end(JSON.stringify(body)) }
const readLatest = () => {
  const file = path.join(DATA, 'current', 'latest.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}
const readManifest = () => {
  const file = path.join(DATA, 'manifest', 'index.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schemaVersion: '1.0.0', datasets: [] }
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (request.method === 'GET' && url.pathname === '/api/operations/current') return json(response, 200, readLatest() || { error: 'No current dataset available' })
  if (request.method === 'GET' && url.pathname === '/api/operations/datasets') return json(response, 200, readManifest())
  if (request.method === 'GET' && url.pathname.startsWith('/api/operations/datasets/')) {
    const datasetId = url.pathname.split('/').pop()
    const record = readManifest().datasets.find((item) => item.datasetId === datasetId)
    if (!record) return json(response, 404, { error: 'Dataset not found' })
    const file = path.resolve(ROOT, record.filePath)
    return json(response, 200, JSON.parse(fs.readFileSync(file, 'utf8')))
  }
  if (request.method === 'POST' && url.pathname === '/api/operations/generate') {
    if (process.env.NODE_ENV === 'production') return json(response, 403, { error: 'Generation endpoint disabled in production' })
    const scenario = url.searchParams.get('scenario') || 'normal'
    try { return json(response, 201, persistDataset(buildDataset({ scenarioName: scenario, seed: url.searchParams.get('seed') || Date.now() })).dataset) } catch (error) { return json(response, 400, { error: error.message }) }
  }
  return json(response, 404, { error: 'Not found' })
})
server.listen(port, () => console.log(`DockFlow simulation API listening at http://localhost:${port}`))
