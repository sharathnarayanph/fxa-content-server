/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const _ = require('underscore');
  const { assert } = require('chai');
  const AuthErrors = require('lib/auth-errors');
  const FxSyncChannelAuthenticationBroker = require('models/auth_brokers/fx-sync-channel');
  const NullChannel = require('lib/channels/null');
  const p = require('lib/promise');
  const sinon = require('sinon');
  const User = require('models/user');
  const WindowMock = require('../../../mocks/window');

  describe('models/auth_brokers/fx-sync-channel', function () {
    var account;
    var broker;
    var channelMock;
    var user;
    var windowMock;

    function createAuthBroker (options) {
      options = options || {};

      broker = new FxSyncChannelAuthenticationBroker(_.extend({
        channel: channelMock,
        commands: {
          CAN_LINK_ACCOUNT: 'can_link_account',
          CHANGE_PASSWORD: 'change_password',
          DELETE_ACCOUNT: 'delete_account',
          LOADED: 'loaded',
          LOGIN: 'login',
          /*
          SYNC_PREFERENCES: 'sync_preferences' // Removed in issue #4250
          */
        },
        window: windowMock
      }, options));
    }

    beforeEach(function () {
      windowMock = new WindowMock();
      channelMock = new NullChannel();
      channelMock.send = sinon.spy(function () {
        return p();
      });

      user = new User();
      account = user.initAccount({
        email: 'testuser@testuser.com',
        keyFetchToken: 'key-fetch-token',
        unwrapBKey: 'unwrap-b-key'
      });

      createAuthBroker();
    });

    it('has the `signup` capability by default', function () {
      assert.isTrue(broker.hasCapability('signup'));
    });

    it('has the `handleSignedInNotification` capability by default', function () {
      assert.isTrue(broker.hasCapability('handleSignedInNotification'));
    });

    it('has the `emailVerificationMarketingSnippet` capability by default', function () {
      assert.isTrue(broker.hasCapability('emailVerificationMarketingSnippet'));
    });

    describe('afterLoaded', function () {
      it('sends a `loaded` message', function () {
        return broker.afterLoaded()
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('loaded'));
          });
      });
    });

    describe('beforeSignIn', function () {
      it('is happy if the user clicks `yes`', function () {
        channelMock.request = sinon.spy(() => p({ ok: true }));

        return broker.beforeSignIn(account)
          .then(() => {
            assert.isTrue(channelMock.request.calledOnce);
            assert.isTrue(channelMock.request.calledWith('can_link_account'));
          });
      });

      it('does not repeat can_link_account requests for the same user', () => {
        channelMock.request = sinon.spy(() => p({ ok: true }));

        return broker.beforeSignIn(account)
          .then(() => broker.beforeSignIn(account))
          .then(() => {
            assert.isTrue(channelMock.request.calledOnce);
            assert.isTrue(channelMock.request.calledWith('can_link_account'));
          });
      });

      it('does repeat can_link_account requests for different users', () => {
        channelMock.request = sinon.spy(() => p({ ok: true }));

        const account2 = user.initAccount({
          email: 'testuser2@testuser.com'
        });

        return broker.beforeSignIn(account)
          .then(() => broker.beforeSignIn(account2))
          .then(() => {
            assert.equal(channelMock.request.callCount, 2);
            assert.equal(channelMock.request.args[0][0], 'can_link_account');
            assert.equal(channelMock.request.args[1][0], 'can_link_account');
          });
      });

      it('throws a USER_CANCELED_LOGIN error if user rejects', function () {
        channelMock.request = sinon.spy(function () {
          return p({ data: {}});
        });

        return broker.beforeSignIn(account)
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
            assert.isTrue(channelMock.request.calledWith('can_link_account'));
          });
      });

      it('swallows errors returned by the browser', function () {
        channelMock.request = sinon.spy(function () {
          return p.reject(new Error('uh oh'));
        });

        sinon.spy(console, 'error');

        return broker.beforeSignIn(account)
          .then(function () {
            assert.isTrue(console.error.called);
            console.error.restore();
          });
      });
    });

    describe('_notifyRelierOfLogin', function () {
      // verified will be auto-populated if not in the account.
      var requiredAccountFields = _.without(FxSyncChannelAuthenticationBroker.REQUIRED_LOGIN_FIELDS, 'verified');

      requiredAccountFields.forEach(function (fieldName) {
        it('does not send a `login` message to the channel if the account does not have `' + fieldName + '`', function () {
          account.unset(fieldName);
          return broker._notifyRelierOfLogin(account)
            .then(function () {
              assert.isFalse(channelMock.send.called);
            });
        });
      });

      it('sends a `login` message to the channel using current account data', function () {
        return broker._notifyRelierOfLogin(account)
          .then(function () {
            assert.isTrue(channelMock.send.calledWith('login'));

            var data = channelMock.send.args[0][1];
            assert.equal(data.email, 'testuser@testuser.com');
            assert.equal(data.keyFetchToken, 'key-fetch-token');
            assert.equal(data.unwrapBKey, 'unwrap-b-key');
            assert.isFalse(data.verified);
            assert.isFalse(data.verifiedCanLinkAccount);
          });
      });

      it('tells the window not to re-verify if the user can link accounts if the question has already been asked', function () {
        channelMock.send = sinon.spy(function (message) {
          if (message === 'can_link_account') {
            return p({ ok: true });
          } else if (message === 'login') {
            return p();
          }
        });

        return broker.beforeSignIn(account)
          .then(function () {
            return broker._notifyRelierOfLogin(account);
          })
          .then(function () {
            assert.equal(channelMock.send.args[0][0], 'can_link_account');
            var data = channelMock.send.args[1][1];
            assert.equal(data.email, 'testuser@testuser.com');
            assert.isFalse(data.verified);
            assert.isTrue(data.verifiedCanLinkAccount);
            assert.equal(channelMock.send.args[1][0], 'login');
          });
      });

      it('indicates whether the account is verified', function () {
        // set account as verified
        account.set('verified', true);

        channelMock.send = sinon.spy(function (message) {
          if (message === 'can_link_account') {
            return p({ ok: true });
          } else if (message === 'login') {
            return p();
          }
        });

        return broker.beforeSignIn(account)
          .then(function () {
            return broker._notifyRelierOfLogin(account);
          })
          .then(function () {
            var data = channelMock.send.args[1][1];
            assert.isTrue(data.verified);
          });
      });
    });

    describe('afterSignIn', function () {
      it('notifies the channel of login, does not halt by default', function () {
        account.set({
          customizeSync: true,
          declinedSyncEngines: ['bookmarks', 'passwords'],
          keyFetchToken: 'key_fetch_token',
          sessionToken: 'session_token',
          sessionTokenContext: 'sync',
          uid: 'uid',
          unwrapBKey: 'unwrap_b_key',
          verified: true
        });

        return broker.afterSignIn(account)
          .then(function (result) {

            var args = channelMock.send.args[0];
            assert.equal(args[0], 'login');
            assert.equal(args[1].customizeSync, true);
            assert.deepEqual(
                args[1].declinedSyncEngines, ['bookmarks', 'passwords']);
            assert.equal(args[1].email, 'testuser@testuser.com');
            assert.equal(args[1].sessionToken, 'session_token');
            assert.equal(args[1].uid, 'uid');
            assert.equal(args[1].unwrapBKey, 'unwrap_b_key');
            assert.equal(args[1].verified, true);
            assert.isUndefined(args[1].sessionTokenContext);

            assert.isUndefined(result.halt);
          });
      });
    });

    describe('beforeSignUpConfirmationPoll', function () {
      it('notifies the channel of login, does not halt the flow by default', function () {
        return broker.beforeSignUpConfirmationPoll(account)
          .then(function (result) {
            assert.isTrue(channelMock.send.calledWith('login'));
            assert.isUndefined(result.halt);
          });
      });
    });

    describe('afterResetPasswordConfirmationPoll', function () {
      it('notifies the channel of login, does not halt by default', function () {
        return broker.afterResetPasswordConfirmationPoll(account)
          .then(function (result) {
            assert.isTrue(channelMock.send.calledWith('login'));
            assert.isUndefined(result.halt);
          });
      });
    });

    describe('afterChangePassword', function () {
      it('notifies the channel of change_password with the new login info', function () {
        account.set({
          customizeSync: true,
          keyFetchToken: 'key_fetch_token',
          sessionToken: 'session_token',
          sessionTokenContext: 'sync',
          uid: 'uid',
          unwrapBKey: 'unwrap_b_key',
          verified: true
        });

        return broker.afterChangePassword(account)
          .then(function () {
            var args = channelMock.send.args[0];
            assert.equal(args[0], 'change_password');
            assert.equal(args[1].email, 'testuser@testuser.com');
            assert.equal(args[1].uid, 'uid');
            assert.equal(args[1].sessionToken, 'session_token');
            assert.equal(args[1].unwrapBKey, 'unwrap_b_key');
            assert.equal(args[1].customizeSync, true);
            assert.equal(args[1].verified, true);
            assert.isUndefined(args[1].sessionTokenContext);
          });
      });
    });

    describe('afterDeleteAccount', function () {
      it('notifies the channel of delete_account', function () {
        account.set('uid', 'uid');

        return broker.afterDeleteAccount(account)
          .then(function () {
            var args = channelMock.send.args[0];
            assert.equal(args[0], 'delete_account');
            assert.equal(args[1].email, 'testuser@testuser.com');
            assert.equal(args[1].uid, 'uid');
          });
      });
    });

    describe('createChannel', function () {
      it('must be overridden', function () {
        assert.throws(function () {
          broker.createChannel();
        }, 'createChannel must be overridden');
      });
    });

    describe('getChannel', function () {
      it('returns an already created channel, if available', function () {
        assert.strictEqual(broker.getChannel(), channelMock);
      });
    });

    describe('getCommand', function () {
      it('throws if commands is not overridden', function () {
        var SubBroker = FxSyncChannelAuthenticationBroker.extend({});
        var subBroker = new SubBroker();
        assert.throws(function () {
          subBroker.getCommand('LOGIN');
        }, 'this.commands must be specified');
      });

      it('throws if a command is not defined', function () {
        assert.throws(function () {
          broker.getCommand('NOT_SPECIFIED');
        }, 'command not found for: NOT_SPECIFIED');
      });

      it('returns a command specified', function () {
        assert.equal(broker.getCommand('LOGIN'), 'login');
      });
    });

  });
});

