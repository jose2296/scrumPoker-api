
const io = require('socket.io')();
const firebase = require('firebase');
const usersByRoom = {}

const updateCount = roomName => {
    console.log(io.sockets);
    // const userCount = io.sockets.clients(roomName).length
    // // we do not update if the count did not change
    // if (userCount === usersByRoom[roomName]) { return }
    // usersByRoom[roomName] = userCount
    // io.emit('updateCount', { roomName, userCount })
}




// Set the configuration for your app
// TODO: Replace with your project's config object
var config = {
    apiKey: "AIzaSyA6rpojdB5jcb0-48nO6qCFOmJ1Om_qadk",
    authDomain: "scrumpoker-22.firebaseapp.com",
    databaseURL: "https://scrumpoker-22.firebaseio.com/",
    // storageBucket: "bucket.appspot.com"
};
firebase.initializeApp(config);
// Get a reference to the database service
var database = firebase.database();

// database.ref('/').once('value').then(data => {
//     // rooms = data.val();
//     console.log(data.val());
// })
//  .on('value', (data) => {
//     console.log(data.val());
// })


const cards = [
    {
        label: '1/2',
        points: 0.5,
        type: 'type-3'
    },
    {
        label: '1',
        points: 1,
        type: 'type-1'
    },
    {
        label: '2',
        points: 2,
        type: 'type-2'
    },
    {
        label: '3',
        points: 3,
        type: 'type-3'
    },
    {
        label: '5',
        points: 5,
        type: 'type-1'
    },
    {
        label: '8',
        points: 8,
        type: 'type-2'
    },
    {
        label: '10',
        points: 10,
        type: 'type-3'
    }
];


const initRoomData = {
    users: [],
    userAdmin: null,
    userVotes: {},
    status: 'ready-to-vote',
};

let rooms = {
    platform: {
        id: 'platform',
        name: 'Platform',
        ...initRoomData
    },
    api: {
        id: 'api',
        name: 'Api',
        ...initRoomData
    },
    layout: {
        id: 'layout',
        name: 'Layout',
        ...initRoomData
    }
};

database.ref('/rooms').set(rooms);
database.ref('/users').set(null);
database.ref('/cards').set(cards);


const activeUsers = {};

