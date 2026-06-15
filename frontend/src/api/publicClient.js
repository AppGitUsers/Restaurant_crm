import axios from 'axios'

// No auth token, no 401 redirect — for customer-facing public endpoints
const publicClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export default publicClient
