'use babel';

class Wallaby {

  activate(state) {
    let self = this;
    state = state || {};

    // todo: manage dependencies: nodePath, phantomPath, this._package = require('../../wallaby-atom')

    state.load = () => {
      let path = require('path');
      let atomViews = require('atom-space-pen-views');
      return {
        fsExtra: require('fs-extra'),
        $: atomViews.$,
        View: atomViews.View,
        TextEditorView: atomViews.TextEditorView,
        ScrollView: atomViews.ScrollView,
        SelectListView: atomViews.SelectListView,

        statusBar: self._statusBar,

        nodePath: '/usr/local/bin/node',
        phantomPath: '/Users/artemgovorov/Library/Caches/IntelliJIdea14/plugins-sandbox/system/wallaby/phantomjs_v1.9.8/phantomjs',
        packagePath: path.join(__dirname, '..')
      };
    };

    this._package = require('../../wallaby-atom');
    this._package.activate(state);
  }

  deactivate() {
    this._package.deactivate();
  }

  statusBar(control) {
    this._statusBar = control;
  }
}

export default new Wallaby();
