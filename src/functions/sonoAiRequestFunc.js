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

        const prompt = request.body.prompt;
        const temperature = request.body.temperature;

        const promptMessages = [
            {"role": "system", "content": "You are a helpful, content curation assistant that provides the best possible recommendation for a very dear person. " + 
				"Use the following step-by-step instructions to respond to user inputs. " +	
				"Step 1 - The user will provide you with their current mood or what they are doing, how many songs they want and in what genre. " +
				"Step 2 - Your goal is to recommend music that they are most likely to enjoy given the prompt the user provided. " +
				"First, think about how a song would fit with the user's current mood or situation. Consider tempo, lyrics, beat composition, and also popularity of the song. " + 
				"You are straight to the point. Your response should not contain anything other than the list of what they want. You only recommend songs in the genre they specified. " + 
				"Items in the list should be unique and there should be no duplicates. You never repeat the same songs on the list." + 
				"You respond to every request with valid JSON that can be parsed. You do not respond with anything other than the JSON. Do not finish you responses with greetings or other remarks."},

			{"role": "user", "content": `Suggest 10 songs in the rap genre to play when i am ${prompt}.`}
        ]


        const openAi = new OpenAI({
            apiKey: apiKey,
        });

        const aiResponse = await openAi.chat.completions.create({
            // model: "text-davinci-003",
            model: "gpt-4-1106-preview",
            messages: promptMessages,
            max_tokens: 2000,
            temperature: temperature,
        });

        context.res = { body: aiResponse.data };

    } catch (error) {
        context.log(`Error calling OpenAI API: ${error}`);
        context.res = { status: 500, body: "Error calling OpenAI API" };
    }
}