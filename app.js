var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var sessionSocketMap = {};

var cookieSecret = 'secret';
var sessionKey = 'express.sid';

var sessionMiddleware = session({
  store: new RedisStore({
    host: 'localhost',
    port: 6400,
    db: 5
  }),
  secret: cookieSecret,
  key: sessionKey
});

var port = +process.env.port || 3000;

/* express app */
app.use(cookieParser());
app.use(sessionMiddleware);

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/client.js', function(req, res) {
  res.sendFile(__dirname + '/client.js');
});

/*
 * 模拟登录
 */
app.get('/login', function(req, res) {
  req.session.login = true;
  return res.json({ login: 1 });
});

/*
 * 清除计数
 */
app.get('/clear', function(req, res) {
  if (!req.session.login) {
    return res.json({ done: 0 });
  }
  req.session.val = 0;
  req.session.save(function(err) {
    if (err) {
      console.error(err);
    }
    res.json({ done: 1 });
  });
});

/*
 * 模拟注销
 */
app.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      console.error(err);
    }
    (sessionSocketMap[req.sessionID] || []).forEach(function(s) {
      s.disconnect();
    });
    return res.json({ logout: 1 });
  });
});

server.listen(port, function() {
  console.log('Listening on Port: ' + port);
});

/* socket.io */
io.use(function(socket, next) {
  // share session
  sessionMiddleware(socket.request, socket.request.res, next);
});

io.of('/socket')
.use(function(socket, next) {
  // 验证登录
  if (!socket.request.session || !socket.request.session.login) {
    return next(new Error('No Login'));
  }
  return next();
})
.on('connection', function (socket) {
  var req = socket.request;
  if (!sessionSocketMap[req.sessionID]) {
    sessionSocketMap[req.sessionID] = [];
  }
  sessionSocketMap[req.sessionID].push(socket);

  /* 
   * 必须通过req.session读取session对象
   * 因为调用req.session.reload后，req.session指向了新的Session对象
   * 因此不能使用临时变量来保存req.session的引用
   */
  socket.emit('data', req.session.val || 0);

  socket.on('command', function (data) {
    if (!req.session.login) {
      return;
    }

    if (data.command === 'inc') {
      /*
       * 保存session数据时需要先调用reload
       * 避免同一用户并发访问时导致最新数据被旧有数据覆盖
       */
      req.session.reload(function() {
        if (!req.session.val) {
          req.session.val = 0;
        }
        req.session.val += 1;
        req.session.save(function() {
          socket.emit('data', req.session.val);
        });
      });
    }
  });
});
