var Task = require('../models/task');
var User = require('../models/user');
var q = require('../utils/query');

async function addTaskToUserPending(userId, task) {
    if (!userId) return;
    var user = await User.findById(userId).exec();
    if (!user) return;
    var tid = String(task._id);
    if (!task.completed) {
        if (!user.pendingTasks.some(function(x){return String(x) === tid;})) {
            user.pendingTasks.push(tid);
            await user.save();
        }
    } else {
        // ensure completed tasks are not in pendingTasks
        var filtered = user.pendingTasks.filter(function(x){ return String(x) !== tid; });
        if (filtered.length !== user.pendingTasks.length) {
            user.pendingTasks = filtered;
            await user.save();
        }
    }
}

async function removeTaskFromUserPending(userId, taskId) {
    if (!userId) return;
    var user = await User.findById(userId).exec();
    if (!user) return;
    var before = user.pendingTasks.length;
    user.pendingTasks = user.pendingTasks.filter(function(x){ return String(x) !== String(taskId); });
    if (user.pendingTasks.length !== before) await user.save();
}

module.exports = function (router) {
    // GET /api/tasks
    router.get('/tasks', async function (req, res) {
        try {
            var params = q.extractQueryParams(req, { limit: 100 });
            if (params.count) {
                var countQuery = Task.find(params.where || {});
                var count = await countQuery.countDocuments();
                return q.ok(res, count);
            }
            var query = Task.find(params.where || {});
            query = q.applyQueryParams(query, params);
            var tasks = await query.exec();
            return q.ok(res, tasks);
        } catch (err) {
            var msg = q.readableError(err);
            var code = err && err.statusCode ? err.statusCode : 500;
            if (code === 400) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // POST /api/tasks
    router.post('/tasks', async function (req, res) {
        try {
            var payload = req.body || {};
            if (!payload.name) return q.badRequest(res, "Field 'name' is required");
            if (payload.deadline === undefined || payload.deadline === null || payload.deadline === '') return q.badRequest(res, "Field 'deadline' is required");
            
            // Handle deadline: could be timestamp (number/string) or date string
            var deadline;
            if (typeof payload.deadline === 'number' || (typeof payload.deadline === 'string' && /^\d+$/.test(payload.deadline))) {
                deadline = new Date(Number(payload.deadline));
            } else {
                deadline = new Date(payload.deadline);
            }
            if (isNaN(deadline.getTime())) return q.badRequest(res, "Field 'deadline' must be a valid date");

            // Handle completed: could be string "true"/"false" or boolean
            var completed = false;
            if (payload.completed !== undefined && payload.completed !== null && payload.completed !== '') {
                if (typeof payload.completed === 'string') {
                    completed = payload.completed.toLowerCase() === 'true';
                } else {
                    completed = Boolean(payload.completed);
                }
            }

            // Handle assignedUser: empty string should be treated as unassigned
            var assignedUser = (payload.assignedUser && payload.assignedUser.trim() !== '') ? String(payload.assignedUser) : "";
            var assignedUserName = payload.assignedUserName || (assignedUser ? "" : "unassigned");

            var task = new Task({
                name: payload.name,
                description: payload.description || "",
                deadline: deadline,
                completed: completed,
                assignedUser: assignedUser,
                assignedUserName: assignedUserName
            });
            await task.save();

            // maintain consistency pendingTasks
            if (task.assignedUser) {
                await addTaskToUserPending(task.assignedUser, task);
                if (!task.assignedUserName) {
                    var user = await User.findById(task.assignedUser).exec();
                    if (user) {
                        task.assignedUserName = user.name;
                        await task.save();
                    }
                }
            }

            return q.created(res, task);
        } catch (err) {
            var msg = q.readableError(err);
            if (err && (err.name === 'ValidationError' || err.statusCode === 400)) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // GET /api/tasks/:id (with select support)
    router.get('/tasks/:id', async function (req, res) {
        try {
            var params = q.extractQueryParams(req, {});
            var projection = params.select || undefined;
            var task = await Task.findById(req.params.id, projection).exec();
            if (!task) return q.notFound(res, 'Task not found');
            return q.ok(res, task);
        } catch (err) {
            var msg = q.readableError(err);
            if (err && err.statusCode === 400) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // PUT /api/tasks/:id
    router.put('/tasks/:id', async function (req, res) {
        try {
            var payload = req.body || {};
            var task = await Task.findById(req.params.id).exec();
            if (!task) return q.notFound(res, 'Task not found');

            var oldAssignedUser = task.assignedUser;
            var oldCompleted = task.completed;

            if (payload.name !== undefined) task.name = payload.name;
            if (payload.description !== undefined) task.description = payload.description;
            if (payload.deadline !== undefined && payload.deadline !== null && payload.deadline !== '') {
                // Handle deadline: could be timestamp (number/string) or date string
                var d;
                if (typeof payload.deadline === 'number' || (typeof payload.deadline === 'string' && /^\d+$/.test(payload.deadline))) {
                    d = new Date(Number(payload.deadline));
                } else {
                    d = new Date(payload.deadline);
                }
                if (isNaN(d.getTime())) return q.badRequest(res, "Field 'deadline' must be a valid date");
                task.deadline = d;
            }
            if (payload.completed !== undefined && payload.completed !== null && payload.completed !== '') {
                // Handle completed: could be string "true"/"false" or boolean
                if (typeof payload.completed === 'string') {
                    task.completed = payload.completed.toLowerCase() === 'true';
                } else {
                    task.completed = Boolean(payload.completed);
                }
            }
            if (payload.assignedUser !== undefined) {
                task.assignedUser = (payload.assignedUser && payload.assignedUser.trim() !== '') ? String(payload.assignedUser) : "";
            }
            if (payload.assignedUserName !== undefined) task.assignedUserName = payload.assignedUserName;

            await task.save();

            // Consistency maintenance
            // If assignedUser changed, remove from old user's pending
            if (oldAssignedUser && oldAssignedUser !== task.assignedUser) {
                await removeTaskFromUserPending(oldAssignedUser, task._id);
            }
            // If now has assignedUser, ensure pendingTasks update
            if (task.assignedUser) {
                await addTaskToUserPending(task.assignedUser, task);
                // If assignedUserName provided empty/undefined, sync from user
                if (!task.assignedUserName) {
                    var au = await User.findById(task.assignedUser).exec();
                    if (au) {
                        task.assignedUserName = au.name;
                        await task.save();
                    }
                }
            } else {
                // Unassigned, remove from old user's pending if needed
                if (oldAssignedUser) await removeTaskFromUserPending(oldAssignedUser, task._id);
                task.assignedUserName = 'unassigned';
                await task.save();
            }

            // If completion changed from false->true, ensure it's removed from pending
            if (!oldCompleted && task.completed && task.assignedUser) {
                await removeTaskFromUserPending(task.assignedUser, task._id);
            }

            return q.ok(res, task);
        } catch (err) {
            var msg = q.readableError(err);
            if (err && (err.name === 'ValidationError' || err.statusCode === 400)) return q.badRequest(res, msg);
            return q.serverError(res, msg);
        }
    });

    // DELETE /api/tasks/:id
    router.delete('/tasks/:id', async function (req, res) {
        try {
            var task = await Task.findById(req.params.id).exec();
            if (!task) return q.notFound(res, 'Task not found');
            var assignedUser = task.assignedUser;
            await task.remove();
            if (assignedUser) await removeTaskFromUserPending(assignedUser, task._id);
            return q.noContent(res);
        } catch (err) {
            var msg = q.readableError(err);
            return q.serverError(res, msg);
        }
    });

    return router;
}


