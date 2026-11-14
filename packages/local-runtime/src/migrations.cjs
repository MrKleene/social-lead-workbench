'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const files = ['schema.sql', 'migrations/002-inbox.sql', 'migrations/003-collection-review.sql','migrations/004-contact-rules.sql','migrations/005-model-submission.sql','migrations/006-collection-checkpoints.sql','migrations/007-automation.sql','migrations/008-independent-evidence.sql','migrations/009-legacy-evidence.sql','migrations/010-automatic-diagnostics.sql','migrations/011-model-unlimited.sql','migrations/012-account-profile.sql','migrations/013-builtin-configurations.sql','migrations/014-drop-exclude-words.sql'];
const migrations = files.map((file, index) => {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return {version: index + 1, sql, checksum: createHash('sha256').update(sql).digest('hex')};
});
module.exports = {migrations, SCHEMA_VERSION: migrations.length};
