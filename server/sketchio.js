/**
 * @author Chih-Pin Hsiao
 * @email: chipin01@gmail.com
 */
//"use strict";
process.title = 'sketch-server';
var oneDay = 86400000;
var java = require("java");

// load java modules
java.classpath.push("commons-lang3-3.1.jar");
java.classpath.push("commons-io.jar");
java.classpath.push("commons-math3-3.3.jar");
java.classpath.push("apprentice.jar");      // apprentice library
java.classpath.push("core.jar");            // processing
java.classpath.push("flexjson.jar");
java.classpath.push("ABAGAIL.jar");

// Start the Drawing Apprentice server
var Apprentice = java.import('jcocosketch.nodebridge.Apprentice');

// initialize required module
var express = require('express'),
    passport = require('passport'),
    util = require('util'),
    session = require('express-session'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    mongoConfig = require('./configuration/mongoServerConfig'),
    strategies = require('./strategies'), 
    http = require('http'),
    app = express(),
    canvas2D = require('./dappCanvas');

// Passport session setup.
passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

// Use various strategies.
passport.use(strategies.Facebook);
passport.use(strategies.Google);

//=====================Set Up Express App=====================\\
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'keyboard cat', key: 'sid' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

// log-in page for now
app.get('/', function (req, res) {
    res.render('index', { user: req});
});
// ensure authentication if the user directly connect to /app page
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/');
}
app.get('/app', ensureAuthenticated, function (req, res) {
    res.render('app', { user: req.user._raw, sessionId: req.sessionID });
});
// facebook authentication
app.get('/auth/facebook', passport.authenticate('facebook', { scope: 'email' }));
app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    function (req, res) {
        res.redirect('/app');
    }
);
// google authentication
app.get('/auth/google', passport.authenticate('google', { scope: 'https://www.googleapis.com/auth/plus.login' }));
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
        res.redirect('/app');
});
// when log-out
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});
// Start to listen the app
app.listen(3000);
//===================== Finished Express App Set Up ===================\\

//===================== Set up socket io server =====================\\
var server = http.Server(app);
var io = require('socket.io')(server);
var isGrouping = false;
server.listen(8080);
//server.listen(81); // for adam server

