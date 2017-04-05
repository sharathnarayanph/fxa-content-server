/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  module.exports = {
    name: 'sendSmsEnabledForCountry',
    choose (subject) {
      if (! subject || ! subject.account || ! subject.country) {
        return false;
      }

      function canEmailSendToRo (email) {
        return /@softvision\.(com|ro)$/.test(email) ||
              /@mozilla\.(com|org)$/.test(email);
      }

      var sendSmsEnabledForCountry = /^(CA|GB|RO|US)$/.test(subject.country);
      if (subject.country === 'RO') {
        // only Softvision and Mozilla emails
        // are allowed to send SMS to Romania.
        sendSmsEnabledForCountry = canEmailSendToRo(subject.account.get('email'));
      }

      return sendSmsEnabledForCountry;
    }
  };
});

