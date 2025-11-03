/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    // Root path - API information
    app.get('/', function (req, res) {
        res.json({
            message: 'Welcome to CS409 MP3 API',
            data: {
                endpoints: {
                    users: '/api/users',
                    tasks: '/api/tasks',
                    home: '/api/'
                },
                documentation: 'This is a REST API for managing users and tasks'
            }
        });
    });

    app.use('/api', require('./home.js')(router));
    app.use('/api', require('./users.js')(router));
    app.use('/api', require('./tasks.js')(router));
};
