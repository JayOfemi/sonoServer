const { DefaultAzureCredential } =  require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
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

        const model = request.body.model;
        const messages = request.body.messages;
        const max_tokens = request.body.max_tokens;
        const temperature = request.body.temperature;

        context.log('>>>>>>>>>>>>>>>Prompt: ', messages);

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
        context.res = { status: 500, body: "Error calling OpenAI API" };
    }

    context.done();
}