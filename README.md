Restberry-Mongoose
==================

Mongoose wrapper for Restberry ODM. This package implements the ODM interface of
Restberry-Modules and can be used by Restberry.

## Install

```
npm install restberry-mongoose
```

## Usage

```
var restberryMongoose = require('restberry-mongoose');

restberry
    .use(restberryMongoose.use(function(odm) {
        var mongoose = odm.mongoose;
    }));
```
