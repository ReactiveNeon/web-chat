var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
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

        for(var i in self.activeUsers) {
            self.activeUsers[i].sendMsg('<strong>' + user.username + '</strong> has joined the chat!')
        }

        console.log(user.username + ' added to room: ' + self.roomID);
        // other stuff when user joins room
    }

    self.updateChat = function(data) {
        for(var i in self.activeUsers) {
            self.activeUsers[i].sendMsg('<strong>' + data.username + '</strong>: ' + data.msg);
        }
    };

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

var isUsernameAvailable = function(u) {
    return true;
};

var User = function(socket, roomID, username, cb) {
    var self = {};
    self.socket = socket;
    self.roomID = roomID;
    self.username = username;
    self.sendMsg = cb;

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

    // when the client sends a login request
    socket.on('logged-in', function(data){

        // data contains: username, roomID

        if (isUsernameAvailable(data.username)) {
            USERS[socket.id] = User(socket, data.roomID, data.username, sendMsg);

            // tell the client their username is good.
            socket.emit('login-confirmed', {roomID: data.roomID});

            // tell all users to print welcome message
            //nsp.emit('user-joined', {username: data.username});
            
            // update active user list on all clients
            //io.emit('update-users', {users: USERS}); // UPDATE
        } else {
            socket.emit('login-denied', {msg:'Username: ' + data.username + ' is taken.'});
        } 
    });



    // when client sends chat tell everyone
    socket.on('new-chat', function(data){
        data.username = USERS[socket.id].username;

        //nsp.to('test').emit('recv-chat', {msg: '<strong>' + USERS[socket.id].username + '</strong>: ' + data.msg});
        room = ROOMS[USERS[socket.id].roomID];
        room.updateChat(data);
    });

    socket.on('disconnect', function(){
        delete SOCKET_LIST[socket.id];
        delete USERS[socket.id];
    });
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});