'use babel';

import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir = os.tmpdir();
let isWin = /^win/.test(process.platform);
let phantomBinary = path.join(__dirname, '..', 'node_modules', 'phantomjs', 'lib', 'phantom', 'bin', 'phantomjs' + (isWin ? '.exe' : ''));
let Q;

class Wallaby {

  activate(state) {
    let self = this;

    setImmediate(() => {

      Q = require('q');
      let baseUrl = 'https://s3.amazonaws.com/wallaby-downloads/'; // todo 'http://update.wallabyjs.com/'
      let versionFile = path.join(__dirname, '..', 'wallaby.json');
      let corePackage = path.join(__dirname, '..', Wallaby._isDebugMode() ? '..' : '', 'wallaby', 'package.json');
      let pluginPackage = path.join(__dirname, '..', Wallaby._isDebugMode() ? '..' : '', 'wallaby-atom', 'package.json');
      if (Wallaby._isDebugMode()) {
        Wallaby._downloadAndExtract = () => {
          throw new Error('Can not delete/download/extract in debug mode');
        };
      }

      self._setupStatusIndicator();

      Q.all([
        Wallaby._stat(corePackage),
        Wallaby._stat(pluginPackage),
        Wallaby._isDebugMode()
          ? Q.when({core: require(corePackage).version, plugin: require(pluginPackage).version})
          : (self._statusUpdater('Downloading wallaby.js version file'), Wallaby._downloadAndExtract({
          name: 'version',
          from: baseUrl + 'wallaby.json?licensed=false',
          to: versionFile
        }).then(() => Wallaby._version(require('../wallaby.json'))))
      ])
        .then(([coreStat, pluginStat, latestVersion]) => {
          let versions = [Q.when(true), Q.when(true)];

          self._coreVersion = require(corePackage).version;
          self._pluginVersion = require(pluginPackage).version;

          if (!(coreStat && (self._coreVersion === latestVersion.core))) {
            versions[0] = Wallaby._downloadAndExtract({
              name: 'core',
              from: baseUrl + 'wallaby-v' + latestVersion.core + '.zip',
              to: path.dirname(corePackage),
              zip: true
            });

            self._statusUpdater('Downloading and extracting wallaby.js core');
          }
          if (!(pluginStat && (self._pluginVersion === latestVersion.plugin))) {
            versions[1] = Wallaby._downloadAndExtract({
              name: 'Atom plugin',
              from: baseUrl + 'wallaby-atom-v' + latestVersion.plugin + '.zip',
              to: path.dirname(pluginPackage),
              zip: true
            });

            self._statusUpdater('Downloading and extracting wallaby.js Atom plugin');
          }

          return Q.all(versions);

        })
        .then(() => {
          state = state || {};
          state.load = done => {
            let atomViews = require('atom-space-pen-views');
            done({
              fsExtra: require('fs-extra'),
              $: atomViews.$,
              View: atomViews.View,
              TextEditorView: atomViews.TextEditorView,
              ScrollView: atomViews.ScrollView,
              SelectListView: atomViews.SelectListView,

              statusBar: self._statusBar,

              phantomPath: phantomBinary,
              packagePath: path.join(__dirname, '..')
            });
          };

          self._package = require(path.dirname(pluginPackage));
          self._package.activate(state);
        })
        .fail(e => self._notifyError(e.message))
        .finally(() => self._removeStatusIndicator());
    });
  }

  static _isDebugMode() {
    return process.env.wallabyDebug;
  }

  static _version(data) {
    let coreVersion;
    let pluginVersion = data.latestAtomPlugin;

    if (!pluginVersion) throw new Error('Can not determine the latest wallaby.js Atom plugin version');

    data.latestServer.forEach(v => {
      if (v.substring(0, v.lastIndexOf(".")) === pluginVersion.substring(0, v.lastIndexOf("."))) {
        coreVersion = v;
      }
    });

    return {
      core: coreVersion, plugin: pluginVersion
    };
  }

  static _stat(filePath) {
    return Q.nfcall(fs.stat, filePath).fail(() => false);
  }

  static _remove(entityPath, dir, noRetry) {
    return (dir
      ? Q.nfcall(require('fs-extra').remove, entityPath)
      : Q.nfcall(fs.unlink, entityPath))
      .fail(e => {
        if (noRetry) {
          throw e;
        }
        return Wallaby._remove(entityPath, dir, true);
      });
  }

  static _downloadAndExtract(data) {
    return Wallaby._remove(data.to, data.zip).then(() => Q.promise((resolve, reject) => {
      let request = require('request');
      let target = data.zip ? path.join(tmpDir, path.basename(data.to) + '.zip') : data.to;
      try {
        request({
          url: data.from,
          headers: {'User-Agent': 'Atom ' + atom.appVersion}
        })
          .on('error', e => reject(new Error('<strong>Error while downloading wallaby.js ' + data.name
            + ' file:</strong><br/>' + e.message)))
          .pipe(fs.createWriteStream(target))
          .on('error', e => reject(new Error('<strong>Error while saving wallaby.js ' + data.name
            + ' file:</strong><br/>' + e.message)))
          .on('close', () => {
            if (data.zip) {
              try {
                let Archive = require('adm-zip');
                var zip = new Archive(target);
                zip.extractAllTo(data.to, true);
              }
              catch (e) {
                reject(new Error('<strong>Error while unzipping wallaby.js ' + data.name + ' file:</strong><br/>'
                  + (typeof e === 'string' ? e : e.message)));
              }
            }
            resolve(true);
          });
      }
      catch (e) {
        reject(e);
      }
    }));
  }

  _setupStatusIndicator() {
    let statusElement = document.createElement('div');
    statusElement.classList.add('wallaby-status');
    statusElement.classList.add('progress');
    statusElement.title = 'Checking for wallaby.js updates';
    this._statusBarTile = this._statusBar.addRightTile({item: statusElement, priority: Number.NEGATIVE_INFINITY});
    this._statusUpdater = m => {
      statusElement.title = m;
    };
  }

  _removeStatusIndicator() {
    if (this._statusBarTile) this._statusBarTile.destroy();
    delete this._statusUpdater;
  }

  _notifyError(message) {
    atom.notifications.addError(message, {dismissable: true});
  }

  deactivate() {
    this._package.deactivate();
  }

  statusBar(control) {
    this._statusBar = control;
  }
}

export default new Wallaby();
