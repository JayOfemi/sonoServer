const { DefaultAzureCredential } =  require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const azure = require('azure-storage');
const { promisify } = require('util');
const OpenAI = require('openai');

module.exports = async function (context, request) {
    context.log('Sono AI request function processed a request.');

    const keyVaultName = process.env["key_vault_name"]; // Set this in your Function App Configuration settings
    const kvUri = `https://${keyVaultName}.vault.azure.net`;

    const credential = new DefaultAzureCredential();

    const client = new SecretClient(kvUri, credential);
    const secretName = "openai-api-key"; // The name of secret in Azure Key Vault

    let apiKey;
    try {
        const secretBundle = await client.getSecret(secretName);
        apiKey = secretBundle.value;
    } catch (error) {
        context.log(`Error fetching secret: ${error}`);
        context.res = { status: 500, body: "Error fetching OpenAI API Key from Key Vault." };
    }

    if (!apiKey) {
        context.res = { status: 500, body: "API Key not found." };
    }
    
    try {

        const userId = request.body.userid;
        const model = request.body.model;
        const messages = request.body.messages;
        const max_tokens = request.body.max_tokens;
        const temperature = request.body.temperature;

        context.log('>>>>>>>>>>>>>>>Prompt: ', messages);

        // Update request count
        if(!userId) {
            context.res = {
                status: 400,
                body: "Please provide a user ID in the request parameters."
            };
            context.done();
            return;
        }

        const tableName = 'sonoRequestsTable';
        const tableRowName = 'userRequests';
        const tableService = azure.createTableService(process.env.AzureWebJobsStorage);

        // Retrieve the entity from the table
        const result = await promisify(tableService.retrieveEntity).bind(tableService)(tableName, userId, tableRowName);

        // Decrement requestCount
        if(result.RequestCount._ > 0) {
            result.RequestCount._--;
        }

        // Update the entity in the table
        await promisify(tableService.insertOrReplaceEntity).bind(tableService)(tableName, result);

        // Make api call
        const openAi = new OpenAI({
            apiKey: apiKey,
        });

        const aiResponse = await openAi.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: max_tokens,
            temperature: temperature,
        });

        context.log('>>>>>>>>>>>>>>>Response: ', aiResponse);
        context.res = { body: aiResponse };

    } catch (error) {
        context.log(`>>>>>>>>>>>>>>>Error calling OpenAI API: ${error}`);
        context.res = { status: 500, body: "Error calling OpenAI API: " + error };
    }

    context.done();
}