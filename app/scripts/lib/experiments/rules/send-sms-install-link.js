/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  function isEmailInTreatment (email) {
    return /@softvision\.(com|ro)$/.test(email) ||
           /@mozilla\.(com|org)$/.test(email);
  }

  module.exports = {
    name: 'sendSms',
    choose (subject) {
      function isInExperiment (forceExperiment, email) {
        return forceExperiment === 'sendSms' || isEmailInTreatment(email);
      }

      if (! subject || ! subject.account || ! subject.uniqueUserId) {
        return false;
      }

      if (isInExperiment(subject.forceExperiment, subject.account.get('email'))) {
        return this.groupingFunction(subject);
      }

      // a random sampling of 5% of all sessions.
      // 2.5% will be in the control group,
      // 2.5% in the treatment group.
      if (this.bernoulliTrial(0.05, subject.uniqueUserId)) {
        return this.groupingFunction(subject);
      }
    },

    groupingFunction (subject) {
      var GROUPS = ['control', 'treatment'];
      var choice = this.uniformChoice(GROUPS, subject.uniqueUserId);

      if (subject.forceExperimentGroup) {
        choice = subject.forceExperimentGroup;
      } else if (isEmailInTreatment(subject.account.get('email'))) {
        choice = 'treatment';
      }

      return {
        sendSms: choice
      };
    }
  };
});
