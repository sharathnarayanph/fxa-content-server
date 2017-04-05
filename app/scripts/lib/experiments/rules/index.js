/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define((require, exports, module) => {
  'use strict';

  const _ = require('underscore');
  const md5 = require('md5');

  const communicationPrefs = require('./communication-prefs');
  const isSampledUser = require('./is-sampled-user');
  const passwordStrength = require('./password-strength');
  const sendSmsEnabledForCountry = require('./send-sms-enabled-for-country');
  const sendSmsInstalLink = require('./send-sms-install-link');
  const sentry = require('./sentry');
  const sessions = require('./sessions');

  const experiments = [
    communicationPrefs,
    isSampledUser,
    passwordStrength,
    sendSmsEnabledForCountry,
    sendSmsInstalLink,
    sentry,
    sessions
  ].map((experiment) => {
    return _.extend(experiment, {
      hash (key) {
        // we want as large an integer as we can get
        // and we can easily get 52bits worth (13 chars)
        // md5's are 32 chars so 40 - 13 = 27
        return md5(this.name + ':' + key).substring(27);
      },
      luckyNumber (key) {
        return this.hash(key) / 0xFFFFFFFFFFFFF;
      },
      bernoulliTrial (percent, key) {
        return this.luckyNumber(key) <= percent;
      },
      uniformChoice (choices, key) {
        return choices[this.hash(key) % choices.length];
      }
    });
  });


  module.exports = {
    choose (name, subject) {
      const experiment = _.find(experiments, (experiment) => experiment.name === name);
      if (experiment) {
        return experiment.choose(subject);
      }
    }
  };
});
