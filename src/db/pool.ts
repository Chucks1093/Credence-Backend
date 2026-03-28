import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
     connectionString: process.env.DB_URL,
     max: 10,
     idleTimeoutMillis: 30_000,
     connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
     console.error('[pool] unexpected client error', err)
})