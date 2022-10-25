import { AzureFunction } from '@azure/functions'

export const index: AzureFunction = (context) => {
    context.log('My first function was triggered, id: ', context.invocationId)

    const name = context.req?.query.name
    if (name) return Promise.resolve({ body: `¡Hola, ${name}!, Que tal?` })
    else return Promise.resolve({ body: `¿Como te llamas?` })
}
