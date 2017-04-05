/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  module.exports = {
    name: 'communicationPrefsVisible',
    choose (subject) {
      if (! subject.lang) {
        return false;
      }

      var AVAILABLE_LANGUAGES = [
        'de',
        'en',
        'en-[a-z]{2}',
        'es',
        'es-[a-z]{2}',
        'fr',
        'hu',
        'id',
        'pl',
        'pt-br',
        'ru'
      ];

      // double quotes are used instead of single quotes to avoid an
      // "unterminated string literal" error
      var availableLocalesRegExpStr = "^(" + AVAILABLE_LANGUAGES.join("|") + ")$"; //eslint-disable-line quotes
      var availableLocalesRegExp = new RegExp(availableLocalesRegExpStr);

      function normalizeLanguage(lang) {
        return lang.toLowerCase().replace(/_/g, '-');
      }

      function areCommunicationPrefsAvailable(lang) {
        var normalizedLanguage = normalizeLanguage(lang);
        return availableLocalesRegExp.test(normalizedLanguage);
      }

      return areCommunicationPrefsAvailable(subject.lang);
    }
  };
});
