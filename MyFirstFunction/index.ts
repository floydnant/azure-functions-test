import { AzureFunction, Context, HttpRequest } from '@azure/functions'

const handler: AzureFunction = async (context, req: HttpRequest) => {
    context.log('My first function was triggered, id: ', context.invocationId)

    const name = req.query.name || req.body.name
    context.res = {
        // status: 200, /* Defaults to 200 */
        body: name ? `¡Hola, ${name}!, Que tal?` : `¿Como te llamas?`,
    }
}

export default handler
