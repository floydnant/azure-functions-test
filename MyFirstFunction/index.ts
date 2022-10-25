import { AzureFunction, Context, HttpRequest } from '@azure/functions'

const httpTrigger: AzureFunction = async function (
    context: Context,
    _req: HttpRequest
) {
    context.log('My first function was triggered, id: ', context.invocationId)

    const name = context.req?.query.name || context.req?.body.name
    context.res = {
        body: name ? `¡Hola, ${name}!, Que tal?` : `¿Como te llamas?`,
    }

    // context.log('HTTP trigger function processed a request.');
    // const name = (req.query.name || (req.body && req.body.name));
    // const responseMessage = name
    //     ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    //     : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

    // context.res = {
    //     // status: 200, /* Defaults to 200 */
    //     body: responseMessage
    // };
}

export default httpTrigger
