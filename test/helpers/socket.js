// Socket.IO for the tests: socket.io-client in Node, sending the session cookie on the handshake
// as a browser would (the page's bundled client can't set headers from Node). Every event is
// recorded, so a test can wait for one that arrives later or match one that already arrived.

const { io } = require("socket.io-client");

class Socket {
  constructor(client) {
    this.client = client;
    this.received = [];
    this.waiters = [];
    client.onAny((event, ...args) => this.handle(event, args));
  }

  handle(event, args) {
    this.received.push({ event, args });
    for (const waiter of [...this.waiters]) {
      if (waiter.event === event && waiter.match(...args)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(args);
      }
    }
  }

  emit(event, ...args) {
    this.client.emit(event, ...args);
  }

  // Resolves with the arguments of the next `event` (received from now on) for which
  // `match(...args)` is true; rejects after `ms`.
  next(event, match = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const waiter = { event, match, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i === -1) return;
        this.waiters.splice(i, 1);
        reject(Error(`no matching "${event}" within ${ms} ms`));
      }, ms);
    });
  }

  // Like next(), but also matches events that have already arrived, for events the server may
  // send as soon as the socket connects.
  seen(event, match = () => true, ms = 3000) {
    const earlier = this.received.find((m) => m.event === event && match(...m.args));
    return earlier ? Promise.resolve(earlier.args) : this.next(event, match, ms);
  }

  get isOpen() {
    return this.client.connected;
  }

  // Disconnects and resolves once the underlying connection is closed.
  close() {
    const engine = this.client.io.engine;
    if (!engine || engine.readyState === "closed") return Promise.resolve();
    const closed = new Promise((resolve) => engine.once("close", resolve));
    this.client.disconnect();
    return closed;
  }
}

// Connects like the page's `io()` call. `cookie` is the Cookie header (Client#cookieHeader).
// Resolves once the namespace is joined; rejects with the server's message on a connect error.
exports.connect = function (baseUrl, cookie = "") {
  const client = io(baseUrl, {
    transports: ["websocket"],
    extraHeaders: cookie ? { cookie } : {},
    forceNew: true,
    reconnection: false,
    timeout: 5000,
  });
  const socket = new Socket(client);
  return new Promise(function (resolve, reject) {
    client.once("connect", () => resolve(socket));
    client.once("connect_error", (err) => {
      client.close();
      reject(Error(err.message));
    });
  });
};
