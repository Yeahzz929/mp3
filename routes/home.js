module.exports = function (router) {

    var homeRoute = router.route('/');

    homeRoute.get(function (req, res) {
        var connectionString = process.env.TOKEN;
        res.json({ 
            message: 'OK',
            data: { connectionString: connectionString || 'Not set' }
        });
    });

    return router;
}
