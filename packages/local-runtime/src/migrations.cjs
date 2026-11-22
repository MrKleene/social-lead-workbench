'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const files = ['schema.sql'];
const migrations = files.map((file, index) => {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return {version: index + 1, sql, checksum: createHash('sha256').update(sql).digest('hex')};
});
module.exports = {migrations, SCHEMA_VERSION: migrations.length};
