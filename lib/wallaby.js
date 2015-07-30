'use babel';

import path from 'path';
import {$} from 'atom-space-pen-views';
import wallabyPackage from '../../wallaby-atom'

class Wallaby {

  activate(state) {
    state = state || {};

    // todo: manage dependencies
    state.phantomPath = '/Users/artemgovorov/Library/Caches/IntelliJIdea14/plugins-sandbox/system/wallaby/phantomjs_v1.9.8/phantomjs';
    state.packagePath = path.join(__dirname, '..');
    state.$ = $;

    wallabyPackage.activate(state);
  }

}

export default new Wallaby();
