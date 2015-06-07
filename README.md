Restberry-Mongoose
==================

[![](https://img.shields.io/npm/v/restberry-mongoose.svg)](https://www.npmjs.com/package/restberry-mongoose) [![](https://img.shields.io/npm/dm/restberry-mongoose.svg)](https://www.npmjs.com/package/restberry-mongoose)

Mongoose wrapper for Restberry.

## Install

```
npm install restberry-mongoose
```

## Usage

```
var restberryMongoose = require('restberry-mongoose');

restberry
    .use('mongoose', function(odm) {
        var mongoose = odm.mongoose;
    });
```
