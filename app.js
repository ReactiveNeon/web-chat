var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var port = 3000;

app.use(express.static('./client'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/client/index.html');
});

SOCKET_LIST = {};
USERS = {};

ROOMS = {};

const DO_PROTECT_XSS = true;
const HELP_INFO = 'Help Information Placeholder';

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
            msg = '<h4><i style="color: red; font-size: 25;">' + user.username + ' </i> has joined the chat!</h4>';
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

        if (DO_PROTECT_XSS) {
            //filterMsg(msg);
        }

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

    self.commandSent = function(user, command){
        msg = '<strong>[Server]</strong> ';

        if (command === '/help'){
            msg += HELP_INFO;
        } else if (command === '/reset') {
            //reset page
        } else if (command.substring(0, 5) === '/kick') {
            if (user.isAdmin){
                var username = command.slice(6, command.length);
                var remove = getWithUsername(username);
            
                if (remove != undefined){
                    remove.utilCbs[2]('You have been kicked by Moderator.'); //remove the user
                    msg += 'Removed user: ' + username;
                } else {
                    msg += 'User: "' + username + '" does not exist';
                }
            } else {
                msg += 'You are not an admin';
            }
        } else if (command.substring(0, 5) === '/mute') {
            var username = command.slice(6, command.length);
            
        } else if (command.substring(0, 5) === '/kill'){
            delete ROOMS[self.roomID];
        }else {
            msg = 'Sorry we do not support that command yet';
        }

        user.utilCbs[0](msg);
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

var filerMsg = function(msg){

};

var getWithUsername = function(username) {
    keys = Object.keys(USERS);
    for (var i in keys){
        user = USERS[keys[i]];

        if (username === user.username) {
            return user;
        }
    }

    return undefined;
}

var User = function(roomID, username, cb, admin) {
    var self = {};
    self.roomID = roomID;
    self.username = username;
    self.utilCbs = cb;
    self.isCat = false;
    self.stats = {'chats': 0};
    self.isAdmin = admin;

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

    var roomElement = function(roomID, activeUsers) {
        this.roomID = roomID;
        this.activeUsers = activeUsers;
    };
    var elements = [];
    for (var i in Object.keys(ROOMS)){
        if (ROOMS[Object.keys(ROOMS)[i]] != undefined){
            var activeUsers = 0;

            if (ROOMS[Object.keys(ROOMS)[i]].activeUsers != undefined){
                activeUsers = ROOMS[Object.keys(ROOMS)[i]].activeUsers.length;
            }

            console.log(ROOMS[Object.keys(ROOMS)[i]].roomID);

            elements.push(new roomElement(ROOMS[Object.keys(ROOMS)[i]].roomID, activeUsers))
        }
    }
    socket.emit('chat-room-list', {rooms: elements});

    var sendMsg = function(msg) {
        socket.emit('recv-msg', {msg: msg});
    };

    // update active user list on all clients
    var updateUsers = function(users) {
        socket.emit('update-users', {users: users});
    };

    var removeUser = function(reason) {
        if (USERS[socket.id] != undefined) {
            var room = ROOMS[USERS[socket.id].roomID];
            room.removeUser(USERS[socket.id]);
        }
        
        socket.emit('removing', {data: reason})
        console.log('test');
        delete USERS[socket.id];
        delete SOCKET_LIST[socket.id];
    };

    // when the client sends a login request
    socket.on('logged-in', function(data){

        // data contains: username, roomID
        var validUsername = true;

        if (validUsername) {
            USERS[socket.id] = User(data.roomID, data.username, [sendMsg, updateUsers, removeUser], false);

            // tell the client their username is good.
            socket.emit('login-confirmed', {roomID: data.roomID});

        } else {
            socket.emit('login-denied', {msg:'Username "' + data.username + '" is taken.'});
        } 
    });

    socket.on('admin-login', function(data){
        USERS[socket.id] = User(data.roomID, 'admin_' + data.username, [sendMsg, updateUsers, removeUser], true);

            // tell the client their username is good.
            socket.emit('login-confirmed', {roomID: data.roomID});
    });

    // when client sends chat tell everyone
    socket.on('new-chat', function(data){
        if (data.msg === ''){
            return;
        }

        if (USERS[socket.id] != undefined) {
            data.username = USERS[socket.id].username;
            var room = ROOMS[USERS[socket.id].roomID];

            if (data.msg.charAt(0) === '/'){
                room.commandSent(USERS[socket.id], data.msg);
            } else {
                room.updateChat(data);
            }
        }
    });

    socket.on('disconnect', function(){
        if (USERS[socket.id] != undefined) {
            USERS[socket.id].utilCbs[2](USERS[socket.id]);
        }

        delete SOCKET_LIST[socket.id];
    });
});

http.listen(port, function(){
    console.log('listening on ${port}');
});
