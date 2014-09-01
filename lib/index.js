var _ = require('underscore');
var _s = require('underscore.string');
var errors = require('restberry-errors');
var mongoose = require('mongoose');
var util = require('util');
var utils = require('restberry-utils');


function RestberryMongoose() {
    this.mongoose = mongoose;
    this.restberry = null;
};

RestberryMongoose.prototype.use = function(next) {
    next(this);
};

RestberryMongoose.prototype.addMethods = function(schema, methods) {
    var customMethods = _.clone(schema.methods);
    schema.methods = _.clone(methods);
    for (var key in customMethods) {
        schema.methods[key] = customMethods[key];
    }
};

RestberryMongoose.prototype.addStatics = function(schema, statics) {
    var customStatics = _.clone(schema.statics);
    schema.statics = _.clone(statics);
    for (var key in customStatics) {
        schema.statics[key] = customStatics[key];
    }
};

RestberryMongoose.prototype.schema = function(schema) {
    var schema = new mongoose.Schema(schema);
    this.addMethods(schema, methods);
    this.addStatics(schema, statics);
    return schema;
};

RestberryMongoose.prototype.get = function(name) {
    try {
        return mongoose.model(name);
    } catch (e) {
        // Do nothing
    }
    return null;
};

RestberryMongoose.prototype.set = function(name, schema) {
    return mongoose.model(name, schema);
};

var methods = {
    authenticate: function(plainText) {
        if (this.password) {
            var pwd = this.password;
            if (pwd.encrypted) {
                return this.encryptPassword(plainText) === pwd.encrypted;
            } else {
                return plainText === pwd;
            }
        }
        return true;
    },

    encryptPassword: function (password) {
        var encrypted = '';
        if (password) {
            try {
                var m = utils.sha1encrypt;
                encrypted = m(this.password.salt, password);
            } catch (err) {
                // Do nothing...
            };
        };
        return encrypted;
    },

    removeAndVerify: function(req, res, next) {
        var self = this;
        self._isAuthorized(req, res, function() {
            self.remove(function(err) {
                if (err) {
                    errors.throwBadRequest(err, req, res, next);
                } else {
                    next();
                }
            });
        });
    },

    href: function(req, childModel) {
        var self = this;
        var pluralName = self.constructor.pluralName();
        var href = req.apiPath + '/' + pluralName + '/' + self.id;
        if (childModel)  href += '/' + childModel.pluralName();
        return href;
    },

    saveAndVerify: function(req, res, next) {
        var self = this;
        self._isAuthorized(req, res, function() {
            self.save(function(err, obj) {
                if (err) {
                    property = self.constructor.singleName();
                    if (_s.include(err.message, 'E11000')) {
                        var err = {
                            property: property,
                        };
                        errors.throwConflict(err, req, res, next);
                    } else {
                        err.objName = property;
                        errors.throwBadRequest(err, req, res, next);
                    }
                } else {
                    next(obj);
                }
            });
        });
    },

    toJSON: function(req, res, nested, next, fieldName) {
        var self = this;
        self._isAuthorized(req, res, function() {
            self._populate(req, res, fieldName, function(popObj) {
                var ret = self.toObject({hide: '__v'});
                _.each(self.constructor.hiddenFields(), function(field) {
                    delete ret[field];
                });
                var d = {
                    href: self.href(req),
                    id: ret._id,
                };
                if (popObj)  d = _applyFields(d, ret, req.fields, popObj);
                if (nested) {
                    var dd = {};
                    dd[self.constructor.singleName()] = d;
                    d = dd;
                }
                next(d);
            });
        });
    },

    updateAndVerify: function(req, res, data, next) {
        var self = this;
        self.constructor.validateData(req, res, data, function() {
            for (var key in data) {
                var val = data[key];
                self[key] = val;
            }
            self.timestampUpdated = new Date();
            self.saveAndVerify(req, res, next);
        });
    },

    isAuthorized: function(req, res, next) {
        var self = this;
        var authModel = req.authModel;
        if (authModel) {
            self.constructor.getFieldNameOfModel(authModel, function(fieldName) {
                var fieldId = null;
                if (fieldName && self[fieldName]) {
                    fieldId = self[fieldName].toString();
                }
                var userId = req.user._id.toString();
                next(!(fieldName && fieldId !== userId));
            });
        } else {
            errors.throwServerIssue({}, req, res, next);
        }
    },

    _isAuthorized: function(req, res, next) {
        var self = this;
        if (req.authenticate) {
            self.isAuthorized(req, res, function(isAuthorized) {
                if (isAuthorized) {
                    next();
                } else {
                    errors.throwUnauthorized({}, req, res, next);
                }
            });
        } else {
            next();
        }
    },

    populate: function(req, res, next) {
        next({});
    },

    _populate: function(req, res, fieldName, next) {
        var self = this;
        if (!fieldName)  fieldName = self.constructor.singleName();
        fieldName = fieldName.split('.').pop();
        if (!_.contains(req.expand, fieldName)) {
            next();
            return;
        }
        req = _.clone(req);
        req.expand = _.without(req.expand, fieldName);
        self.populate(req, res, function(d) {
            _populateParents(req, res, self, d, next);
        });
    },
};

