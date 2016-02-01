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
   * @param {boolean} [options.commit] - Optionally push a new commit to master with the message "Bumped to version X.X.X"
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
          .then(publish)
          .then(commitAndPush)
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
        if (!options.commit) {
          return Promise.resolve();
        }

        return new Promise(function(resolve, reject) {
          add(); // calls commit() on success

          function add() {
            spork('git', ['add', 'package.json'], {exit: false, quiet: true})
                .on('exit:code', function(code) {
                  if (code === 0) {
                    commit(); // calls push() on success
                  } else {
                    reject('failed to stage package.json');
                  }
                });
          }

          function commit() {
            spork('git', ['commit', '-m', 'Bumping to version ' + require(pkg).version], {exit: false, quiet: true})
                .on('exit:code', function(code) {
                  if (code === 0) {
                    push();
                  } else {
                    reject('failed to commit to master');
                  }
                });
          }


          function push() {
            spork('git', ['push', 'origin', 'master'], {exit: false, quiet: true})
                .on('exit:code', function(code) {
                  if (code === 0) {
                    if (!options.quiet) {
                      gutil.log('Pushed commit to \'' + chalk.cyan('master') + '\'');
                    }

                    resolve();
                  } else {
                    reject('failed to push commit to origin/master');
                  }
                });
          }
        });
      }

      /**
       * Log a formatted message indicating the successful publish of a version to npm or github.
       *
       * @param {string} [version] - The version which was published. Will be in the format 'X.X.X' for npm, and 'vX.X.X' for github.
       * @param {object} [dest] - The published destination. Possible values: npm, github.
       */
      function logPublished(version, dest) {
        if (!options.quiet) {
          gutil.log('Published', '\'' + chalk.magenta(version) + '\'', 'to \'' + chalk.cyan(dest) + '\'');
        }
      }

      // @TODO use through2-filter to scrub the version from the write stream
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
            spork('git', ['tag', version], {exit: false, quiet: true})
                .on('exit:code', function(code) {
                  if (code === 0) {
                    push();
                  } else {
                    reject('failed to create git tag');
                  }
                });
          }

          function push() {
            spork('git', ['push', 'origin', version], {exit: false, quiet: true})
                .on('exit:code', function(code) {
                  if (code === 0) {
                    if (!options.quiet) {
                      logPublished(version, 'github');
                    }

                    resolve();
                  } else {
                    reject('failed to publish release to github');
                  }
                });
          }
        });
      }

      function publishToNpm(version) {
        console.log(chalk.bold.yellow('[WARN]:'), 'npm not yet supported. skipping.');
        //logPublished(version, 'npm');
        return Promise.resolve('Skipped');
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

  module.exports = publishRelease;
})();
