import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import type Axios from 'axios'
const axios = require('axios') as typeof Axios

const getAuthHeader = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const { neonApiKey, neonProjectId } = req.body

    const prefix = 'pr-'
    type Response = {
        id: number
        created_at: string
        updated_at: string
        project_id: string
        owner_id: number
        name: string
    }[]
    const databases = await axios
        .get(
            `https://console.neon.tech/api/v1/projects/${neonProjectId}/databases`,
            getAuthHeader(neonApiKey)
        )
        .then(res => res.data as Response)
        .catch(err => context.log('BULLSHIT HAPPENED (GET):', err))
    if (!databases) return

    const databasesToDrop = databases.filter(db => db.name.startsWith(prefix))

    for (const { id, name } of databasesToDrop) {
        context.log('NOW DROPPING:', name)
        await dropDb(id, 0)
    }

    context.res = {
        body: `Dropped ${databasesToDrop.length} databases prefixed with '${prefix}'.`,
    }

    async function dropDb(id: number, retry: number) {
        await new Promise(resolve => {
            context.log('ARTIFICIAL TIMEOUT...')
            setTimeout(resolve, 4000)
        })

        context.log('TRY:', retry)

        await axios
            .delete(
                `https://console.neon.tech/api/v1/projects/${neonProjectId}/databases/${id}`,
                getAuthHeader(neonApiKey)
            )
            .then(() => context.log('NICE!'))
            .catch(err => {
                context.log('FUCK, LET ME RETRY THAT REAL QUICK...')
                dropDb(id, ++retry)
            })
    }
}

export default httpTrigger