var statics = {
    createAndVerify: function(req, res, data, next) {
        var self = this;
        self.validateData(req, res, data, function() {
            var obj = new self(data);
            obj.saveAndVerify(req, res, next);
        });
    },

    countAndVerify: function(req, res, query, next) {
        var self = this;
        self.find(query, function(err, objs) {
            if (err) {
                errors.throwBadRequest(err, req, res, next);
            } else if (!objs) {
                next(0);
            } else {
                next(objs.length);
            }
        });
    },

    editableFields: function(req, res) {
        var fields = _extractFieldsFromSchema(this.schema);
        var uneditableFields = ['id'];
        for (var fieldName in this.schema.paths) {
            var field = this.schema.paths[fieldName];
            if (field.options.uneditable) {
                uneditableFields.push(fieldName);
            }
        }
        return _.difference(fields, uneditableFields);
    },

    hiddenFields: function(req, res) {
        var fields = _extractFieldsFromSchema(this.schema);
        var hiddenFields = ['password'];
        for (var fieldName in this.schema.paths) {
            var field = this.schema.paths[fieldName];
            if (field.options.hidden) {
                hiddenFields.push(fieldName);
            }
        }
        return hiddenFields;
    },

    findAndVerify: function(req, res, query, next) {
        var self = this;
        var options = {
            skip: req.offset,
            limit: req.limit,
            sort: req.sort,
        };
        self.find(query, null, options, function(err, objs) {
            if (err) {
                errors.throwBadRequest(err, req, res, next);
            } else if (!objs || objs.length == 0) {
                next([]);
            } else {
                next(objs);
            }
        });
    },

    findByIdAndVerify: function(req, res, id, next) {
        var self = this;
        self.findById(id, function(err, obj) {
            var _notFound = function() {
                var err = {property: self.singleName()};
                errors.throwNotFound(err, req, res, next);
            }
            if (err) {
                if (_s.include(err.message, 'Cast to ObjectId')) {
                    _notFound();
                } else {
                    errors.throwBadRequest(err, req, res, next);
                }
            } else if (!obj) {
                _notFound();
            } else {
                next(obj);
            }
        });
    },

    findOneAndVerify: function(req, res, query, next) {
        var self = this;
        self.findOne(query, function(err, obj) {
            var _notFound = function() {
                var err = {property: self.singleName()};
                errors.throwNotFound(err, req, res, next);
            }
            if (err) {
                errors.throwBadRequest(err, req, res, next);
            } else if (!obj) {
                _notFound();
            } else {
                obj._isAuthorized(req, res, function() {
                    next(obj);
                });
            }
        });
    },

    getParents: function(next) {
        self = this;
        var parents = [];
        var paths = self.schema.paths;
        for (var fieldName in paths) {
            var field = paths[fieldName];
            var ref = null;
            var isArray = false;
            if (field.options.ref) {
                ref = field.options.ref;
            } else if (field.caster && field.caster.options.ref) {
                ref = field.caster.options.ref;
                isArray = true;
            }
            if (ref) {
                parents.push({
                    fieldName: fieldName,
                    model: self.base.model(ref),
                    isArray: isArray,
                });
            }
        }
        next(parents);
    },

    href: function(req) {
        var pluralName = this.pluralName();
        return req.apiPath + '/' + pluralName;
    },

    hrefs: function(req, res, query, next) {
        var self = this;
        self.countAndVerify(req, res, query, function(total) {
            var href = self.href(req);
            var hrefCurrent, hrefFirst, hrefLast;
            var hrefNext = null, hrefPrev = null;
            var limit = parseInt(req.limit);
            var pages = Math.ceil(total / limit);
            var offset = parseInt(req.offset);
            var offsetFirst = 0;
            var offsetLast = limit * (pages - 1);
            var offsetNext = offset + limit;
            var offsetPrev = offset - limit;
            var hrefCurrent = _appendQsOffsetAndLimit(href, offset, limit);
            var hrefFirst = _appendQsOffsetAndLimit(href, offsetFirst, limit);
            var hrefLast = _appendQsOffsetAndLimit(href, offsetLast, limit);
            if (hrefCurrent == hrefFirst)  hrefFirst = null;
            if (hrefCurrent == hrefLast)  hrefLast = null;
            if (offsetNext <= offsetLast) {
                hrefNext = _appendQsOffsetAndLimit(href, offsetNext, limit);
            }
            if (offsetPrev >= offsetFirst) {
                hrefPrev = _appendQsOffsetAndLimit(href, offsetPrev, limit);
            } else if (hrefFirst) {
                hrefPrev = hrefFirst;
            }
            next({
                hrefs: {
                    current: hrefCurrent,
                    first: hrefFirst,
                    next: hrefNext,
                    prev: hrefPrev,
                    last: hrefLast,
                },
                offset: offset,
                limit: limit,
                total: total,
            });
        });
    },

    toJSONs: function(req, res, objs, next, fieldName) {
        var self = this;
        var key = self.pluralName();
        var json = {};
        var d = [];
        fieldName = (fieldName ? fieldName : self.singleName());
        fieldName = fieldName.split('.').pop();
        var expand = _.contains(req.expand, fieldName);
        utils.forEachAndDone(objs, function(obj, iter) {
            if (expand)  req.expand.push(fieldName);
            obj.toJSON(req, res, false, function(json) {
                d.push(json);
                iter();
            }, fieldName);
        }, function() {
            json[key] = d;
            next(json);
        });
    },

    pluralName: function() {
        return this.collection.name;
    },

    singleName: function() {
        return this.modelName.toLowerCase();
    },

    validateData: function(req, res, data, next) {
        var editableFields = this.editableFields(req, res);
        var dataFields = utils.getPaths(data);
        var illegalFields = _.difference(dataFields, editableFields);
        if (illegalFields.length) {
            var err = {
                name: errors.INVALID_INPUT_ERROR,
                modelName: this.singleName(),
                property: illegalFields[0],
            }
            errors.throwBadRequest(err, req, res, next);
        } else if (req.method == 'PUT') {
            var missingFields = _.difference(editableFields, dataFields);
            if (missingFields.length) {
                var err = {
                    name: errors.MISSING_FIELD_ERROR,
                    objName: this.singleName(),
                    property: missingFields[0],
                }
                errors.throwBadRequest(err, req, res, next);
            } else {
                next();
            }
        } else {
            next();
        }
    },

    getFieldNameOfModel: function(m, next) {
        var self = this;
        self.getParents(function(parents) {
            var parentsOfModel = []
            for (var i in parents) {
                var parent = parents[i];
                if (parent.model === m)  parentsOfModel.push(parent);
            }
            utils.forEachAndDone(parentsOfModel, function(parent, iter) {
                next(parent.fieldName, parent.isArray, iter);
            }, function() {
                next();
            });
        });
    },

    getObjectsFromIds: function(req, res, objIds, next) {
        var self = this;
        var objs = [];
        utils.forEachAndDone(objIds, function(objId, iter) {
            self.findByIdAndVerify(req, res, objId, function(obj) {
                objs.push(obj);
                iter();
            });
        }, function() {
            next(objs);
        });
    },
};

