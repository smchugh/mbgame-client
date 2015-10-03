if (Meteor.isClient) {
  // Set constants
  STATUS_YOUR_TURN = 'your_turn';
  STATUS_THEIR_TURN = 'their_turn';
  STATUS_YOU_WON = 'you_won';
  STATUS_THEY_WON = 'they_won';

  // Set global defaults
  Session.setDefault('game_id', null);
  Session.setDefault('piles', []);
  Session.setDefault('pile_id', null);
  Session.setDefault('beans', 0);
  Session.setDefault('pile_beans', []);
  Session.setDefault('auth_token', null);
  Session.setDefault('auth_token_expiration', null);
  Session.setDefault('game_status', STATUS_YOUR_TURN);


  Template.body.helpers({
    piles: function () {
      var pile_data = Session.get('piles');
      if (Session.get('pile_id')) {
        var pile = pile_data[Session.get('pile_id')];
        pile['beans'] = calculateBeans(pile['num_beans'] - Session.get('beans'));
        pile_data[Session.get('pile_id')] = pile;
        Session.set('pile_beans', pile['beans']);
      }
      return pile_data;
    },
    game_id: function () {
      return Session.get('game_id');
    }
  });

  Template.pile.helpers({
    bean_count: function (pile_id, num_beans) {
      if (Session.get('pile_id') == pile_id) {
        return num_beans - Session.get('beans');
      } else {
        return num_beans
      }
    }
  });


  //// Event handlers ////

  Template.pile.events({
    'click .pile': function (event) {
      // Ensure it's our turn
      if (Session.get('game_status') == STATUS_YOUR_TURN) {
        pile_data = event.currentTarget.dataset;
        // Ensure we don't have another pile
        if (Session.get('pile_id') == null || Session.get('pile_id') == pile_data.pile_id) {
          if (pile_data.num_beans == Session.get('beans')) {
            // Alert that you can not decrease a pile below zero
            $('div.errors').text('You can not take more beans from a pile than it has.');
          } else {
            // Activate game space
            activateGameSpace();

            // Ensure pile_id is set
            Session.set('pile_id', pile_data.pile_id);

            // Increment the beans when pile is clicked
            Session.set('beans', Session.get('beans') + 1);
          }
        } else {
          // Alert that only one pile can be changed
          $('div.errors').text('You can take beans from one pile.');
        }
      } else {
        // Alert that we have to wait our turn
        $('div.errors').text('Please wait your turn.');
      }
    }
  });

  Template.body.events({
    'click .reset': function (event) {
      // Unset the pile_id and beans count
      resetTurnParams();

      // Reset game space
      resetGameSpace();
    },
    'click .submit': function (event) {
      // Make the move
      makeMove();
    },
    'click .create-game': function(event) {
      // Create a new game
      createGame();
    },
    'click #login-buttons-password': function(event) {
      captureLoginEvent(event)
    },
    'keydown #login-email': function(event) {
      captureLoginEventWithEnter(event)
    },
    'keydown #login-password': function(event) {
      captureLoginEventWithEnter(event)
    }
  });

  function captureLoginEvent(event) {
    // Hacky way to insert my own user management logic in between meteor's
    var login_buttons = $(event.target.closest('#login-buttons'));
    var password = login_buttons.find('#login-password').val();
    var email = login_buttons.find('#login-email').val();
    var is_creation = login_buttons.find('.login-form-create-account').length > 0;
    if (is_creation) {
      // Create the user
      createUser(email, password);
    } else {
      // Get auth from game server
      authenticateApi(email, password);
    }
  }

  function captureLoginEventWithEnter(event) {
    if (event.keyCode == 13) {
      captureLoginEvent(event);
    }
  }


  //// Game space management functions ////

  function resetGameSpace() {
    // Clear errors
    $('div.errors').text('');

    // Set reset button to inactive
    $('button.reset').attr('disabled', 'disabled');

    // Set submit button to inactive
    $('button.submit').attr('disabled', 'disabled');
  }

  function activateGameSpace() {
    // Clear errors
    $('div.errors').text('');

    // Set reset button to active
    $('button.reset').removeAttr('disabled');

    // Set submit button to active
    $('button.submit').removeAttr('disabled');
  }

  function resetGameParams() {
    updateSessionPiles([]);
    Session.set('game_id', null);
  }

  function resetTurnParams() {
    Session.set('pile_id', null);
    Session.set('beans', 0);
  }

  function setStatus(status) {
    var status_box = $('div.turn-status');
    switch (status) {
      case STATUS_YOUR_TURN:
        status_box.css('background-color', 'lightgreen');
        status_box.text('YOU');
        break;
      case STATUS_THEIR_TURN:
        status_box.css('background-color', 'indianred');
        status_box.text('THEM');
        break;
      case STATUS_YOU_WON:
        status_box.css('background-color', 'lightskyblue');
        status_box.text('YOU WON!!');
        break;
      default: // STATUS_THEY_WON
        status_box.css('background-color', 'lightskyblue');
        status_box.text('THEY WON :-(');
        break;
    }
    Session.set('game_status', status);
  }

  function waitToUpdateGame() {
    setTimeout(getGame(), 3000);
  }

  function updateSessionPiles(piles) {
    var old_pile_data = Session.get('piles');
    var new_pile_data = [];
    var num_piles = piles.length;
    for (var i = 0; i < num_piles; i++) {
      var num_beans = piles[i];
      if (old_pile_data.length != num_piles || old_pile_data[i]['num_beans'] != num_beans) {
        if (Session.get('game_status') == STATUS_THEIR_TURN) {
          new_pile_data.push({pile_id: i, num_beans: num_beans, beans: Session.get('pile_beans')});
        } else {
          new_pile_data.push({pile_id: i, num_beans: num_beans, beans: calculateBeans(num_beans)});
        }
      } else {
        new_pile_data.push(old_pile_data[i]);
      }
    }
    Session.set('piles', new_pile_data);
  }

  function calculateBeans(num_beans) {
    var beans = [];
    for (var i = 0; i < num_beans; i++) {
      beans.push({
        left_offset: Math.floor(Math.random() * 120) + 20,
        top_offset: Math.floor(Math.random() * 100)
      });
    }
    return beans;
  }


  //// Server requests ////

  function isAuthenticated() {
    // TODO: handel updating expiration as server expiration updated (from active requests)
    if (!Session.get('auth_token') || Session.get('auth_token_expiration') < new Date()) {
      Meteor.logout();
      return false;
    }
    return true;
  }

  function getHeaders() {
    return {'Authorization': 'Token token=' + Session.get('auth_token')}
  }

  function authenticateApi(email, password) {
    Meteor.call('serverAuthenticateApi', email, password, function(error, data) {
      if (data && 'api_token' in data) {
        Session.set('auth_token', data['api_token']);
        Session.set('auth_token_expiration', new Date(data['api_token_expiration']));
      } else {
        Meteor.logout();
        Session.set('auth_token', null);
        Session.set('auth_token_expiration', null);
      }
    });
  }

  function createUser(email, password) {
    Meteor.call('serverCreateUser', email, password, function(error, data) {
      if (data && 'api_token' in data) {
        Session.set('auth_token', data['api_token']);
        Session.set('auth_token_expiration', new Date(data['api_token_expiration']));
      } else {
        Meteor.logout();
        Session.set('auth_token', null);
        Session.set('auth_token_expiration', null);
      }
    });
  }

  function createGame() {
    if (isAuthenticated() && !Session.get('game_id')) {
      var piles = [];
      var num_piles = Math.floor(Math.random() * 9) + 1;
      for (var i = 0; i < num_piles; i++) {
        var num_beans = Math.floor(Math.random() * 9) + 1;
        piles.push(num_beans);
      }

      Meteor.call('serverCreateGame', piles, getHeaders(), function(error, data) {
        if (error) {
          Meteor.logout();
        } else {
          // Unset the pile_id and beans count
          resetTurnParams();

          // Reset game space
          resetGameSpace();

          // Set game params
          if (data && 'id' in data) {
            updateSessionPiles(data['piles']);
            Session.set('game_id', data['id']);
            setStatus(STATUS_YOUR_TURN);
          }
        }
      });
    }
  }

  function getGame() {
    if (isAuthenticated()) {
      Meteor.call('serverGetGame', Session.get('game_id'), getHeaders(), function(error, data) {
        if (error) {
          Meteor.logout();
        } else if ('active_player_id' in data && data['active_player_id'] == data['human_player_id']) {
          if (data['status'] == 'complete') {
            if (data['winning_player_id'] == data['human_player_id']) {
              setStatus(STATUS_YOU_WON);
            } else {
              setStatus(STATUS_THEY_WON);
            }
            // Reset all game params
            resetGameParams();
          } else {
            setStatus(STATUS_YOUR_TURN);
            updateSessionPiles(data['piles']);
          }
        } else {
          waitToUpdateGame();
        }
      });
    }
  }

  function makeMove() {
    if (isAuthenticated()) {
      Meteor.call('serverMakeMove', Session.get('game_id'), getHeaders(), Session.get('pile_id'), Session.get('beans'), function(error, data) {
        if (error) {
          Meteor.logout();
        } else {
          // Unset the pile_id and beans count
          resetTurnParams();

          // Reset game space
          resetGameSpace();

          if ('id' in data) {
            if (data['status'] == 'complete') {
              if (data['winning_player_id'] == data['human_player_id']) {
                setStatus(STATUS_YOU_WON);
              } else {
                setStatus(STATUS_THEY_WON);
              }
              // Reset all game params
              resetGameParams();
            } else {
              setStatus(STATUS_THEIR_TURN);
              waitToUpdateGame();
              updateSessionPiles(data['piles']);
            }
          }
        }
      });
    }
  }
}

