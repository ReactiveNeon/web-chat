var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var port = 80;

app.use(express.static('./client'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/client/index.html');
});

SOCKET_LIST = {};
USERS = {};

ROOMS = {};

var Room = function(roomID){
    var self = {}
    self.roomID = roomID;
    self.history = []; //message history
    self.activeUsers = [];

    self.addUser = function(user) {
        self.activeUsers.push(user);

        var activeUsernames = [];
        for (var i in self.activeUsers) {
            activeUsernames.push(self.activeUsers[i].username);
        }

        console.log(user.username + ' added to room: ' + self.roomID);
        // other stuff when user joins room
        for(var i in self.history) {
            user.utilCbs[0](self.history[i]);
        }

        for(var i in self.activeUsers) {
            msg = '<strong>' + user.username + '</strong> has joined the chat!';
            self.history.push(msg);
            self.activeUsers[i].utilCbs[0](msg);
            
            self.activeUsers[i].utilCbs[1](activeUsernames);
            console.log('packages sent to: ' + self.activeUsers[i].username);
        }
    }

    self.removeUser = function(user) {
        self.activeUsers.splice(self.activeUsers.indexOf(user), 1);

        var activeUsernames = [];
        for (var i in self.activeUsers) {
            activeUsernames.push(self.activeUsers[i].username);
        }

        for (var i in self.activeUsers) {
            self.activeUsers[i].utilCbs[1](activeUsernames);
        }
    }

    self.updateChat = function(data) {

        msg = '<strong>' + data.username + '</strong>: ' + data.msg
        self.history.push(msg);

        if(data.username === 'cat') {
            msg = '<img src="profile-image.jpg" style="width: 40px; height: 40px;">' + msg;
        }

        for(var i in self.activeUsers) {
            self.activeUsers[i].utilCbs[0](msg);
        }
    };

    self.hasUsername = function(username) {
        for (var i in self.activeUsers) {
            if (self.activeUsers[i].username == username) {
                return false;
            }

            return true;
        }
    }

    return self;
};

var createRoom = function(roomID) {
    ROOMS[roomID] = Room(roomID);

    console.log('created room: ' + roomID);
};

var joinRoom = function(user) {
    if (ROOMS[user.roomID] === undefined) {
        createRoom(user.roomID);
    }

    ROOMS[user.roomID].addUser(user);
};

var User = function(socket, roomID, username, cb) {
    var self = {};
    self.socket = socket;
    self.roomID = roomID;
    self.username = username;
    self.utilCbs = cb;
    self.isCat = false;

    if (username === 'cat'){
        self.isCat = true;
    }

    joinRoom(self);

    return self;
}

const nsp = io.of('/chat-room');
nsp.on('connection', function(socket){
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    var sendMsg = function(msg) {
        socket.emit('recv-msg', {msg: msg});
    };

    // update active user list on all clients
    var updateUsers = function(users) {
        socket.emit('update-users', {users: users});
    };

    // when the client sends a login request
    socket.on('logged-in', function(data){

        // data contains: username, roomID
        var validUsername = false;

        if (ROOMS[data.roomID] === undefined) {
            validUsername = true;
        } else {
            if (ROOMS[data.roomID].hasUsername(data.username)) {
                validUsername = true;
            }
        }

        if (validUsername) {
            USERS[socket.id] = User(socket, data.roomID, data.username, [sendMsg, updateUsers]);

            // tell the client their username is good.
            socket.emit('login-confirmed', {roomID: data.roomID});

        } else {
            socket.emit('login-denied', {msg:'Username "' + data.username + '" is taken.'});
        } 
    });

    // when client sends chat tell everyone
    socket.on('new-chat', function(data){
        data.username = USERS[socket.id].username;

        var room = ROOMS[USERS[socket.id].roomID];
        room.updateChat(data);
    });

    socket.on('disconnect', function(){
        var user = USERS[socket.id];

        if (user != undefined) {
            var room = ROOMS[user.roomID];
            room.removeUser(user);
        }

        delete SOCKET_LIST[socket.id];
        delete USERS[socket.id];
    });
});

http.listen(port, function(){
    console.log('listening on ${port}');
});
