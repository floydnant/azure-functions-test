import { AzureFunction, HttpRequest } from '@azure/functions'
import type Axios from 'axios'
const axios = require('axios') as typeof Axios

const getAuthHeader = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

type SuccessfulOrError = true | Record<string, string>

const httpTrigger: AzureFunction = async (context, req: HttpRequest) => {
    const {
        sourceDbName,
        targetDbName,
        dbUser,
        dbPassword,

        githubApikey,

        neonApiKey,
        neonProjectId,
        neonDbOwnerId,

        copyDbFunctionKey,
    } = req.body

    // 1. Create new db with neon API
    const neonBody = {
        database: {
            name: targetDbName,
            owner_id: neonDbOwnerId,
        },
    }
    const dbCreationSuccessfulOrError: SuccessfulOrError = await axios
        .post(
            `https://console.neon.tech/api/v1/projects/${neonProjectId}/databases`,
            neonBody,
            getAuthHeader(neonApiKey)
        )
        .then(() => true)
        .catch(err => {
            // context.log('DB CREATION FAILED', err);
            return err.response.data
        })

    if (dbCreationSuccessfulOrError !== true) {
        context.res = {
            status: 400,
            body: JSON.stringify({
                message: 'Something went wrong with neon. Check the logs.',
                response: dbCreationSuccessfulOrError,
            }),
            headers: { 'Content-Type': 'application/json' }, // so that postman formats the response nicely
        }
        return
    }

    const dbHost = `${neonProjectId}.cloud.neon.tech`

    const postgresDbUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}/?options=project%3D${neonProjectId}`
    const migrationCallbackUrl = new URL(`https://${process.env.WEBSITE_HOSTNAME}/api/copy-db`)
    migrationCallbackUrl.search = new URLSearchParams({
        code: copyDbFunctionKey, //@TODO: code is missing here
        sourceDbName,
        targetDbName,
        dbUrl: postgresDbUrl,
    }).toString()
    // context.log('MIGRATION CALLBACK URL', migrationCallbackUrl);

    const prismaDbUrl = `postgresql://<user>:<password>@${dbHost}:5432/${targetDbName}`

    // 2. Dispatch migration workflow
    const ghRepo = 'dein-ding/azure-functions-test' // the repo where the workflow is located
    const ghBody = {
        event_type: 'migration',
        client_payload: {
            branch: sourceDbName,
            db_url: prismaDbUrl.replace('<user>', dbUser).replace('<password>', dbPassword),
            callback_url: migrationCallbackUrl.toString(),
        },
    }
    const dispatchSuccessfulOrError: SuccessfulOrError = await axios
        .post(`https://api.github.com/repos/${ghRepo}/dispatches`, ghBody, getAuthHeader(githubApikey))
        .then(() => true)
        .catch(err => {
            // context.log('WORKFLOW DISPATCH FAILED:', err);
            return err.response.data
        })

    if (dispatchSuccessfulOrError !== true) {
        context.res = {
            status: 422,
            body: JSON.stringify({
                message: 'Something went wrong with github. Check the logs.',
                response: dispatchSuccessfulOrError,
            }),
            headers: { 'Content-Type': 'application/json' }, // so that postman formats the response nicely
        }
        return
    }

    context.res = {
        status: 201,
        body: JSON.stringify({
            prismaDbUrl,
            message: 'Smoothly created db and dispatched migration workflow.',
        }),
        headers: { 'Content-Type': 'application/json' }, // so that postman formats the response nicely
    }
}

export default httpTrigger
