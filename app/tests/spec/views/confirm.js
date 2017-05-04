/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const { assert } = require('chai');
  const AuthErrors = require('lib/auth-errors');
  const Backbone = require('backbone');
  const BaseBroker = require('models/auth_brokers/base');
  const VerificationReasons = require('lib/verification-reasons');
  const Metrics = require('lib/metrics');
  const Notifier = require('lib/channels/notifier');
  const p = require('lib/promise');
  const Relier = require('models/reliers/relier');
  const Session = require('lib/session');
  const sinon = require('sinon');
  const TestHelpers = require('../../lib/helpers');
  const User = require('models/user');
  const View = require('views/confirm');
  const WindowMock = require('../../mocks/window');

  const SIGNIN_REASON = VerificationReasons.SIGN_IN;
  const SIGNUP_REASON = VerificationReasons.SIGN_UP;

  describe('views/confirm', function () {
    var account;
    var broker;
    var metrics;
    var model;
    var notifier;
    var relier;
    var user;
    var view;
    var windowMock;

    beforeEach(function () {
      model = new Backbone.Model();
      notifier = new Notifier();
      metrics = new Metrics({ notifier });
      user = new User();
      windowMock = new WindowMock();

      relier = new Relier({}, {
        window: windowMock
      });

      broker = new BaseBroker({
        relier: relier,
        session: Session,
        window: windowMock
      });

      account = user.initAccount({
        customizeSync: true,
        email: 'a@a.com',
        sessionToken: 'fake session token',
        uid: 'uid'
      });

      model.set({
        account: account,
        type: SIGNUP_REASON
      });

      sinon.stub(user, 'setSignedInAccount', () => p());

      view = new View({
        broker: broker,
        canGoBack: true,
        metrics: metrics,
        model: model,
        notifier: notifier,
        relier: relier,
        user: user,
        viewName: 'confirm',
        window: windowMock
      });

      return view.render();
    });

    afterEach(function () {
      metrics.destroy();

      view.remove();
      view.destroy();

      view = metrics = null;
    });

    describe('render', function () {
      describe('with sessionToken', function () {
        describe('sign up', function () {
          beforeEach(function () {
            model.set('type', SIGNUP_REASON);

            return view.render();
          });

          it('draws the correct template', function () {
            assert.lengthOf(view.$('#back'), 0);
            assert.lengthOf(view.$('#fxa-confirm-header'), 1);
          });
        });

        describe('sign in', function () {
          beforeEach(function () {
            model.set('type', SIGNIN_REASON);

            return view.render();
          });

          it('draws the correct template', function () {
            assert.lengthOf(view.$('#back'), 1);
            assert.lengthOf(view.$('#fxa-confirm-signin-header'), 1);
          });
        });
      });

      describe('without a sessionToken', function () {
        beforeEach(function () {
          model.set({
            account: user.initAccount()
          });

          view = new View({
            broker: broker,
            canGoBack: true,
            model: model,
            notifier: notifier,
            user: user,
            window: windowMock
          });

          sinon.spy(view, 'navigate');
        });

        describe('sign up', function () {
          beforeEach(function () {
            return view.render();
          });

          it('redirects to `/signup`', function () {
            assert.isTrue(view.navigate.calledWith('signup'));
          });
        });

        describe('sign in', function () {
          beforeEach(function () {
            model.set('type', SIGNIN_REASON);

            return view.render();
          });

          it('redirects to `/signin`', function () {
            assert.isTrue(view.navigate.calledWith('signin'));
          });
        });
      });
    });

    describe('afterVisible', function () {
      it('notifies the broker before the confirmation', function () {
        sinon.stub(account, 'waitForSessionVerification', () => p());

        sinon.spy(broker, 'persistVerificationData');

        sinon.stub(broker, 'beforeSignUpConfirmationPoll', function (account) {
          assert.isTrue(account.get('customizeSync'));
          return p();
        });

        return view.afterVisible()
          .then(function () {
            assert.isTrue(broker.persistVerificationData.called);
            assert.isTrue(
                broker.beforeSignUpConfirmationPoll.calledWith(account));
          });
      });

      describe('signup', function () {
        it('notifies the broker after the account is confirmed', function () {
          sinon.stub(view, 'isSignUp', function () {
            return true;
          });

          sinon.stub(view, 'isSignIn', function () {
            return false;
          });

          return testEmailVerificationPoll('afterSignUpConfirmationPoll');
        });
      });

      describe('signin', function () {
        it('notifies the broker after the account is confirmed', function () {
          sinon.stub(view, 'isSignUp', function () {
            return false;
          });

          sinon.stub(view, 'isSignIn', function () {
            return true;
          });

          return testEmailVerificationPoll('afterSignInConfirmationPoll');
        });
      });

      function testEmailVerificationPoll(expectedBrokerCall) {
        var notifySpy = sinon.spy(view.notifier, 'trigger');

        sinon.stub(account, 'waitForSessionVerification', () => p());
        sinon.stub(broker, 'beforeSignUpConfirmationPoll', () => p());
        sinon.stub(broker, expectedBrokerCall, () => p());
        sinon.stub(user, 'setAccount', () => p());
        sinon.stub(view, 'setTimeout', (callback) => callback());
        sinon.stub(view, '_navigateToConfirmedScreen', () => p());

        return view.afterVisible()
          .then(function () {
            assert.equal(account.waitForSessionVerification.callCount, 1);
            assert.isTrue(account.waitForSessionVerification.calledWith(view.VERIFICATION_POLL_IN_MS));
            assert.isDefined(view.VERIFICATION_POLL_IN_MS);
            assert.isTrue(user.setAccount.calledWith(account));
            assert.isTrue(broker.beforeSignUpConfirmationPoll.calledWith(account));
            assert.isTrue(broker[expectedBrokerCall].calledWith(account));
            assert.isTrue(view._navigateToConfirmedScreen.calledOnce);
            assert.isTrue(TestHelpers.isEventLogged(
                    metrics, 'confirm.verification.success'));
            assert.isTrue(notifySpy.withArgs('verification.success').calledOnce);
          });
      }

      it('displays an error message allowing the user to re-signup if their email bounces', function () {
        sinon.stub(account, 'waitForSessionVerification', function () {
          return p.reject(AuthErrors.toError('SIGNUP_EMAIL_BOUNCE'));
        });

        sinon.spy(view, 'navigate');
        return view.afterVisible()
          .then(function () {
            assert.isTrue(view.navigate.calledWith('signup', { bouncedEmail: 'a@a.com' }));
            assert.isTrue(account.waitForSessionVerification.calledOnce);
          });
      });

      it('displays an error when an unknown error occurs', function () {
        var unknownError = 'Something failed';
        sinon.stub(account, 'waitForSessionVerification', function () {
          return p.reject(new Error(unknownError));
        });

        sinon.spy(view, 'navigate');
        return view.afterVisible()
          .then(function () {
            assert.isTrue(account.waitForSessionVerification.calledOnce);
            assert.equal(view.$('.error').text(), unknownError);
          });
      });

      describe('with an unexpected error', function () {
        var sandbox;

        beforeEach(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(account, 'waitForSessionVerification', () => {
            var callCount = account.waitForSessionVerification.callCount;
            if (callCount < 2) {
              return p.reject(AuthErrors.toError('UNEXPECTED_ERROR'));
            } else {
              return p();
            }
          });

          sandbox.spy(view, 'navigate');
          sandbox.spy(view.sentryMetrics, 'captureException');
          sandbox.spy(view, '_startPolling');

          sandbox.stub(view, 'setTimeout', function (callback) {
            callback();
          });

          sandbox.stub(user, 'setAccount', () => p());

          return view.afterVisible();
        });

        afterEach(function () {
          sandbox.restore();
        });

        it('polls the auth server', function () {
          assert.equal(account.waitForSessionVerification.callCount, 2);
        });

        it('captures the exception to Sentry', function () {
          assert.isTrue(view.sentryMetrics.captureException.called);
          assert.equal(view.sentryMetrics.captureException.firstCall.args[0].errno,
             AuthErrors.toError('POLLING_FAILED').errno);
        });

        it('does not display an error to the user when unexpected error occurs', function () {
          assert.equal(view.$('.error').text(), '');
        });

        it('restarts polling when an unexpected error occurs', function () {
          assert.equal(view._startPolling.callCount, 2);
        });
      });
    });

    describe('resend', function () {
      it('resends the confirmation email', function () {
        sinon.stub(account, 'retrySignUp', () => p());
        sinon.stub(view, 'getStringifiedResumeToken', () => 'resume token');

        return view.resend()
          .then(() => {
            assert.isTrue(view.getStringifiedResumeToken.calledOnce);
            assert.isTrue(view.getStringifiedResumeToken.calledWith(account));
            assert.isTrue(account.retrySignUp.calledWith(
              relier,
              {
                resume: 'resume token'
              }
            ));
          });
      });

      describe('with an invalid resend token', function () {
        beforeEach(function () {
          sinon.stub(account, 'retrySignUp', function () {
            return p.reject(AuthErrors.toError('INVALID_TOKEN'));
          });

          sinon.spy(view, 'navigate');

          return view.resend();
        });

        it('redirects to /signup', function () {
          assert.isTrue(view.navigate.calledWith('signup'));
        });
      });

      describe('that causes other errors', function () {
        var error;

        beforeEach(function () {
          sinon.stub(account, 'retrySignUp', function () {
            return p.reject(new Error('synthesized error from auth server'));
          });

          return view.resend()
            .then(assert.fail, function (err) {
              error = err;
            });
        });

        it('re-throws the error', function () {
          assert.equal(error.message, 'synthesized error from auth server');
        });
      });
    });

    describe('_navigateToConfirmedScreen', function () {
      beforeEach(function () {
        sinon.stub(view, 'navigate', () => {});
      });

      describe('signup', function () {
        beforeEach(function () {
          model.set('type', SIGNUP_REASON);

          return view._navigateToConfirmedScreen();
        });

        it('redirects to `signup_confirmed`', function () {
          assert.isTrue(view.navigate.calledWith('signup_confirmed'));
        });
      });

      describe('signin', function () {
        beforeEach(function () {
          model.set('type', SIGNIN_REASON);

          return view._navigateToConfirmedScreen();
        });

        it('redirects to `signin_confirmed`', function () {
          assert.isTrue(view.navigate.calledWith('signin_confirmed'));
        });
      });
    });

    describe('openWebmail feature', function () {
      it('it is not visible in basic contexts', function () {
        assert.notOk(view.$('#open-webmail').length);
      });

      it('is visible with the the openGmailButtonVisible capability and email is @gmail.com', function () {
        broker.setCapability('openWebmailButtonVisible', true);

        account = user.initAccount({
          customizeSync: true,
          email: 'a@gmail.com',
          sessionToken: 'fake session token',
          uid: 'uid'
        });

        model.set({
          account: account
        });

        view = new View({
          broker: broker,
          canGoBack: true,
          metrics: metrics,
          model: model,
          notifier: notifier,
          relier: relier,
          user: user,
          viewName: 'confirm',
          window: windowMock
        });

        return view.render()
          .then(function () {
            assert.lengthOf(view.$('#open-webmail'), 1);
          });
      });
    });
  });
});
