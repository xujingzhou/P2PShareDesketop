
var listOfUsers = {};
var listOfRooms = {};
var users = {};

// 房间最大人数限制
var maxHouseParticipantsAllowed = 100;
// 主播退出是否关闭房间
var autoCloseSession = true;

module.exports = exports = function (socket, config) {
    config = config || {};

    onConnection(socket);

    function appendUser(socket, params) {
        try {
            var extra = params.extra;
            var params = socket.handshake.query;

            if (params.extra) {
                try {
                    if (typeof params.extra === 'string') {
                        params.extra = JSON.parse(params.extra);
                    }
                    extra = params.extra;
                } catch (e) {
                    extra = params.extra;
                }
            }

            listOfUsers[socket.userid] = {
                socket: socket,
                connectedWith: {},
                extra: extra || {},
                admininfo: {},
                socketMessageEvent: params.socketMessageEvent || '',
                socketCustomEvent: params.socketCustomEvent || ''
            };
        } catch (e) {
            console.debug('appendUser: ' + e);
        }
    }

    function onConnection(socket) {
        var params = socket.handshake.query;
        console.debug('socket.handshake.query: ' + JSON.stringify(params));

        if (!params.userid) {
            params.userid = (Math.random() * 100).toString().replace('.', '');
        }

        if (!params.sessionid) {
            params.sessionid = (Math.random() * 100).toString().replace('.', '');
        }

        if (params.extra) {
            try {
                params.extra = JSON.parse(params.extra);
            } catch (e) {
                params.extra = {};
            }
        } else {
            params.extra = {};
        }

        var socketMessageEvent = params.msgEvent || 'Message-Event'; 
        params.socketMessageEvent = socketMessageEvent;
        var autoCloseEntireSession = params.autoCloseEntireSession === true || params.autoCloseEntireSession === 'true' || autoCloseSession;
        var sessionid = params.sessionid;
        var maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || maxHouseParticipantsAllowed) || maxHouseParticipantsAllowed;
        var maxRelayCountPerUser = params.maxRelayCountPerUser;
        var enableBroadcast = params.enableBroadcast === true || params.enableBroadcast === 'true';

        if (!!listOfUsers[params.userid]) {
            var useridAlreadyTaken = params.userid;
            params.userid = (Math.random() * 1000).toString().replace('.', '');
            socket.emit('userid-already-taken', useridAlreadyTaken, params.userid);
            return;
        }

        socket.userid = params.userid;
        appendUser(socket, params);

        socket.on('logs', function(log) {
            console.log("Message from the client: " + log);
        });

        socket.on('report-punchhole-status', function(states, remoteUserId, callback) {
            console.log("report-punchhole-status start");

      
		});

		socket.on('join-broadcast', function(user) {
			try {
			    console.log('join-broadcast - user: ' + JSON.stringify(user));
				
				if (!users[user.userid]) {
					socket.userid = user.userid;
					socket.isScalableBroadcastSocket = true;

					users[user.userid] = {
						userid: user.userid,
						broadcastId: user.broadcastId,
						isBroadcastInitiator: false,
						maxRelayCountPerUser: params.maxRelayCountPerUser,
						relayReceivers: [],
						receivingFrom: null,
                        isRelayServer:false,
						canRelay: false,
						typeOfStreams: user.typeOfStreams || {
							audio: true,
							video: true
						},
						socket: socket
					};

					notifyBroadcasterAboutNumberOfViewers(user.broadcastId);
				}

				var relayUser = getFirstAvailableBroadcaster(user.broadcastId, params.maxRelayCountPerUser);

				if (relayUser && user.userid !== user.broadcastId) {
					var hintsToJoinBroadcast = {
						typeOfStreams: relayUser.typeOfStreams,
						userid: relayUser.userid,
						broadcastId: relayUser.broadcastId
					};

					users[user.userid].receivingFrom = relayUser.userid;
					users[relayUser.userid].relayReceivers.push(
						users[user.userid]
					);
					users[user.broadcastId].lastRelayuserid = relayUser.userid;

					socket.emit('join-broadcaster', hintsToJoinBroadcast);
					socket.emit('logs', '提示：我' + '<' + user.userid + '>' + '正在获取数据从' + '<' + relayUser.userid + '>');
					relayUser.socket.emit('logs', '提示：我' + '<' + relayUser.userid + '>' + '正在转发数据给' + '<' + user.userid + '>');
				} else {
					users[user.userid].isBroadcastInitiator = true;
					socket.emit('start-broadcasting', users[user.userid].typeOfStreams);
					socket.emit('logs', '提示：我' + '<' + user.userid + '>' + '现在正在发起直播...');
				}
			} catch (e) {
			   
			}
		});

        socket.on('is-relay-server', function() {
			if (users[socket.userid]) {
				users[socket.userid].isRelayServer = true;
			}
		});

		socket.on('is-not-relay-server', function() {
			if (users[socket.userid]) {
				users[socket.userid].isRelayServer = false;
			}
		});

		socket.on('can-relay-broadcast', function() {
			if (users[socket.userid]) {
				users[socket.userid].canRelay = true;
			}
		});

		socket.on('can-not-relay-broadcast', function() {
			if (users[socket.userid]) {
				users[socket.userid].canRelay = false;
			}
		});

		socket.on('check-broadcast-presence', function(userid, callback) {
			try {
				callback(!!users[userid] && users[userid].isBroadcastInitiator === true);
			} catch (e) {
				
			}
		});

		socket.on('get-number-of-users-in-specific-broadcast', function(broadcastId, callback) {
			try {
				if (!broadcastId || !callback) return;

				if (!users[broadcastId]) {
					callback(0);
					return;
				}

				callback(getNumberOfBroadcastViewers(broadcastId));
			} catch (e) {}
		});

		function getNumberOfBroadcastViewers(broadcastId) {
			try {
				var numberOfUsers = 0;
				Object.keys(users).forEach(function(uid) {
					var user = users[uid];
					if (user.broadcastId === broadcastId) {
						numberOfUsers++;
					}
				});
				return numberOfUsers - 1;
			} catch (e) {
				return 0;
			}
		}

		function notifyBroadcasterAboutNumberOfViewers(broadcastId, userLeft) {
			try {
				if (!broadcastId || !users[broadcastId] || !users[broadcastId].socket) return;
				var numberOfBroadcastViewers = getNumberOfBroadcastViewers(broadcastId);

				if (userLeft === true) {
					numberOfBroadcastViewers--;
				}

				users[broadcastId].socket.emit('number-of-broadcast-viewers-updated', {
					numberOfBroadcastViewers: numberOfBroadcastViewers,
					broadcastId: broadcastId
				});
			} catch (e) {}
		}

		socket.ondisconnect = function() {
			try {
				
				console.debug('socket.ondisconnect() - isScalableBroadcastSocket, userid: ', socket.isScalableBroadcastSocket, socket.userid);
				if (!socket.isScalableBroadcastSocket) return;

				console.debug('socket.ondisconnect - users: ', users);
				var user = users[socket.userid];          

				if (!user) return;

				if (user.isBroadcastInitiator === false) {
					notifyBroadcasterAboutNumberOfViewers(user.broadcastId, true);
				}

				console.debug('socket.ondisconnect - user.isBroadcastInitiator: ' + user.isBroadcastInitiator);
				if (user.isBroadcastInitiator === true) {
					for (var n in users) {
						var _user = users[n];

						if (_user.broadcastId === user.broadcastId) {
							_user.socket.emit('broadcast-stopped', _user.broadcastId);
							console.debug('socket.ondisconnect - emit(\'broadcast-stopped\')');
						}
					}

					delete users[socket.userid];
					return;
				}

				if (user.receivingFrom || user.isBroadcastInitiator === true) {
					var parentUser = users[user.receivingFrom];

					if (parentUser) {
						var newArray = [];
						parentUser.relayReceivers.forEach(function(n) {
							if (n.userid !== user.userid) {
								newArray.push(n);
							}
						});
						users[user.receivingFrom].relayReceivers = newArray;
					}
				}

				if (user.relayReceivers.length && user.isBroadcastInitiator === false) {
					askNestedUsersToRejoin(user.relayReceivers);
				}

				delete users[socket.userid];
			} catch (e) {
				
			}
		};
	
		
		function askNestedUsersToRejoin(relayReceivers) {
			try {
				var usersToAskRejoin = [];

				relayReceivers.forEach(function(receiver) {
					if (!!users[receiver.userid]) {
						users[receiver.userid].canRelay = false;
						users[receiver.userid].receivingFrom = null;
						receiver.socket.emit('rejoin-broadcast', receiver.broadcastId);
					}
				});
			} catch (e) {    
		    }
		}

		function getFirstAvailableBroadcaster(broadcastId, maxRelayCountPerUser) {
			try {
				var broadcastInitiator = users[broadcastId];

				if (broadcastInitiator && broadcastInitiator.relayReceivers.length < maxRelayCountPerUser) {
					return broadcastInitiator;
				}

				if (broadcastInitiator && broadcastInitiator.lastRelayuserid) {
					var lastRelayUser = users[broadcastInitiator.lastRelayuserid];
					if (lastRelayUser && lastRelayUser.relayReceivers.length < maxRelayCountPerUser) {
						return lastRelayUser;
					}
				}

				var userFound;
				for (var n in users) {
					var user = users[n];

					if (userFound) {
						break;
					} else if (user.broadcastId === broadcastId) {
						// if (!user.relayReceivers.length && user.canRelay === true) {
						if (user.relayReceivers.length < maxRelayCountPerUser && user.canRelay === true) {
							userFound = user;
						}
					}
				}

				if (userFound) {
					return userFound;
				}

				return broadcastInitiator;
			} catch (e) {
				
			}
		}

        function getFirstAvailableRelayServer(broadcastId, maxRelayCountPerUser) {
			try {
				var broadcastInitiator = users[broadcastId];

				if (broadcastInitiator && broadcastInitiator.lastRelayServerid) {
					var lastRelayUser = users[broadcastInitiator.lastRelayServerid];
					if (lastRelayUser && lastRelayUser.relayReceivers.length < maxRelayCountPerUser) {
						return lastRelayUser;
					}
				}

				var userFound;
				for (var n in users) {
					var user = users[n];

					if (userFound) {
						break;
					} else if (user.broadcastId === broadcastId) {
						if (user.relayReceivers.length < maxRelayCountPerUser && user.canRelay === true && user.isRelayServer === true) {
							userFound = user;
						}
					}
				}

				if (userFound) {
					return userFound;
				}

                console.log("getFirstAvailableRelayServer is not found!");
				return broadcastInitiator;
			} catch (e) {
				
			}
		}

        socket.on('disconnect-with', function (remoteUserId, callback) {
            try {
                if (listOfUsers[socket.userid] && listOfUsers[socket.userid].connectedWith[remoteUserId]) {
                    delete listOfUsers[socket.userid].connectedWith[remoteUserId];
                    socket.emit('user-disconnected', remoteUserId);
                }

                if (!listOfUsers[remoteUserId]) return callback();

                if (listOfUsers[remoteUserId].connectedWith[socket.userid]) {
                    delete listOfUsers[remoteUserId].connectedWith[socket.userid];
                    listOfUsers[remoteUserId].socket.emit('user-disconnected', socket.userid);
                }
                callback();
            } catch (e) {

            }
        });

        socket.on('check-presence', function (roomid, callback) {
            try {
                if (!listOfRooms[roomid] || !listOfRooms[roomid].participants.length) {
                    callback(false, roomid, {
                        _room: {
                            isFull: false,
                            isPasswordProtected: false
                        }
                    });
                } else {
                    var extra = listOfRooms[roomid].extra;
                    if (typeof extra !== 'object' || !extra) {
                        extra = {
                            value: extra
                        };
                    }
                    extra._room = {
                        isFull: listOfRooms[roomid].participants.length >= listOfRooms[roomid].maxParticipantsAllowed,
                        isPasswordProtected: listOfRooms[roomid].password && listOfRooms[roomid].password.toString().replace(/ /g, '').length
                    };
                    callback(true, roomid, extra);
                }
            } catch (e) {

            }
        });

        function onMessageCallback(message) {
            try {
                if (!listOfUsers[message.sender]) {
                    socket.emit('user-not-found', message.sender);
                    return;
                }

                if (!message.message.userLeft && !listOfUsers[message.sender].connectedWith[message.remoteUserId] && !!listOfUsers[message.remoteUserId]) {
                    listOfUsers[message.sender].connectedWith[message.remoteUserId] = listOfUsers[message.remoteUserId].socket;
                    listOfUsers[message.sender].socket.emit('user-connected', message.remoteUserId);

                    if (!listOfUsers[message.remoteUserId]) {
                        listOfUsers[message.remoteUserId] = {
                            socket: null,
                            connectedWith: {},
                            extra: {},
                            admininfo: {}
                        };
                    }

                    listOfUsers[message.remoteUserId].connectedWith[message.sender] = socket;

                    if (listOfUsers[message.remoteUserId].socket) {
                        listOfUsers[message.remoteUserId].socket.emit('user-connected', message.sender);
                    }

                }

                if (listOfUsers[message.sender] && listOfUsers[message.sender].connectedWith[message.remoteUserId] && listOfUsers[socket.userid]) {
                    message.extra = listOfUsers[socket.userid].extra;
                    listOfUsers[message.sender].connectedWith[message.remoteUserId].emit(socketMessageEvent, message);
                }
            } catch (e) {

            }
        }

        function joinARoom(message) {
            try {
                if (!socket.admininfo || !socket.admininfo.sessionid) return;

                // var roomid = message.remoteUserId;
                var roomid = socket.admininfo.sessionid;

                if (!listOfRooms[roomid]) return; 

                if (listOfRooms[roomid].participants.length >= listOfRooms[roomid].maxParticipantsAllowed && listOfRooms[roomid].participants.indexOf(socket.userid) === -1) {

                    return;
                }

                if (listOfRooms[roomid].session && (listOfRooms[roomid].session.oneway === true || listOfRooms[roomid].session.broadcast === true)) {
                    var owner = listOfRooms[roomid].owner;
                    if (listOfUsers[owner]) {
                        message.remoteUserId = owner;

                        if (enableBroadcast === false) {
                            listOfUsers[owner].socket.emit(socketMessageEvent, message);
                        }
                    }
                    return;
                }

                if (enableBroadcast === false) {
                    // connect with all participants
                    listOfRooms[roomid].participants.forEach(function (pid) {
                        if (pid === socket.userid || !listOfUsers[pid]) return;

                        var user = listOfUsers[pid];
                        message.remoteUserId = pid;
                        user.socket.emit(socketMessageEvent, message);
                    });
                }
            } catch (e) {

            }

        }

        function appendToRoom(roomid, userid) {
            try {
                if (!listOfRooms[roomid]) {
                    listOfRooms[roomid] = {
                        maxParticipantsAllowed: parseInt(params.maxParticipantsAllowed || maxHouseParticipantsAllowed) || maxHouseParticipantsAllowed,
                        owner: userid, 
                        participants: [userid],
                        extra: {}, 
                        socketMessageEvent: '',
                        socketCustomEvent: '',
                        identifier: '',
                        session: {
                            audio: true,
                            video: true
                        }
                    };
                }

                if (listOfRooms[roomid].participants.indexOf(userid) !== -1) return;
                listOfRooms[roomid].participants.push(userid);
            } catch (e) {

            }
        }

        function closeOrShiftRoom() {
            try {
                if (!socket.admininfo) {
                    return;
                }

                var roomid = socket.admininfo.sessionid;

                if (roomid && listOfRooms[roomid]) {
                    if (socket.userid === listOfRooms[roomid].owner) {
                        if (autoCloseEntireSession === false && listOfRooms[roomid].participants.length > 1) {
                            var firstParticipant;
                            listOfRooms[roomid].participants.forEach(function (pid) {
                                if (firstParticipant || pid === socket.userid) return;
                                if (!listOfUsers[pid]) return;
                                firstParticipant = listOfUsers[pid];
                            });

                            if (firstParticipant) {
                                listOfRooms[roomid].owner = firstParticipant.socket.userid;

                                firstParticipant.socket.emit('set-isInitiator-true', roomid);

                                // remove from room's participants list
                                var newParticipantsList = [];
                                listOfRooms[roomid].participants.forEach(function (pid) {
                                    if (pid != socket.userid) {
                                        newParticipantsList.push(pid);
                                    }
                                });
                                listOfRooms[roomid].participants = newParticipantsList;
                            } else {
                                delete listOfRooms[roomid];
                            }
                        } else {
                            delete listOfRooms[roomid];
                        }
                    } else {
                        var newParticipantsList = [];
                        listOfRooms[roomid].participants.forEach(function (pid) {
                            if (pid && pid != socket.userid && listOfUsers[pid]) {
                                newParticipantsList.push(pid);
                            }
                        });
                        listOfRooms[roomid].participants = newParticipantsList;
                    }
                }
            } catch (e) {

            }
        }

        socket.on(socketMessageEvent, function (message, callback) {
            if (message.remoteUserId && message.remoteUserId === socket.userid) {            
                return;
            }

            try {
                if (message.remoteUserId && message.remoteUserId != 'system' && message.message.newParticipationRequest) {
                    if (enableBroadcast === true) {
                        var user = listOfUsers[message.remoteUserId];
                        if (user) {
                            user.socket.emit(socketMessageEvent, message);
                        }

                        if (listOfUsers[socket.userid] && listOfUsers[socket.userid].extra.broadcastId) {
                            appendToRoom(listOfUsers[socket.userid].extra.broadcastId, socket.userid);
                        }
                    } else if (listOfRooms[message.remoteUserId]) {
                        joinARoom(message);
                        return;
                    }
                }

                if (!listOfUsers[message.sender]) {
                    listOfUsers[message.sender] = {
                        socket: socket,
                        connectedWith: {},
                        extra: {},
                        admininfo: {}
                    };
                }

                onMessageCallback(message);
            } catch (e) {

            }
        });

        socket.on('open-room', function (arg, callback) {
            callback = callback || function () { };

            try {
                closeOrShiftRoom();

                if (listOfRooms[arg.sessionid] && listOfRooms[arg.sessionid].participants.length) {
                    callback(false, '该房间是无效的');
                    return;
                }

                if (enableBroadcast === true) {
                    arg.session.scalable = true;
                    arg.sessionid = arg.extra.broadcastId;
                }

                if (!listOfUsers[socket.userid]) {
                    listOfUsers[socket.userid] = {
                        socket: socket,
                        connectedWith: {},
                        extra: arg.extra,
                        admininfo: {},
                        socketMessageEvent: params.socketMessageEvent || '',
                        socketCustomEvent: params.socketCustomEvent || ''
                    };
                }
                listOfUsers[socket.userid].extra = arg.extra;

                if (arg.session && (arg.session.oneway === true || arg.session.broadcast === true)) {
                    autoCloseEntireSession = true;
                }
            } catch (e) {

            }

            appendToRoom(arg.sessionid, socket.userid);

            try {
                if (enableBroadcast === true) {
                    if (Object.keys(listOfRooms[arg.sessionid]).length == 1) {
                        listOfRooms[arg.sessionid].owner = socket.userid;
                        listOfRooms[arg.sessionid].session = arg.session;
                    }
                } else {
                    listOfRooms[arg.sessionid].owner = socket.userid;
                    listOfRooms[arg.sessionid].session = arg.session;
                    listOfRooms[arg.sessionid].extra = arg.extra || {};
                    listOfRooms[arg.sessionid].socketMessageEvent = listOfUsers[socket.userid].socketMessageEvent;
                    listOfRooms[arg.sessionid].socketCustomEvent = listOfUsers[socket.userid].socketCustomEvent;
                    listOfRooms[arg.sessionid].maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || maxHouseParticipantsAllowed) || maxHouseParticipantsAllowed;

                    if (arg.identifier && arg.identifier.toString().length) {
                        listOfRooms[arg.sessionid].identifier = arg.identifier;
                    }

                }

            } catch (e) {

            }

            try {
                callback(true);
            } catch (e) {

            }
        });

        socket.on('join-room', function (arg, callback) {
            callback = callback || function () { };

            try {
                closeOrShiftRoom();

                if (enableBroadcast === true) {
                    arg.session.scalable = true;
                    arg.sessionid = arg.extra.broadcastId;
                }

                if (!listOfUsers[socket.userid]) {
                    listOfUsers[socket.userid] = {
                        socket: socket,
                        connectedWith: {},
                        extra: arg.extra,
                        admininfo: {},
                        socketMessageEvent: params.socketMessageEvent || '',
                        socketCustomEvent: params.socketCustomEvent || ''
                    };
                }
                listOfUsers[socket.userid].extra = arg.extra;
            } catch (e) {

            }

            try {
                if (!listOfRooms[arg.sessionid]) {
                    callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                    return;
                }
            } catch (e) {

            }

            try {
                if (listOfRooms[arg.sessionid].participants.length >= listOfRooms[arg.sessionid].maxParticipantsAllowed) {
                    callback(false, '房间已满');
                    return;
                }
            } catch (e) {

            }

            appendToRoom(arg.sessionid, socket.userid);

            try {
                listOfUsers[socket.userid].socket.admininfo = {
                    sessionid: arg.sessionid,
                    session: arg.session,
                    mediaConstraints: arg.mediaConstraints,
                    sdpConstraints: arg.sdpConstraints,
                    streams: arg.streams,
                    extra: arg.extra
                };
            } catch (e) {

            }

            try {
                callback(true);
            } catch (e) {

            }
        });

        socket.on('disconnect', function () {
            try {
                if (socket && socket.namespace && socket.namespace.sockets) {
                    delete socket.namespace.sockets[this.id];
                }
            } catch (e) {

            }

            try {
                if (listOfUsers[socket.userid]) {
                    for (var s in listOfUsers[socket.userid].connectedWith) {
                        listOfUsers[socket.userid].connectedWith[s].emit('user-disconnected', socket.userid);

                        if (listOfUsers[s] && listOfUsers[s].connectedWith[socket.userid]) {
                            delete listOfUsers[s].connectedWith[socket.userid];
                            listOfUsers[s].socket.emit('user-disconnected', socket.userid);
                        }
                    }
                }
            } catch (e) {

            }

            closeOrShiftRoom();

            delete listOfUsers[socket.userid];         

            if (socket.ondisconnect) {
                try {
                    socket.ondisconnect();
                }
                catch (e) {

                }
            }

        });
    }
};
