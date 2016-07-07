var http = require('http');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var path = require('path');
var Q = require('q');
var User = require('./db/controller').users
var Event = require('./db/controller').events
var Friendship = require('./db/controller').friendships

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../bower_components")));
app.use(express.static(path.join(__dirname, "../client")));

var port = process.env.PORT || 8080;
var currentUser = {
  username: "heyworld",
  userId: 0
}

app.get('/', function(req,res){
  res.sendFile(path.join(__dirname, "../client/login/login.html"))
})

function idToName(id) {
  User.findOne({'_id': id}, 'username',
   function(err, data) {
    if (err) {
      console.log(err)
      } else {
        return data.username
      }
    });
}

app.post('/login', function(req,res) {
  User.findOne({'username': req.body.username},
      '_id password', function(err, login) {
        if (err) {
          console.log(err);
        } else {
          if (login === null) {
            res.redirect('/?message="Username does not exist."')
          } else {
            if (login.password != req.body.password) {
              console.log('Password is invalid.');
              res.redirect('/?message="Password does not match record."');
            } else {
              console.log(login._id)
              currentUser.username = req.body.username
              currentUser.userId = login._id
              res.redirect('/main');
            }
          }
        }
      });
});

app.post('/signup', function(req,res){
  var newUser = new User()
  newUser.username = req.body.username
  newUser.password = req.body.password
  newUser.email = req.body.email
  newUser.save(function(err, results){
    if (err){
      console.log(err)
      res.redirect('/')
    } else {
      console.log("Saved: " + results)
      var newFriendship = new Friendship()
      newFriendship.userId = results._id
      newFriendship.save(function(err, data) {
        if (err) {
          console.log(err)
        } else {
          console.log("Initialized user.")
          res.redirect('/?message="You have successfully registered!"')
        }
      })
    }
  })
})

app.get('/main', function(req, res){
  res.sendFile(path.join(__dirname, "../client/main/index.html"))
})

app.post('/createevent', function(req,res){
  var newEvent = new Event()
  newEvent.host = currentUser.userId
  newEvent.title = req.body.title
  newEvent.date = req.body.date
  newEvent.time = req.body.time
  newEvent.graceperiod = req.body.graceperiod
  newEvent.location = req.body.location
  for (var i = 0; i <= req.body.guests.length; i++){
    //We are using less than or equal to because we need an extra slot to add in the host himself.
    if (req.body.guests[i] == req.body.guests[req.body.guests.length]) {
      newEvent.guests[i] = {name: currentUser.username, status: 'Coming'}
    } else {
      newEvent.guests[i] = {name: req.body.guests[i].guest, status: req.body.guests[i].status}
    }
  }
  newEvent.save(function(err, results) {
    if (err) {
      console.log(err)
      res.json(err)
    } else {
      console.log("Saved: " + results)
      res.json("Database has saved the event successfully.")
    }
  })
})

app.post('/checkin', function(req,res){
  Event.findOne({$and:[{'_id': req.body.eventId}]},
  'guests', function(err, data){
    for(var i=0; i< data.guests.length; i++){
      if(currentUser.username == data.guests[i].name){
        Event.update({'guests._id': data.guests[i]._id}, {
          'guests.$.status': req.body.status
        }, function(err, results){
          if (err) {
            console.log(err)
          } else {
            res.send(currentUser.username)
          }
        })
      }
    }
  })
})

app.get('/geteventlist', function(req,res) {
  Event.find({'host': currentUser.userId},
  'title data time location _id', function(err, data){
    if (err) {
      console.log(err)
    } else {
      console.log(data)
      res.json(data)
    }
  })
})

