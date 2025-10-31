function parseJSONParam(value, name) {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(value);
    } catch (e) {
        var err = new Error("Invalid JSON in '" + name + "'");
        err.statusCode = 400;
        throw err;
    }
}

function applyQueryParams(modelQuery, params) {
    var where = params.where;
    var sort = params.sort;
    var select = params.select;
    var skip = params.skip;
    var limit = params.limit;
    if (where) modelQuery = modelQuery.find(where);
    if (sort) modelQuery = modelQuery.sort(sort);
    if (select) modelQuery = modelQuery.select(select);
    if (skip !== undefined) modelQuery = modelQuery.skip(Number(skip));
    if (limit !== undefined) modelQuery = modelQuery.limit(Number(limit));
    return modelQuery;
}

function extractQueryParams(req, defaults) {
    // support legacy 'filter' as alias of 'select'
    var where = parseJSONParam(req.query.where, 'where');
    var sort = parseJSONParam(req.query.sort, 'sort');
    // alias
    var selectRaw = req.query.select !== undefined ? req.query.select : req.query.filter;
    var select = parseJSONParam(selectRaw, selectRaw !== undefined ? 'select' : 'filter');
    var skip = req.query.skip !== undefined ? Number(req.query.skip) : undefined;
    var limit = req.query.limit !== undefined ? Number(req.query.limit) : defaults && defaults.limit;
    var count = (req.query.count === 'true' || req.query.count === true);
    return { where: where, sort: sort, select: select, skip: skip, limit: limit, count: count };
}

function ok(res, data, status) {
    res.status(status || 200).json({ message: 'OK', data: data });
}

function created(res, data) {
    res.status(201).json({ message: 'Created', data: data });
}

function noContent(res) {
    res.status(204).send();
}

function notFound(res, msg) {
    res.status(404).json({ message: msg || 'Not Found', data: [] });
}

function badRequest(res, msg) {
    res.status(400).json({ message: msg || 'Bad Request', data: [] });
}

function serverError(res, msg) {
    res.status(500).json({ message: msg || 'Server Error', data: [] });
}

function readableError(err) {
    if (!err) return 'Unknown error';
    if (err.statusCode) return err.message;
    if (err.name === 'ValidationError') return 'Validation failed: ' + Object.values(err.errors).map(function(e){return e.message || e.kind || e.path;}).join(', ');
    if (err.code === 11000) return 'Duplicate key error';
    return err.message || 'Unknown error';
}

module.exports = {
    parseJSONParam: parseJSONParam,
    applyQueryParams: applyQueryParams,
    extractQueryParams: extractQueryParams,
    ok: ok,
    created: created,
    noContent: noContent,
    notFound: notFound,
    badRequest: badRequest,
    serverError: serverError,
    readableError: readableError
};


