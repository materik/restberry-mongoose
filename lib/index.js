var _ = require('underscore');
var errors = require('restberry-errors');
var modules = require('restberry-modules');
var mongoose = require('mongoose');


function RestberryMongoose() {
    this.mongoose = mongoose;
    this.ObjectId = mongoose.Schema.Types.ObjectId;
};

RestberryMongoose.prototype.__proto__ = modules.odm.prototype;

RestberryMongoose.prototype.connect = function(dbname) {
    mongoose.connect(dbname);
};

RestberryMongoose.prototype.find = function(model, query, options, next) {
    model.find(query, null, options, next);
};

RestberryMongoose.prototype.findById = function(model, id, next) {
    model.findById(id, next);
};

RestberryMongoose.prototype.findOne = function(model, query, next) {
    model.findOne(query, next);
};

RestberryMongoose.prototype.get = function(name) {
    try {
        return mongoose.model(name);
    } catch (e) {
        // Do nothing...
    }
    return null;
};

// TODO(materik): make nicer...
RestberryMongoose.prototype.getFieldNamesEditable = function(model) {
    var schema = model.schema;
    var fields = _extractFieldsFromSchema(schema);
    var editableFields = [];
    _.each(fields, function(fieldName) {
        if (_.contains(['id', '_id'], fieldName))  return;
        var field = schema.paths[fieldName];
        if (!field || !field.options.uneditable) {
            editableFields.push(fieldName);
        }
    });
    return editableFields;
};

// TODO(materik): make nicer...
RestberryMongoose.prototype.getFieldNamesHidden = function(model) {
    var schema = model.schema;
    var fields = _extractFieldsFromSchema(schema);
    var hiddenFields = ['password'];
    _.each(fields, function(fieldName) {
        var field = schema.paths[fieldName];
        if (!field || field.options.hidden) {
            hiddenFields.push(fieldName);
        }
    });
    return hiddenFields;
};

RestberryMongoose.prototype.getFieldsOfModels = function(model, next) {
    self = this;
    var fields = [];
    var paths = model.schema.paths;
    for (var fieldName in paths) {
        var isArray, ref;
        var field = paths[fieldName];
        if (field.options.ref) {
            ref = field.options.ref;
            isArray = false;
        } else if (field.caster && field.caster.options.ref) {
            ref = field.caster.options.ref;
            isArray = true;
        } else {
            ref = null;
        }
        if (ref) {
            fields.push({
                fieldName: fieldName,
                model: self.restberry.model(ref),
                isArray: isArray,
            });
        }
    }
    next(fields);
},

RestberryMongoose.prototype.pluralName = function(model) {
    return model.collection.name;
};

// need interface
RestberryMongoose.prototype.getQueryIdInList = function(ids) {
    return {_id: {$in: ids}};
};

RestberryMongoose.prototype.remove = function(obj, next) {
    obj.remove(next);
};

RestberryMongoose.prototype.schema = function(schema) {
    return new mongoose.Schema(schema);
};

RestberryMongoose.prototype.save = function(obj, next) {
    obj.save(next);
};

RestberryMongoose.prototype.set = function(name, schema) {
    return mongoose.model(name, schema);
};

RestberryMongoose.prototype.singleName = function(model) {
    return model.modelName.toLowerCase();
};

RestberryMongoose.prototype.use = function(next) {
    if (next)  next(this);
    return this;
};

// TODO(materik): make nicer...
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

module.exports = exports = new RestberryMongoose;
