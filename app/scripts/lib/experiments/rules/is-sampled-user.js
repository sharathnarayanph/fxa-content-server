/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  module.exports = {
    name: 'isSampledUser',
    choose (subject) {
      var sampleRate = subject.env === 'development' ? 1.0 : 0.1;

      return !! (subject.env && subject.uniqueUserId && this.bernoulliTrial(sampleRate, subject.uniqueUserId));
    }
  };
});
