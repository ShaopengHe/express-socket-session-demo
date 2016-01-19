(function() {
  var socket = io.connect('/socket');
  socket.on('data', function(data) {
    document.writeln(data);
    setTimeout(function() {
      socket.emit('command', { command: 'inc' });
    }, 500);
  });

  socket.on('error', function(reason) {
    console.error('Unable to connect Socket.IO', reason);
  });

  socket.on('connect', function() {
    console.info('successfully established a working and authorized connection');
  });

})();