var _applyFields = function(d, ret, fields, popObj) {
    var origFields = fields;
    if (!fields || fields.length == 0) {
        fields = _.without(Object.keys(ret), '_id');
        fields = fields.concat(Object.keys(d));
    } else {
        fields = fields.concat(['id', 'href']);
    }
    for (var i in fields) {
        var field = fields[i];
        if (ret[field])  d[field] = ret[field];
    }
    for (var key in popObj) {
        utils.dotSet(d, key, popObj[key]);
    }
    if (origFields.length) {
        for (var key in d) {
            if (fields.indexOf(key) < 0)  delete d[key];
        }
    }
    return d;
};

var _extractFieldsFromSchema = function(schema) {
    var fields = [];
    var paths = Object.keys(schema.paths);
    for (i in paths) {
        var path = paths[i];
        var nestedSchema = schema.paths[path].schema;
        if (nestedSchema) {
            var nestedFields = _extractFieldsFromSchema(nestedSchema);
            for (i in nestedFields) {
                fields.push(path + '.0.' + nestedFields[i]);
            }
        } else if (schema.paths[path].caster) {
            fields.push(path + '.0');
        } else {
            fields.push(path);
        }
    }
    var virtuals = Object.keys(schema.virtuals);
    fields = _.union(fields, virtuals);
    return _.without(fields, '_id', '__v');
};

var _populateParents = function(req, res, obj, d, next) {
    obj.constructor.getParents(function(parents) {
        utils.forEachAndDone(parents, function(parent, iter) {
            var fieldName = parent.fieldName;
            var objId = utils.dotGet(obj, fieldName);
            if (!objId || objId === obj) {
                iter();
                return;
            }
            var populate = function(json) {
                d[fieldName] = json;
                iter();
            };
            if (util.isArray(objId)) {
                var objIds = objId;
                parent.model.getObjectsFromIds(req, res, objIds, function(objs) {
                    parent.model.toJSONs(req, res, objs, function(json) {
                        var key = parent.model.pluralName();
                        populate(json[key]);
                    }, fieldName);
                });
            } else {
                parent.model.findByIdAndVerify(req, res, objId, function(obj) {
                    obj.toJSON(req, res, false, populate, fieldName);
                });
            }
        }, function() {
            next(d);
        });
    });
};

var _appendQsOffsetAndLimit = function(path, offset, limit) {
    return path + '?offset=' + offset + '&limit=' + limit;
};

module.exports = exports = new RestberryMongoose;