io.on('connection', function (so) {
    // set up closure varialbes
    var apprentice = new Apprentice();
    var systemStartTime = (new Date()).getTime();
    var timeout;
    var userProfile;
    var sessionID;
    var canvasSize = {width: 0, height: 0};

    apprentice.setCurrentTime(systemStartTime);

    console.log("new client connected");

    so.emit('newconnection', { hello: "world" });

    function onOpen(hello) {
        if (hello) {
            canvasSize.width = hello.width;
            canvasSize.height = hello.height;
            apprentice.setCanvasSize(hello.width, hello.height);
            userProfile = hello.user;
            sessionID = hello.sessionId;
        }
    }

    function getData() {
        var userLines;
        var computerLines;

        apprentice.getUserLines(function (err, item) {
            if (err) {
                console.log(err);

            } else {
                userLines = item;
                afterUserLines();
            }
        });

        function afterUserLines() {
            apprentice.getComputerLines(function (err, item) {
                if (err) {
                    console.log(err);
                } else {
                    computerLines = item;
                    emitData();
                }
            });
        }

        function emitData() {
            var allLines = {
                userLines: userLines,
                computerLines: computerLines
            };

            so.emit('allData', allLines);
        }
    }

    function onSaveDataOnDb() {
        if(userProfile){
            var userId = userProfile.id;
    
            console.log(userId);
            console.log(sessionID);
    
            var userLines;
            var computerLines;
            apprentice.getUserLines(function(err, item) {
                if(err) {
                    console.log(err);
                } else {
                    try{
                        userLines = JSON.parse(item);
                    }catch(e){
                        console.log(e);
                    }
                    afterUserLines();
                }
            });
    
            function afterUserLines() {
                apprentice.getComputerLines(function(err, item) {
                    if (err) {
                        console.log(err);
                    } else {
                        try{
                            computerLines = JSON.parse(item);
                        }catch(e){
                            console.log(e)
                        }
                        saveData();
                    }
                });
            }
    
            function saveData() {
                canvas2D.SaveStrokesIntoPng(canvasSize, sessionID, userLines, computerLines);
                
                var options = {
                    host:       mongoConfig.host,
                    port:       mongoConfig.port,
                    path:       mongoConfig.base_path + userId + '/session/' + sessionID,
                    auth:       mongoConfig.user + ":" + mongoConfig.pass,
                    method:     'POST',
                    headers:    mongoConfig.headers
                };
    
                var req = http.request(options, function(res) {
                    var data = "";
                    res.on('data', function(chunk) {
                        data += chunk;
                    });
                    res.on('end', function() {
                        console.log(data);
                    });
                });
                var postData = JSON.stringify({
                    name: userProfile['name'],
                    age_range: userProfile['age_range'],
                    gender: userProfile['gender'],
                    email: userProfile['email'],
                    userLines: userLines,
                    computerLines: computerLines
                });
                req.write(postData);
                req.end();
            }
        }
    }

    function onNewStrokeReceived(data) {
        var d = JSON.parse(data);

        var stroke = d.data;

        var stroketime = java.newLong(stroke.timestamp);
        // categorize if it is grouping or not
        if (isGrouping)
            apprentice.startGroupingSync(stroketime);
        else
            apprentice.addNewStrokeSync(stroketime);

        var pts = stroke.packetPoints;
        var returnSt = [];

        // adding all the points in the stroke
        for (var i = 0; i < pts.length; i++) {
            var pt = pts[i];
            var pttime = pt.timestamp;
            //console.log(pt.timestamp);
            apprentice.addPointSync(parseInt(pt.x, 10), parseInt(pt.y, 10), pt.timestamp, pt.id);
        }
        // Todo: reconstruct the message to send out

        if (isGrouping) {
            apprentice.Grouping(function (err, result) {
                if (result != null) {
                    for (var i = 0; i < result.sizeSync(); i++) {
                        var newline = result.getSync(i);

                        var newpkpts = [];
                        for (var j = 0; j < newline.sizeSync(); j++) {
                            var newpt = newline.getSync(j);

                            newpkpts.push(CreatePacketPoint(newpt));
                        }
                        stroke.packetPoints = newpkpts;

                        // decode to JSON and send the message
                        var resultmsg = JSON.stringify(stroke);
                        io.emit('respondStroke', resultmsg);
                        apprentice.setModeSync(0);
                    }
                }
            });
        } else {
            apprentice.addLine(stroke.color.r, stroke.color.g, stroke.color.b, stroke.color.a, stroke.lineWidth);

            if (timeout != "" || timeout != null) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(function () {
                apprentice.getDecision(function (err, results) {
                    if (results != null) {
                        for (var j = 0; j < results.sizeSync(); j++) {
                            var newpkpts = [];
                            var result = results.getSync(j);
                            for (var i = 0; i < result.sizeSync(); i++) {
                                var newpt = result.getSync(i);

                                newpkpts.push(CreatePacketPoint(newpt));
                            }
                            stroke.packetPoints = newpkpts;

                            // decode to JSON and send the message
                            var resultmsg = JSON.stringify(stroke);
                            io.emit('respondStroke', resultmsg);
                        }
                   //console.log("sending: " + resultmsg);
                    }
                });
            }, 2000);
        }
        so.broadcast.emit('respondStroke', JSON.stringify(d.data));
    }

    function vote(isUp) {
		var vote = isUp ? 1 : 0;
		var resultVote = JSON.stringify(isUp); 
		io.emit('updateScore', resultVote);
        apprentice.voteSync(vote); 
    }

    function onClear() {
        apprentice.clearSync();
    }

    function onModeChanged(mode) {
        var m = JSON.parse(mode);
        if (m == 3)
            isGrouping = true;
        else if (m == 4)
            isGrouping = false;
        else
            apprentice.setModeSync(m);
    }

    so.on('onOpen', onOpen);
    so.on('SetCreativty', function (level) {
        var d = JSON.parse(level);
        apprentice.setCreativityLevel(d);
    });
    so.on('setAgentOn', function (ison) {
        var isOnBool = JSON.parse(ison);
        apprentice.setAgentOn(!isOnBool);
    });
    so.on('getData', getData);
    so.on('touchdown', function () {
        if (timeout != "" || timeout != null) {
            clearTimeout(timeout);
        }
    });
    so.on('disconnect', onSaveDataOnDb);
    so.on('touchup', onNewStrokeReceived);
    so.on('setMode', onModeChanged);
    so.on('clear', onClear);
    so.on('submit', submitResult);
    so.on('vote', vote);
});
//===================== Finished Socket io server Set Up ====================\\


function submitResult(d) {
    submit(d, function (error, result) {
        console.log(result);
    });
}

function CreatePacketPoint(newpt) {
    // construct a new packet point
    var pkpt = {
        id : newpt.id,
        x : newpt.x,
        y : newpt.y,
        timestamp : newpt.timestamp,
        pressure : 0          // to be implemented when the pressure is available
    };

    return pkpt;
}

console.log("SocketIO Server Initialized!");
