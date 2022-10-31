import { AzureFunction, HttpRequest } from '@azure/functions';

import postgres = require('postgres');

type ColumnValue = string | number | null;
type Rows = Record<string, ColumnValue>[];
type DbDumpResult = [tableName: string, rows: Rows][];

// get all tables: SELECT * FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
// get all dbs: SELECT datname FROM pg_database

const getDbDump = async (sql: postgres.Sql<{}>): Promise<DbDumpResult> => {
    const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'pg_%'
            AND table_name NOT LIKE 'sql_%'
            AND table_name NOT LIKE '%prisma%'
    `;
    const tableNames = tables.map((t) => t.table_name);
    console.log(tableNames);

    return await Promise.all(
        tableNames.map(async (name) => [name, await sql`SELECT * FROM public.${sql(name)}`])
    );
};

const httpTrigger: AzureFunction = async (context, req: HttpRequest) => {
    const {
        sourceDbName,
        targetDbName,
        dbUrl, // postgres://<user>:<password>@<host>/?options=project%3D<neon-project-id>
    } = req.query;

    const sourceSql = postgres(dbUrl, { ssl: 'require', database: sourceDbName });
    const targetSql = postgres(dbUrl, { ssl: 'require', database: targetDbName });

    // 3. Get db dump
    context.log('DUMP SOURCE');
    const sourceDbDump = await getDbDump(sourceSql);

    // 4. Copy the dump into the newly created db
    context.log('COPY INTO TARGET');
    await Promise.all(
        sourceDbDump.map(
            // @TODO: perhaps this would be a good use case for transactions
            ([tableName, rows]) => {
                if (rows.length == 0) return Promise.resolve();

                return targetSql`INSERT INTO ${targetSql(tableName)} ${targetSql(rows)}`;
            }
        )
    );

    // 5. Verify, that copy succeeded
    context.log('DUMP TARGET');
    const targetDbDump = await getDbDump(targetSql);
    const isAcurateMatch = JSON.stringify(sourceDbDump) == JSON.stringify(targetDbDump);

    context.res = {
        status: 200,
        body: JSON.stringify({
            isAcurateMatch,
            message: '',
        }),
        headers: { 'Content-Type': 'application/json' }, // so that postman formats the response nicely
    };
};

export default httpTrigger;
