import { AzureFunction, HttpRequest } from '@azure/functions'
import type AxiosType from 'axios'
const axios = require('axios') as typeof AxiosType
import postgres = require('postgres')

type ColumnValue = string | number | null
type Rows = Record<string, ColumnValue>[]
type DbDumpResult = [tableName: string, rows: Rows][]

// get all tables: SELECT * FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
// get all dbs: SELECT datname FROM pg_database

const getDbDump = async (sql: postgres.Sql<{}>): Promise<DbDumpResult> => {
    const tables =
        await sql`SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'`
    const tableNames = tables.map((t) => t.table_name)
    console.log(tableNames)

    return await Promise.all(
        tableNames.map(async (name) => [
            name,
            await sql`SELECT * FROM public.${sql(name)}`,
        ])
    )
}

const httpTrigger: AzureFunction = async (context, req: HttpRequest) => {
    const sourceDbName = req.body.sourceDbName || 'main'
    const targetDbName = req.body.targetDbName

    const neonApiKey = req.body.neonApiKey || process.env.NEON_API_KEY
    const neonProjectId = req.body.neonProjectId || 'fancy-mouse-984056' // <- project rockket
    const neonDbOwnerId = req.body.neonDbOwnerId || process.env.NEON_DB_OWNER_ID

    // 1. Create new db with neon API
    const neonUrl = `https://console.neon.tech/api/v1/projects/${neonProjectId}/databases`
    const body = {
        database: {
            name: targetDbName,
            owner_id: neonDbOwnerId,
        },
    }
    const neonResponse = await axios.post(neonUrl, body, {
        headers: { Authorization: `Bearer ${neonApiKey}` },
    })
    // .catch((err) => console.error(err))

    context.log('NEON RESPONSE:', (neonResponse as any).data)

    // 2. Here migration process would have to happen

    const dbHost = `${neonProjectId}.cloud.neon.tech`
    const dbUser = 'dein-ding'
    const dbPassword = req.body.dbPassword || process.env.DB_PASSWORD
    const dbUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}/?options=project%3D${neonProjectId}`
    const dbUrlFormatted = dbUrl
        .replace(/:\w+@/, ':<password>@') // hide the password
        .replace(/\?options.*$/, neonProjectId) // convert url back to normal format

    const sourceDbSql = postgres(dbUrl, {
        ssl: 'require',
        database: sourceDbName,
    })
    const targetDbSql = postgres(dbUrl, {
        ssl: 'require',
        database: targetDbName,
    })

    // 3. Get db dump
    context.log('DUMP SOURCE')
    const sourceDbDump = await getDbDump(sourceDbSql)

    // 4. Copy the dump into the newly created db
    context.log('COPY INTO TARGET')
    await Promise.all(
        sourceDbDump.map(async ([tableName, rows]) => {
            // await sqlNewDb`CREATE TABLE ${sql(tableName)}` //<--- logical mistake here
            await targetDbSql`INSERT INTO ${targetDbSql(
                tableName
            )} ${sourceDbSql(rows)}`
        })
    )

    // 5. Verify, that copy succeeded
    context.log('DUMP TARGET')
    const targetDbDump = await getDbDump(targetDbSql)
    const isAcurateMatch =
        JSON.stringify(sourceDbDump) == JSON.stringify(targetDbDump)

    context.res = {
        status: 201,
        body: JSON.stringify({
            targetDbName,
            url: dbUrlFormatted,
            isAcurateMatch,
            sourceDbDump: Object.fromEntries(sourceDbDump),
            targetDbDump: Object.fromEntries(targetDbDump),
        }),
        headers: { 'Content-Type': 'application/json' }, // so that postman formats the response nicely
    }
}

export default httpTrigger
