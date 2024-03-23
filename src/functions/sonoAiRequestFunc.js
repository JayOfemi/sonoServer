const { DefaultAzureCredential } =  require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const azure = require('azure-storage');
const { promisify } = require('util');
const OpenAI = require('openai');

module.exports = async function (context, request) {
    context.log('Sono AI request function processed a request.');

    let isUsingSonoApiKey = false;

    const userOptions = request.body.options;
    let apiKey = userOptions?.userApiKey;
    const userId = userOptions?.userId;

    const userInput = request.body.input;
    const model = request.body.model;
    const max_tokens = request.body.max_tokens;
    const temperature = request.body.temperature;

    if(!apiKey) {
        // Use sono key
        isUsingSonoApiKey = true;

        const keyVaultName = process.env["key_vault_name"]; // Set in Function App Configuration settings
        const kvUri = `https://${keyVaultName}.vault.azure.net`;

        const credential = new DefaultAzureCredential();

        const client = new SecretClient(kvUri, credential);
        const secretName = "openai-api-key"; // The name of secret in Azure Key Vault

        try {
            const secretBundle = await client.getSecret(secretName);
            apiKey = secretBundle.value;
        } catch (error) {
            context.log(`Error fetching secret: ${error}`);
        }
    }

    if(!apiKey) {
        context.res = { status: 500, body: "API Key not found." };
        context.done();
        return;
    }
    
    try {

        const messages = GeneratePrompt(userInput, userOptions);

        context.log('>>>>>>>>>>>>>>>Prompt: ', messages);

        if(!userId) {
            context.res = {
                status: 400,
                body: "Please provide a user ID in the request parameters."
            };
            context.done();
            return;
        }

        if(isUsingSonoApiKey) {
            // Update request count
            const tableName = 'sonoRequestsTable';
            const tableRowName = 'userRequests';
            const tableService = azure.createTableService(process.env.AzureWebJobsStorage);

            // Retrieve the entity from the table
            const result = await promisify(tableService.retrieveEntity).bind(tableService)(tableName, userId, tableRowName);

            // Decrement requestCount
            if(result.RequestCount._ > 0) {
                result.RequestCount._--;
            } else {
                if(userId !== process.env.OWNER_ID) {
                    context.res = {
                        status: 400,
                        body: "Out of requests."
                    };
                    context.done();
                    return;
                }
            }

            // Update the entity in the table
            await promisify(tableService.insertOrReplaceEntity).bind(tableService)(tableName, result);
        }

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

const GeneratePrompt = (userInput, options) => {
    
    const currentMood = userInput[0].toUpperCase() + userInput.slice(1).toLowerCase();

    const userPrompt = "Using valid JSON format," +		
        `Suggest ${options.itemCount} songs in the ${options.genre} genre to play ${currentMood}`


    const sampleUserPrompt = "Using valid JSON format, Suggest 3 songs in the rap genre to play when i am in the following mood or situation. I am in a happy mood."

    const sampleAiResponse = "" +
    '{' +
        '"songs": [' +
            '{ "name": "Good Life", "artist": "Kanye West", "album": "Graduation" },' +
            '{ "name": "I Gotta Feeling", "artist": "The Black Eyed Peas", "album": "The E.N.D." },' +
            '{ "name": "Uptown Funk", "artist": "Mark Ronson ft. Bruno Mars", "album": "Uptown Special" }' +
        ']' +
    '}';


    const sampleUserPrompt2 = "Using valid JSON format, Suggest 5 songs in the rap genre to play when i am in the following mood or situation. I am in a sad mood.";

    const sampleAiResponse2 = "" +
    '{' +
        '"songs": [' +
            '{ "name": "Stan", "artist": "Eminem", "album": "The Marshall Mathers LP" },' +
            '{ "name": "Changes", "artist": "2Pac", "album": "Greatest Hits" },' +
            '{ "name": "See You Again", "artist": "Wiz Khalifa ft. Charlie Puth", "album": "Furious 7: Original Motion Picture Soundtrack" },' +
            '{ "name": "1-800-273-8255", "artist": "Logic ft. Alessia Cara, Khalid", "album": "Everybody" },' +
            '{ "name": "Lucid Dreams", "artist": "Juice WRLD", "album": "Goodbye & Good Riddance" }' +
        ']' +
    '}';

    return [
        {"role": "system", "content": "You are a helpful, content curation assistant that provides the best possible recommendation for a very dear person. " + 
            "Use the following step-by-step instructions to respond to user inputs. " +	
            "Step 1 - The user will provide you with their current mood or what they are doing, how many songs they want and in what genre. " +
            "Step 2 - Your goal is to recommend music that they are most likely to enjoy given the prompt the user provided. " +
            "First, think about how a song would fit with the user's current mood or situation. Consider tempo, lyrics, beat composition, and also popularity of the song. " + 
            "You are straight to the point. Your response should not contain anything other than the list of what they want. You only recommend songs in the genre they specified. " + 
            "Items in the list should be unique and there should be no duplicates. You never repeat the same songs on the list." + 
            "You respond to every request with valid JSON that can be parsed. You do not respond with anything other than the JSON. Do not finish you responses with greetings or other remarks."},
        {"role": "system", "name":"example_user", "content": `${sampleUserPrompt}`},
        {"role": "system", "name": "example_assistant", "content": `${sampleAiResponse}`},
        {"role": "system", "name":"example_user", "content": `${sampleUserPrompt2}`},
        {"role": "system", "name": "example_assistant", "content": `${sampleAiResponse2}`},
        {"role": "user", "content": `${userPrompt}`},
    ];
};