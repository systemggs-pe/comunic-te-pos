import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readFunctionsEnv() {
  const envPath = path.resolve(__dirname, 'functions/.env')
  if (!fs.existsSync(envPath)) return {}

  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) acc[match[1]] = match[2].replace(/^["']|["']$/g, '')
      return acc
    }, {})
}

function valueOrEmpty(value) {
  const text = String(value || '').trim()
  if (!text || text.includes('*') || /^data in credit$/i.test(text)) return ''
  return text
}

function normalizeReniecResponse(data, dni) {
  const result = data?.result || data?.data || data?.persona || data || {}
  const nombres = valueOrEmpty(result.nombres || result.first_name)
  const apellidoPaterno = valueOrEmpty(result.apellidoPaterno || result.apellido_paterno || result.first_last_name)
  const apellidoMaterno = valueOrEmpty(result.apellidoMaterno || result.apellido_materno || result.second_last_name)
  const fullName = valueOrEmpty(
    result.full_name ||
    result.nombreCompleto ||
    result.nombre_completo ||
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' '),
  )

  return {
    success: Boolean(data?.success ?? fullName),
    source: data?.source || 'RENIEC_LOCAL_PROXY',
    result: {
      ...result,
      document_number: valueOrEmpty(result.document_number || result.dni || dni),
      first_name: nombres,
      first_last_name: apellidoPaterno,
      second_last_name: apellidoMaterno,
      full_name: fullName,
      address: valueOrEmpty(result.address || result.direccion),
      phone: valueOrEmpty(result.phone || result.telefono),
      email: valueOrEmpty(result.email || result.correo),
    },
  }
}

function reniecLocalProxy() {
  return {
    name: 'reniec-local-proxy',
    configureServer(server) {
      server.middlewares.use('/api/reniec', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Metodo no permitido' }))
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const env = readFunctionsEnv()
            const token = env.RENIEC_TOKEN || process.env.RENIEC_TOKEN
            if (!token) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'RENIEC_TOKEN_MISSING' }))
              return
            }

            const payload = JSON.parse(body || '{}')
            const dni = String(payload.dni || '').replace(/\D/g, '').slice(0, 8)
            if (dni.length !== 8) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'DNI invalido' }))
              return
            }

            const response = await fetch(`https://api-codart.cgrt.org/api/v1/consultas/reniec/dni/${dni}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            })
            const data = await response.json().catch(() => ({}))
            res.statusCode = response.ok ? 200 : response.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response.ok
              ? normalizeReniecResponse(data, dni)
              : { success: false, error: data.error || data.message || 'RENIEC_UPSTREAM_ERROR' }))
          } catch (error) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'RENIEC_UNAVAILABLE', message: error.message }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), reniecLocalProxy()],
})
