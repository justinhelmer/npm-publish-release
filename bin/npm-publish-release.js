#!/usr/bin/env node
(function() {
  'use strict';

  var chalk = require('chalk');

  console.log();
  console.log(chalk.bold.blue('[INFO]:'), 'You can also use', chalk.bold.blue('npr'), 'as an alias');
  console.log();

  require('./npr');
})();
