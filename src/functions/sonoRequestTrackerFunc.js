const azure = require('azure-storage');

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

            // Retrieve the entity from the table
            tableService.retrieveEntity(tableName, userId, tableRowName, (error, result, response) => {
                if(!error) {
                    // If the entity exists, return the RequestCount
                    context.res = {
                        status: 200,
                        body: result.RequestCount._,
                    };
                    context.done();
                } else if(error.code === 'ResourceNotFound') {
                    // If the entity does not exist, insert a new one
                    const entity = {
                        PartitionKey: userId,
                        RowKey: tableRowName,
                        RequestCount: 10,
                        Timestamp: new Date()
                    };

                    tableService.insertEntity(tableName, entity, (insertError, insertResult, insertResponse) => {
                        if(!insertError) {
                            context.res = {
                                status: 201,
                                body: entity.RequestCount._
                            };
                        } else {
                            context.res = {
                                status: 500,
                                body: ">>>>>>>>>>>>>>>>>Error inserting entity: " + insertError.message
                            };
                        }
                        context.done();
                    });
                } else {
                    context.res = {
                        status: 500,
                        body: ">>>>>>>>>>>>>>>>>Error retrieving entity: " + error.message
                    };
                    context.done();
                }
            });
        } catch (err) {
            context.res = {
                status: 500,
                body: ">>>>>>>>>>>>>>>>>Error: " + err.message
            };
            context.done();
        }
    } else {
        context.res = {
            status: 400,
            body: "Please provide a user ID in the request parameters."
        };
        context.done();
    }
};
