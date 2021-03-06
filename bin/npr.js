#!/usr/bin/env node
(function() {
  'use strict';

  var cjsErr = require('commander.js-error');
  var program = require('commander');
  var publish = require('../index');

  program
      .version('1.3.10')
      .usage('[options] [pkgVersion]', 'patch')
      .description('Description:\n\n    ' + 'Automatically bump and publish a release to npm and/or github.\n\n    ' +
          '    [pkgVersion] can be one of the following:\n\n' +
          '            - major, minor, or patch\n' +
          '            - a specific version in the format X.X.X\n\n' +
          '    If [pkgVersion] is not supplied, patch is assumed.\n\n' +
          '    If `--dest` is not supplied, the package is published\n' +
          '    to both npm and github.')
      .option('-d, --dest [dest]', 'either npm or github; omit for both')
      .option('-nc, --no-commit', 'do NOT push a bump commit to master')
      .option('-q, --quiet', 'output nothing (suppress STDOUT and STDERR)')
      .option('-v, --verbose', 'display full stack traces for errors; takes precedence over `-q`')
      .parse(process.argv);

  publish(program.args[0], {dest: program.dest, commit: program.commit, quiet: program.quiet, verbose: program.verbose})
      .then(process.exit)
      .catch(function(err) {
        if (program.verbose || !program.quiet) {
          var opts = {verbose: program.verbose};
          cjsErr(opts, err);
        }

        process.exit(1);
      })
      .done();

  require('node-clean-exit')();
})();
