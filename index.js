(function() {
  'use strict';

  var _ = require('lodash');
  var bump = require('gulp-bump');
  var chalk = require('chalk');
  var gutil = require('gulp-util');
  var gulp = require('gulp');
  var path = require('path');
  var Promise = require('bluebird');
  var spork = require('node-spork');

  var pkg = path.resolve(process.cwd(), 'package.json'); // Just grab the path, don't read from disk
  var stdout = process.stdout.write;
  var stderr = process.stderr.write;
  var bumpOption, version;

  /**
   * Automatically bump and publish a release to npm and/or github.
   *
   * If [version] is one of 'major', 'minor', or 'patch', the version will be incremented appropriately.
   * If [version] is in the format 'X.X.X', the version will be set to specifically what is provided.
   *
   * @param {string} [version=patch] - The version to publish. major, minor, patch, or X.X.X.
   * @param {object} [options] - Additional options to alter the behavior.
   * @param {boolean} [options.noCommit] - By default, a new commit is created and pushed to origin/master AFTER the version bump and
   *                                       BEFORE the publish, to keep npm & github release versions in-sync. This option disables that behavior.
   *                                       May be useful if there is no associated git repository.
   * @param {string} [options.dest] - Either npm or github; omit for both.
   * @param {string} [options.quiet] - Output nothing (suppress STDOUT and STDERR)').
   * @return {Bluebird promise} - Resolves with nothing on success, rejects with a {string} message when the first operation fails.
   */
  function publishRelease(version, options) {
    return new Promise(function(resolve, reject) {
      options = options || {};

      if (options.dest && !_.includes(['npm', 'github'], options.dest)) {
        reject('unknown [dest]: ' + options.dest);
      }

      bumpPackageJson()
          .then(commitAndPush)
          .then(publish)
          .then(success)
          .catch(reject)
          .done();

      function bumpPackageJson() {
        return new Promise(function(resolve, reject) {
          var bumpOptions = {};
          var stdout = process.stdout.write;
          var stderr = process.stderr.write;
          version = version || 'patch';
          version = _.lowerCase(version).replace(/\s/g, '.'); // _.lowerCase replaces the periods for some reason for X.X.X format. Put them back.

          // https://github.com/stevelacy/gulp-bump#options
          if (_.includes(['major', 'minor', 'patch'], version)) {
            bumpOption = 'type';
          } else if (version.match(/^\d+\.\d+\.\d+$/)) {
            bumpOption = 'version';
          } else {
            reject('unknown [version]: ' + options.pkgVersion);
          }

          if (options.quiet) {
            process.stdout.write = _.noop;
            process.stderr.write = _.noop;
          }

          bumpOptions[bumpOption] = version;
          gulp.src(pkg)
              .pipe(bump(bumpOptions))
              .pipe(gulp.dest(process.cwd()))
              .on('end', function(err) {
                process.stdout.write = stdout;
                process.stderr.write = stderr;

                if (err) {
                  reject('failed to bump version in package.json');
                } else {
                  resolve();
                }
              });
        });
      }

      function commitAndPush() {
        return new Promise(function(resolve, reject) {
          add(); // calls commit() on success

          // calls commit() on success
          function add() {
            _spork('git', ['add', 'package.json'], commit, _.partial(fulfill, 'Could not stage \'' + chalk.cyan('package.json') + '\''));
          }

          // calls push() on success
          function commit() {
            _spork('git', ['commit', '-m', 'Bumping to version ' + require(pkg).version], push,
                _.partial(fulfill, 'Could not commit \'' + chalk.cyan('package.json') + '\''));
          }

          function push() {
            _spork('git', ['push', 'origin', 'master'], done, _.partial(fulfill, 'Could not push commit \'' + chalk.cyan('master') + '\''));
          }

          function done() {
            if (!options.quiet) {
              gutil.log('Pushed commit to \'' + chalk.cyan('master') + '\'');
            }

            resolve();
          }

          function fulfill(msg) {
            if (!options.quiet) {
              gutil.log(chalk.cold.yellow('[WARNING]:'), msg + '; aborting auto-commit & push');
            }

            resolve();
          }
        });
      }

      function publish() {
        if (options.dest === 'npm') {
          return publishToNpm();
        } else if (options.dest === 'github') {
          version = require(pkg).version;
          return publishToGithub(require(pkg).version);
        }

        return Promise.all([publishToGithub(require(pkg).version), publishToNpm()]);
      }

      /**
       * Publish the current codebase to github. Requires the [version] to generate the `git tag` in the format 'vX.X.X'.
       *
       * @param {string} [version] - The version to publish. Will be in the format 'X.X.X' and converted to `vX.X.X` by this function.
       * @return {Bluebird promise} - Resolves or rejects (with nothing) based on the status of the `git` commands.
       */
      function publishToGithub(version) {
        return new Promise(function(resolve, reject) {
          version = 'v' + version;
          tag(); // calls push() on success

          function tag() {
            _spork('git', ['tag', version], push, _.partial(reject, 'failed to create git tag'));
          }

          function push() {
            _spork('git', ['push', 'origin', version], done, _.partial(reject, 'failed to publish release to github'));
          }

          function done() {
            if (!options.quiet) {
              gutil.log('Published', '\'' + chalk.magenta(version) + '\'', 'to \'' + chalk.cyan('github') + '\'');
            }

            resolve();
          }
        });
      }

      /**
       * Publish the current codebase to npm.
       *
       * @return {Bluebird promise} - Resolves or rejects (with nothing) based on the status of the `git` commands.
       */
      function publishToNpm() {
        return new Promise(function(resolve, reject) {
          _spork('npm', ['publish'], done, _.partial(reject, 'failed to publish to npm'));

          function done() {
            if (!options.quiet) {
              gutil.log('Published to \'' + chalk.cyan('npm') + '\'');
            }

            resolve();
          }
        });
      }

      function success() {
        if (!options.quiet) {
          console.log();
          console.log(chalk.green('Done!'));
        }

        resolve();
      }
    });
  }

  function outputEnable() {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }

  function outputDisable() {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }

  // Wrapper around spork to shorthand common behavior
  function _spork(command, args, resolve, reject) {
    console.log(args);
    spork(command, args, {exit: false, quiet: true})
        .on('exit:code', function(code) {
          if (code === 0) {
            resolve();
          } else {
            reject();
          }
        });
  }

  module.exports = publishRelease;
})();
