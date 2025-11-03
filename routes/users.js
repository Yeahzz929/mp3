var User = require('../models/user');
var Task = require('../models/task');
var q = require('../utils/query');

module.exports = function (router) {
    // GET /api/users
    router.get('/users', async function (req, res) {
        try {
            var params = q.extractQueryParams(req, { limit: undefined });
            if (params.count) {
                var countQuery = User.find(params.where || {});
                var count = await countQuery.countDocuments();
                return q.ok(res, count);
            }
            var query = User.find(params.where || {});
            query = q.applyQueryParams(query, params);
            var users = await query.exec();
            return q.ok(res, users);
        } catch (err) {
            var msg = q.readableError(err);
            var code = err && err.statusCode ? err.statusCode : 500;
            if (code === 400) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // POST /api/users
    router.post('/users', async function (req, res) {
        try {
            var payload = req.body || {};
            if (!payload.name) return q.badRequest(res, "Field 'name' is required");
            if (!payload.email) return q.badRequest(res, "Field 'email' is required");
            var user = new User({
                name: payload.name,
                email: payload.email,
                pendingTasks: Array.isArray(payload.pendingTasks) ? payload.pendingTasks : []
            });
            await user.save();
            return q.created(res, user);
        } catch (err) {
            var msg = (err && err.code === 11000) ? 'Email must be unique' : q.readableError(err);
            if (err && (err.name === 'ValidationError' || err.code === 11000)) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // GET /api/users/:id (with select support)
    router.get('/users/:id', async function (req, res) {
        try {
            var params = q.extractQueryParams(req, {});
            var projection = params.select || undefined;
            var user = await User.findById(req.params.id, projection).exec();
            if (!user) return q.notFound(res, 'User not found');
            return q.ok(res, user);
        } catch (err) {
            var msg = q.readableError(err);
            if (err && err.statusCode === 400) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // PUT /api/users/:id
    router.put('/users/:id', async function (req, res) {
        try {
            var payload = req.body || {};
            // If email/name provided, validate
            if (payload.email === '') return q.badRequest(res, "Field 'email' is required");
            if (payload.name === '') return q.badRequest(res, "Field 'name' is required");

            var user = await User.findById(req.params.id).exec();
            if (!user) return q.notFound(res, 'User not found');

            if (payload.name !== undefined) user.name = payload.name;
            if (payload.email !== undefined) user.email = payload.email;

            // If pendingTasks specified, sync tasks to point back to this user
            if (payload.pendingTasks !== undefined) {
                // Normalize pendingTasks to array (body-parser may parse as string or array)
                var pendingTasksArray = [];
                if (Array.isArray(payload.pendingTasks)) {
                    pendingTasksArray = payload.pendingTasks;
                } else if (typeof payload.pendingTasks === 'string') {
                    // Try to parse as JSON array or comma-separated string
                    try {
                        pendingTasksArray = JSON.parse(payload.pendingTasks);
                        if (!Array.isArray(pendingTasksArray)) {
                            pendingTasksArray = [payload.pendingTasks];
                        }
                    } catch (e) {
                        pendingTasksArray = payload.pendingTasks.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
                    }
                } else {
                    return q.badRequest(res, "Field 'pendingTasks' must be an array");
                }

                // Remove this user from any tasks currently referencing them but not in new list
                var newSet = new Set(pendingTasksArray.map(String));
                // Fetch tasks currently assigned to this user and not completed where ID not in newSet
                var tasksToUnassign = await Task.find({ assignedUser: String(user._id) }).exec();
                for (var i=0;i<tasksToUnassign.length;i++){
                    var t = tasksToUnassign[i];
                    if (!newSet.has(String(t._id))) {
                        t.assignedUser = "";
                        t.assignedUserName = "unassigned";
                        await t.save();
                    }
                }

                // Assign each task in new list to this user
                for (var j=0;j<pendingTasksArray.length;j++){
                    var taskId = String(pendingTasksArray[j]);
                    var task = await Task.findById(taskId).exec();
                    if (task) {
                        if (!task.completed) {
                            task.assignedUser = String(user._id);
                            task.assignedUserName = user.name;
                        } else {
                            // completed tasks should not be pending
                            task.assignedUser = String(user._id);
                            task.assignedUserName = user.name;
                        }
                        await task.save();
                    }
                }

                // Set user's pendingTasks = only non-completed tasks from provided list
                var validPending = [];
                for (var k=0;k<pendingTasksArray.length;k++){
                    var chk = await Task.findById(String(pendingTasksArray[k])).exec();
                    if (chk && !chk.completed) validPending.push(String(chk._id));
                }
                user.pendingTasks = validPending;
            }

            await user.save();
            return q.ok(res, user);
        } catch (err) {
            var msg = (err && err.code === 11000) ? 'Email must be unique' : q.readableError(err);
            if (err && (err.name === 'ValidationError' || err.code === 11000 || err.statusCode === 400)) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // DELETE /api/users/:id
    router.delete('/users/:id', async function (req, res) {
        try {
            var user = await User.findById(req.params.id).exec();
            if (!user) return q.notFound(res, 'User not found');

            // For this user's NOT completed tasks, set to unassigned
            await Task.updateMany({ assignedUser: String(user._id), completed: false }, { $set: { assignedUser: "", assignedUserName: "unassigned" } }).exec();

            // Remove user
            await user.remove();
            return q.noContent(res);
        } catch (err) {
            var msg = q.readableError(err);
            return q.serverError(res, msg);
        }
    });

    return router;
}