app.get('/searchusers', function(req,res) {
  User.find({'username': {'$regex': req.query.keyword}},
  'username', function(err, users) {
      if(err) {
        console.log(err)
      } else {
        var userList = []
        if (users===null || users.length===0) {
          res.json(userList)
        } else {
          Friendship.findOne({'userId': currentUser.userId}, 'friends', function(err, data){
            if (err) {
              console.log(err)
            } else {
              if (data.friends.length === 0) {
                for (var i=0; i< users.length; i++) {
                  if (users[i].username!==currentUser.username) {
                    var person = {
                      username: users[i].username,
                      friendship: false
                    }
                    userList.push(person)
                    if (users[i] === users[users.length-1]) {
                      console.log("outputing userlist: " + userList)
                      res.json(userList)
                    }
                  } else if (users[i].username===currentUser.username && users[i] === users[users.length-1]) {
                    //since this code wouldn't send out res.json if currentuser is the last of the search results, we are doing this extra cycle.
                    res.json(userList)
                  }
                }
              } else {
                for (var i=0; i< users.length; i++) {
                  if (users[i].username!==currentUser.username) {
                    var person = {
                      username: users[i].username,
                      friendship: false
                    }
                    for (var j=0; j<data.friends.length; j++) {
                      if (data.friends[j]==users[i]._id) {
                        person.friendship = true
                      }
                    }
                    userList.push(person)
                    if (users[i] === users[users.length-1]) {
                      console.log(userList)
                      res.json(userList)
                    }
                  } else if (users[i].username===currentUser.username && users[i] === users[users.length-1]) {
                    res.json(userList)
                  }
                }
              }
            }
          })
        }
      }
  })
})

app.post('/addfriend', function(req,res) {
  function getFriendId(username) {
    var dfd = Q.defer();
    User.findOne({'username': username}, '_id',
     function(err, data) {
       if (err) {
         dfd.reject(err)
        } else {
          dfd.resolve(data._id)
        }
      });
    return dfd.promise
  }

  function addFriend(friendId){
  var dfd = Q.defer();
  Friendship.findOne({'userId': currentUser.userId}, 'friends', function(err, data){
    if (err) {
      console.log(err)
      dfd.reject(err)
    } else {
      if (data.friends.length===0 || data === null) {
        dfd.resolve(data)
      } else if (data.friends.length!==0) {
        for (var i=0; i<data.friends.length; i++) {
          if (data.friends[i] === friendId) {
            //if one of the friends is equal to the selected friend, we return it.
            res.json(data.friends[i])
          } else if (data.friends[i] === data.friends[data.friends.length-1] && data.friends[i] !== friendId) {
            //if none are equal to the selected friend and we are in the last loop.
            dfd.resolve(data)
          }
        }
      }
    }
  })
  return dfd.promise
 }

 getFriendId(req.body.friend).then(function(friendId) {
   addFriend(friendId).then(function() {
     Friendship.findOneAndUpdate({'userId': currentUser.userId},
      {$push: {friends: friendId}}, function(err,data){
        if (err) {
          console.log(err)
        } else {
          //we created a one-way friendship; now we have to close it with another way.
          Friendship.findOneAndUpdate({'userId': friendId},
           {$push: {friends: currentUser.userId}}, function(err,data){
             if (err) {
               console.log(err)
             } else {
               res.send("We have updated successfully!")
             }
           })
        }
      })
   })
 })
})

app.get('/getfriends', function(req,res) {
  Friendship.findOne({'userId': currentUser.userId}, 'friends', function(err, data){
    if (err) {
      console.log(err)
    } else {
      var friendList = []
      if (data === null) {
        res.json(friendList)
      } else {
        for (var i = 0; i < data.friends.length; i++) {
          if (data.friends[i] != data.friends[data.friends.length - 1]) {
            User.findOne({'_id': data.friends[i]}, 'username', function(err, results) {
              friendList.push(results.username)
            })
          } else {
            User.findOne({'_id': data.friends[i]}, 'username', function(err, results) {
              friendList.push(results.username)
              res.json(friendList)
            })
          }
        }
      }
    }
  })
})

app.get('/eventdetail/:id', function(req,res){
  console.log(req.params.id)
  Event.findOne({'_id': req.params.id},
  'host title date time graceperiod location guests', function(err, data){
    if (err) {
      console.log(err)
      res.send(err);
    } else {
      console.log("Data retrieved successfully.")
      res.json(data);
    }
  })
})

app.listen(port, function(){
  console.log("Server is running on " + port);
});
