'use babel';

import wallabyPackage from '../../wallaby-atom'
import path from 'path';

class Wallaby {

  activate(state) {
    state = state || {};

    // todo: manage dependencies
    state.phantomPath = '/Users/artemgovorov/Library/Caches/IntelliJIdea14/plugins-sandbox/system/wallaby/phantomjs_v1.9.8/phantomjs';
    state.packagePath = path.join(__dirname, '..');

    wallabyPackage.activate(state);
  }

}

export default new Wallaby();