if (Meteor.isServer) {
  // TODO: Get environment-specific values from config
  var api_url = 'http://localhost:3000/api/v1';

  Meteor.methods({
    serverAuthenticateApi: function (email, password) {
      // TODO: try capturing error response codes
      var response = HTTP.post(
          api_url + '/users/auth',
          {
            data: {
              user: {
                email: email,
                password: password
              }
            }
          }
      );
      if (response['statusCode'] == 200) {
        return response['data'];
      }
      return null;
    },
    serverCreateUser: function (email, password) {
      var response = HTTP.post(
          api_url + '/users',
          {
            data: {
              user: {
                name: email,
                email: email,
                picture: 'https://i.imgur.com/bPr0qKT.jpg',
                new_password: password,
                new_password_confirmation: password
              }
            }
          }
      );
      if (response['statusCode'] == 201) {
        return response['data'];
      }
      return null;
    },
    serverCreateGame: function (piles, headers) {
      var response = HTTP.post(
          api_url + '/games',
          {
            data: {
              game: {
                piles: piles
              }
            },
            headers: headers
          }
      );
      if (response['statusCode'] == 201) {
        return response['data'];
      }
      return null;
    },
    serverGetGame: function (game_id, headers) {
      var response = HTTP.get(
          api_url + '/games/' + game_id,
          {
            headers: headers
          }
      );
      if (response['statusCode'] == 200) {
        return response['data'];
      }
      return null;
    },
    serverMakeMove: function (game_id, headers, pile_id, beans) {
      var response = HTTP.put(
          api_url + '/games/' + game_id,
          {
            data: {
              game: {
                pile: pile_id,
                beans: beans
              }
            },
            headers: headers
          }
      );
      if (response['statusCode'] == 200) {
        return response['data'];
      }
      return null;
    }
  });
}
