import { Pool } from 'pg'
<<<<<<< HEAD
=======
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
>>>>>>> upstream/main

export interface TestDatabase {
  pool: Pool
  close: () => Promise<void>
  connectionString: string
}

<<<<<<< HEAD
=======
const waitForReadyLog = Wait.forLogMessage(/database system is ready to accept connections/i)

>>>>>>> upstream/main
export async function createTestDatabase(): Promise<TestDatabase> {
  const externalConnectionString = process.env.TEST_DATABASE_URL

  if (externalConnectionString) {
    const pool = new Pool({ connectionString: externalConnectionString })
    await pool.query('SELECT 1')

    return {
      connectionString: externalConnectionString,
      pool,
      close: async () => {
        await pool.end()
      },
    }
  }

<<<<<<< HEAD
  // Dynamically import testcontainers only when needed (not installed in CI)
  const { GenericContainer, Wait } = await import('testcontainers')

=======
>>>>>>> upstream/main
  const user = 'credence'
  const password = 'credence'
  const database = 'credence_test'

<<<<<<< HEAD
  const waitForReadyLog = Wait.forLogMessage(/database system is ready to accept connections/i)

  const container = await new GenericContainer('postgres:16-alpine')
=======
  const container: StartedTestContainer = await new GenericContainer('postgres:16-alpine')
>>>>>>> upstream/main
    .withEnvironment({
      POSTGRES_DB: database,
      POSTGRES_PASSWORD: password,
      POSTGRES_USER: user,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(waitForReadyLog)
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(5432)
  const connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}`

  const pool = new Pool({ connectionString })
  await pool.query('SELECT 1')

  return {
    connectionString,
    pool,
    close: async () => {
      await pool.end()
      await container.stop()
    },
  }
}
