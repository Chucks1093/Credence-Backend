import 'dotenv/config'
import app from './app.js'
import { loadConfig } from './config/index.js'

try {
  const config = loadConfig()

  app.listen(config.port, () => {
    console.log(`Credence API listening on port ${config.port}`)
  })
} catch (error) {
  console.error("Failed to start Credence API:", error)
  process.exit(1)
}
