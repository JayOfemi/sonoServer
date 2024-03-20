const azure = require('azure-storage');
const { promisify } = require('util');

module.exports = async function (context, req) {
    context.log('Sono request tracker function processed a request.');

    // Retrieve the user ID from the request parameters
    const userId = req.query.userId || (req.body && req.body.userId);

    if(userId) {
        try {
            // Retrieve the Azure Storage account connection string from application settings
            const connectionString = process.env.AzureWebJobsStorage;

            // Create a table service object
            const tableService = azure.createTableService(connectionString);

            // Define the table name
            const tableName = 'sonoRequestsTable';
            const tableRowName = 'userRequests';

            // Promisify the retrieveEntity function
            const retrieveEntityAsync = promisify(tableService.retrieveEntity).bind(tableService);

            // Retrieve the entity from the table
            const result = await retrieveEntityAsync(tableName, userId, tableRowName);

            // If the entity exists, return the RequestCount
            context.res = {
                status: 200,
                body: result.RequestCount._
            };
        } catch(error) {
            if(error.code === 'ResourceNotFound') {
                // If the entity does not exist, insert a new one
                const entity = {
                    PartitionKey: userId,
                    RowKey: tableRowName,
                    RequestCount: 10,
                    Timestamp: new Date()
                };

                // Insert the entity into the table
                await promisify(tableService.insertEntity).bind(tableService)(tableName, entity);

                context.res = {
                    status: 201,
                    body: entity.RequestCount._
                };
            } else {
                context.res = {
                    status: 500,
                    body: "Error retrieving or inserting entity: " + error
                };
            }
        }
    } else {
        context.res = {
            status: 400,
            body: "Please provide a user ID in the request parameters."
        };
    }
};