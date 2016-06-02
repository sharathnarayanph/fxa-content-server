/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Error handling utilities
 */

define(function (require, exports, module) {
  'use strict';

  var AuthErrors = require('lib/auth-errors');
  var domWriter = require('lib/dom-writer');
  var FiveHundredTemplate = require('stache!templates/500');
  var FourHundredTemplate = require('stache!templates/400');
  var Logger = require('lib/logger');
  var OAuthErrors = require('lib/oauth-errors');
  var p = require('lib/promise');

  module.exports = {
    /**
     * Get the URL of the error page to which an error should redirect.
     *
     * @param {Error} error - error for which to get error page URL
     * @returns {String}
     */
    getErrorPageTemplate: function (error) {
      if (AuthErrors.is(error, 'INVALID_PARAMETER') ||
          AuthErrors.is(error, 'MISSING_PARAMETER') ||
          OAuthErrors.is(error, 'INVALID_PARAMETER') ||
          OAuthErrors.is(error, 'MISSING_PARAMETER') ||
          OAuthErrors.is(error, 'UNKNOWN_CLIENT')) {
        return FourHundredTemplate;
      }

      return FiveHundredTemplate;
    },

    /**
     * Report an error to metrics. No metrics report is sent.
     *
     * @param {Error} error
     * @param {Object} sentryMetrics
     * @param {Object} metrics
     * @param {Object} window
     */
    captureError: function (error, sentryMetrics, metrics, win) {
      var logger = new Logger(win);
      logger.error(error);

      // Ensure the message is interpolated before sending to
      // sentry and metrics.
      error.message = this.getErrorMessage(error);
      sentryMetrics.captureException(error);

      if (metrics) {
        metrics.logError(error);
      }
    },

    /**
     * Report an error to metrics. Send metrics report.
     *
     * @param {Error} error
     * @param {Object} sentryMetrics
     * @param {Object} metrics
     * @param {Object} window
     * @returns {promise};
     */
    captureAndFlushError: function (error, sentryMetrics, metrics, win) {
      this.captureError(error, sentryMetrics, metrics, win);
      return p().then(function () {
        if (metrics) {
          return metrics.flush();
        }
      });
    },

    /**
     * Render an error to the DOM
     *
     * @param {Error} error
     * @param {Object} window
     * @param {Object} translator
     */
    renderError: function (error, win, translator) {
      var errorPageTemplate = this.getErrorPageTemplate(error);
      var errorMessage = this.getErrorMessage(error, translator);
      var errorHtml = errorPageTemplate({
        message: errorMessage,
        t: getTranslationHelper(translator)
      });

      domWriter.write(win, errorHtml);
    },

    /**
     * Handle a fatal error. Logs and reports the error, then redirects
     * to the appropriate error page.
     *
     * @param {Error} error
     * @param {Object} sentryMetrics
     * @param {Object} metrics
     * @param {Object} window
     * @param {Object} translator
     * @returns {promise}
     */
    fatalError: function (error, sentryMetrics, metrics, win, translator) {
      return p.all([
        this.captureAndFlushError(error, sentryMetrics, metrics, win),
        this.renderError(error, win, translator)
      ]);
    },

    /**
     * Get the error message, performing any interpolation. If a translator
     * is passed, return value will be translated to the user's locale.
     *
     * @param {string} err - an error object
     * @param {Object} [translator] - translator to translate error
     * @return {string} interpolated error text.
     */
    getErrorMessage: function (error, translator) {
      if (error && error.errorModule) {
        return error.errorModule.toInterpolatedMessage(error, translator);
      }

      return error.message;
    }
  };

  function getTranslationHelper(translator) {
    // Use the translator's helper if available, if the translator
    // is not available (the app could error before the translator is
    // created), then create a standin.
    if (translator) {
      return translator.translateInTemplate.bind(translator);
    }

    // create the standin helper.
    return function () {
      return function (msg) {
        return msg;
      };
    };
  }
});