const create_UUID = () => {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

const leaveRoom = (socket, socketRoom) => {
    rooms = rooms.map(room => {
        let users = room.users;
        if (room.name === socketRoom) {
            users = room.users.filter(user => user !== socket.userName);
        }

        delete room.userVotes[socket.userName];
        return {
            ...room,
            users,
            userAdmin: users.length ? room.userAdmin : null
        }
    });
    socket.leave(socketRoom);
};

const leaveRoom2 = (socket, currentUser) => {
    database.ref(`/rooms/${currentUser.room}/users/${currentUser.id}`).remove();
    database.ref(`/rooms/${currentUser.room}`).once('value', async (room) => {
        const currentRoom = room.val();
        if (currentRoom.adminUser === currentUser.id) {
            if (currentRoom.users) {
                const newUserid = Object.keys(currentRoom.users)[0];
                database.ref(`/rooms/${currentUser.room}/adminUser`).set(newUserid);
            } else {
                database.ref(`/rooms/${currentUser.room}/adminUser`).remove();
                database.ref(`/rooms/${currentUser.room}/status`).set('ready-to-start')
            }
        }
        socket.leave(currentUser.room);
        const response = await getRoomDetails(currentUser.room);
        const cardsRef = (await database.ref(`/cards`).once('value', _cards => _cards.val())).val();
        console.log(cardsRef);
        io.sockets.in(currentUser.room).emit("send-room", response, cardsRef);
    });
};

const getRooms = async (roomName) => {
    return await database.ref(`/rooms/${roomName}`).once('value', async room => await room.val());
};

const getUsers = async () => {
    return await database.ref(`/users`).once('value', async users => await users.val());
};

const getRoomDetails = async (roomName, restart) => {
    const roomRef = await (await getRooms(roomName)).val();
    const allUsers = await (await getUsers()).val();

    const users = roomRef.users ? Object.keys(roomRef.users).map(userId => allUsers[userId]) : [];
    const res = {
        ...roomRef,
        users
    };
    return res;

    // const room = rooms.find(room => room.name === roomName);
    // const users = room.users.map(userName => (activeUsers[userName]));
    // if (restart) {
    //     rooms = rooms.map(_room => ({
    //         ..._room,
    //         userVotes: _room.name === room.name ? {} : _room.userVotes
    //     }))
    // }
    // return {
    //     ...room,
    //     users
    // }
};

const sendRooms = () => {
    database.ref(`/rooms`).once('value', rooms => {
        io.emit("send-rooms", rooms);
    });
}


io.on('connection', socket => {
    // socket.emit('rooms', io.sockets.adapter.rooms)

    socket.on('disconnect', () => {
        io.emit("user-disconnected", socket.userName);

        database.ref(`/users/${socket.userName}`).once('value', (user) => {
            const currentUser = user.val();

            if (currentUser && currentUser.room) {
                leaveRoom2(socket, currentUser);
            }

            database.ref(`/users/${socket.userName}`).remove();
        });
    });

    // TODO: NO used
    socket.on("send-message", function (data) {
        console.log(data);
        io.emit("send-message", data);
    });


    // ScrumPoker api
    socket.on('new-user', function (data) {
        socket.userName = create_UUID();
        database.ref(`/users`).update({ [socket.userName]: {
            id: socket.userName,
            name: data,
            room: null
        }});
        database.ref(`/users/${socket.userName}`).once('value', (user) => {
            const currentUser = user.val();
            // console.log(user.val());
            socket.emit('me', currentUser);
        });

        // activeUsers[socket.userName] = {
        //     id: socket.userName,
        //     userName: data,
        //     room: null
        // };
    });

    socket.on('update-user', function (name) {
        database.ref(`/users/${socket.userName}/name`).set(name);
        database.ref(`/users/${socket.userName}`).once('value', user => {
            io.emit('me', user);
        });
    });

    socket.on("get-rooms", function () {
        sendRooms();
    });

    socket.on("get-room", async function (roomName) {
        console.log('get-room');
        const response = await getRoomDetails(roomName);
        const cardsRef = (await database.ref(`/cards`).once('value', _cards => _cards.val())).val();

        io.sockets.in(roomName).emit("send-room", response, cardsRef);
    });

    // TODO:
    socket.on("start-voting", async function (roomName) {
        console.log('start-voting');
        database.ref(`/rooms/${roomName}/status`).set('voting');
        const room = await getRoomDetails(roomName, true);

        io.sockets.in(roomName).emit('voting-started', room);
        sendRooms();
    });

    // TODO:
    socket.on("end-voting", async function (roomName) {
        console.log('end-voting');
        const room = await getRoomDetails(roomName);

        io.sockets.in(roomName).emit('voting-ended', room);
    });

    // TODO:
    socket.on("vote", async function (points) {
        console.log('vote');
        const currentUser = (await database.ref(`users/${socket.userName}`).once('value', user => user.val())).val();
        const roomName = currentUser.room;

        database.ref(`/rooms/${roomName}/userVotes/${currentUser.id}`).set(points);

        let response = await getRoomDetails(roomName);

        io.sockets.in(roomName).emit('votes', response);

        if (Object.keys(response.userVotes).length === response.users.length) {
            database.ref(`/rooms/${roomName}/status`).set('voted');
            const room = await getRoomDetails(roomName);
            database.ref(`/votes/${roomName}`).push(room.userVotes);

            io.sockets.in(roomName).emit('voting-ended', room);
        }
    });



    // socket.on("get-users-in-room", function (roomName) {
    //     const users = rooms.find(room => room.name === roomName).users.map(userName => ({
    //         ...activeUsers[userName],
    //         userAdmin: rooms.find(room => room.name === roomName).userAdmin
    //     }));
    //     io.sockets.in(roomName).emit("send-users-in-room", users);
    // });

    socket.on('join-room', async function (data) {
        console.log('join-room');
        const currentUser = await (await database.ref(`/users/${socket.userName}`).once('value', (user) => user.val())).val();

        if (currentUser.room) {
            leaveRoom2(socket);
        }
        socket.join(data.roomId);
        database.ref(`/users/${currentUser.id}`).update({ room: data.roomId });
        database.ref(`/rooms/${data.roomId}/users`).update({ [socket.userName]: socket.userName });

        const currentRoom = await (await database.ref(`/rooms/${data.roomId}`).once('value', (room) => room.val())).val();

        if (currentRoom && !currentRoom.adminUser) {
            database.ref(`/rooms/${data.roomId}/adminUser`).set(socket.userName);
        }

        sendRooms();

        socket.emit('room-joined', currentRoom);
        console.log('room-joined');
    });


    // socket.on('join room', function (room) {
    //     socket.join(room);
    //     updateCount(room);

    //     io.sockets.in(room).emit('send-message', {
    //         room,
    //         message: 'New user'
    //     });

    //     // console.log(io.sockets.adapter.rooms);
    // })

    // socket.on('send-message', function(data) {
    //     console.log("Client data: " + data);
    //     io.sockets.in(data.room).emit(data.message);
    // });

});

io.listen(process.env.PORT || 8080, { origins: '*:*'});
