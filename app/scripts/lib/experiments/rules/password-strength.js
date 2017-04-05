/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  module.exports = {
    name: 'passwordStrengthCheckEnabled',
    choose (subject) {
      if (subject) {
        if (subject.forcePasswordStrengthCheck === 'true') {
          return true;
        }

        if (subject.forcePasswordStrengthCheck === 'false') {
          return false;
        }

        if (subject.isMetricsEnabledValue) {
          return true;
        }
      }

      return false;
    },
  };
});
