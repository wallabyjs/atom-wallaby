'use babel';

import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir = os.tmpdir();
let isWin = /^win/.test(process.platform);
let phantomBinary = path.join(__dirname, '..', 'node_modules', 'phantomjs', 'lib', 'phantom', 'bin', 'phantomjs' + (isWin ? '.exe' : ''));
let updateCheckInterval = 10 * 60 * 1000;
let Q;

class Wallaby {

  activate(state) {
    let self = this;

    // todo: ping

    setImmediate(() => {

      Q = require('q');

      self._baseUrl = 'https://s3.amazonaws.com/wallaby-downloads/'; // todo 'http://update.wallabyjs.com/'
      self._versionFile = path.join(__dirname, '..', 'wallaby.json');
      self._corePackage = path.join(__dirname, '..', Wallaby._isDebugMode() ? '..' : '', 'wallaby', 'package.json');
      self._coreFolder = path.dirname(self._corePackage);
      self._pluginPackage = path.join(__dirname, '..', Wallaby._isDebugMode() ? '..' : '', 'wallaby-atom', 'package.json');
      self._pluginFolder = path.dirname(self._pluginPackage);
      self._pluginIndex = path.join(self._pluginFolder, 'index.js');

      if (Wallaby._isDebugMode()) {
        Wallaby._download = () => {
          throw new Error('Can not delete/download/extract in debug mode');
        };
      }

      self._setupStatusIndicator();

      self._updateIfRequired(true).then(() => {
        state = state || {};
        state.load = done => {
          let atomViews = require('atom-space-pen-views');

          // If wallaby is used, periodically check for updates, download if any and wait for a good time to install
          self._updateChecker = setInterval(() => self._updateIfRequired(false)
            .then(([newCore, newPlugin]) => {
              if (newCore || newPlugin) {
                state.installUpdate = () => {
                  let updates = [];
                  let updatingNotification = atom.notifications.addInfo('Updating wallaby.js components',
                    {dismissable: true});
                  if (newCore) updates.push(Wallaby._extract(newCore, self._coreFolder));
                  if (newPlugin) updates.push(Wallaby._extract(newPlugin, self._pluginFolder));
                  atom.packages.getLoadedPackage('wallaby').deactivate();
                  Q.all(updates)
                    .then(() => {
                      atom.packages.getLoadedPackage('wallaby').activate();
                      if (updatingNotification && !updatingNotification.dismissed) {
                        updatingNotification.dismiss();
                      }
                      atom.notifications.addSuccess('Wallaby.js has been successfully updated');
                    })
                    .fail(e => self._notifyError(e.message))
                };
              }
            })
            .fail(e => console.error(e)), updateCheckInterval);

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
        self._package = require(self._pluginIndex);
        self._package.activate(state);
      })
        .fail(e => self._notifyError(e.message))
        .finally(() => self._removeStatusIndicator());
    });
  }

  _updateIfRequired(fullInstall) {
    let self = this;

    return Q.all([
      Wallaby._stat(self._corePackage),
      Wallaby._stat(self._pluginPackage),
      Wallaby._isDebugMode()
        ? Q.when({
        core: Wallaby._requireNoCache(self._corePackage).version,
        plugin: Wallaby._requireNoCache(self._pluginPackage).version
      })
        : (self._statusUpdater('Downloading wallaby.js version file'), Wallaby._download({
        name: 'version',
        from: self._baseUrl + 'wallaby.json?licensed=false',
        to: self._versionFile
      }).then(() => Wallaby._version()))
    ])
      .then(([coreStat, pluginStat, latestVersion]) => {
        let versions = [Q.when(false), Q.when(false)];
        let everythingIsUpToDate = true;

        if (!(coreStat && (Wallaby._requireNoCache(self._corePackage).version === latestVersion.core))) {
          versions[0] = Wallaby._download({
            name: 'core',
            from: self._baseUrl + 'wallaby-v' + latestVersion.core + '.zip',
            to: self._coreFolder,
            unzip: fullInstall
          });

          self._statusUpdater('Downloading and extracting wallaby.js core');
          everythingIsUpToDate = false;
        }
        if (!(pluginStat && (Wallaby._requireNoCache(self._pluginPackage).version === latestVersion.plugin))) {
          versions[1] = Wallaby._download({
            name: 'Atom plugin',
            from: self._baseUrl + 'wallaby-atom-v' + latestVersion.plugin + '.zip',
            to: self._pluginFolder,
            unzip: fullInstall
          });

          self._statusUpdater('Downloading and extracting wallaby.js Atom plugin');
          everythingIsUpToDate = false;
        }

        let updatingNotification;
        if (fullInstall && !everythingIsUpToDate) {
          updatingNotification = atom.notifications.addInfo('Updating wallaby.js components, may take a few seconds',
            {dismissable: true});
        }
        return Q.all(versions).then(v => {
          if (fullInstall && !everythingIsUpToDate) {
            if (updatingNotification && !updatingNotification.dismissed) {
              updatingNotification.dismiss();
            }
            atom.notifications.addSuccess('Wallaby.js has been successfully updated');
          }
          return Q.when(v);
        });

      });
  }

  static _isDebugMode() {
    return process.env.wallabyDebug;
  }

  static _version() {
    let data = Wallaby._requireNoCache('../wallaby.json');
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

  static _requireNoCache(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
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

  static _download(data) {
    return Q.promise((resolve, reject) => {
      let request = require('request');
      let target = (path.extname(data.from) === '.zip') ? path.join(tmpDir, path.basename(data.to) + '.zip') : data.to;
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
            if (data.unzip) {
              Wallaby._extract(target, data.to)
                .then(() => resolve(target))
                .fail(e => reject(new Error('<strong>Error while unzipping wallaby.js ' + data.name + ' file:</strong><br/>'
                  + (typeof e === 'string' ? e : e.message))))
            }
            else {
              resolve(target);
            }
          });
      }
      catch (e) {
        reject(e);
      }
    });
  }

  static _extract(from, to) {
    return Wallaby._remove(to, true).then(() => {
      let Archive = require('adm-zip');
      var zip = new Archive(from);
      zip.extractAllTo(to, true);
      return Q.when(true);
    });
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
    this._statusUpdater = () => {
    };
  }

  _notifyError(message) {
    atom.notifications.addError(message, {dismissable: true});
  }

  deactivate() {
    this._package.deactivate();

    clearInterval(this._updateChecker);

    // cleaning require caches
    let packageRoot = path.join(__dirname, '..');
    let coreRoot = path.dirname(this._corePackage);
    let pluginRoot = path.dirname(this._pluginPackage);
    Object.keys(require.cache).forEach(cacheKey => {
      if (~cacheKey.indexOf(packageRoot) || ~cacheKey.indexOf(pluginRoot) || ~cacheKey.indexOf(coreRoot)) {
        delete require.cache[cacheKey];
      }
    });
  }

  statusBar(control) {
    this._statusBar = control;
  }
}

export default new Wallaby();
