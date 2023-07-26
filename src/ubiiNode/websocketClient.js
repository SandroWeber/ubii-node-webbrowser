/* eslint-disable no-console */

const MSG_PING = 'PING';
const MSG_PONG = 'PONG';

const LOG_TAG = 'UBII WebSocket';

class WebsocketClient {
  /**
   * Communication endpoint implementing websocket.
   * @param {string} identity ID string to uniquely identify this object. This id is used to route messages to this socket.
   * @param {string} url URL to connect to.
   * @param {boolean} autoconnect Should the socket connect directly after the initialization of the object?
   * If not, the start method must be called manually.
   */
  constructor(identity, url, autoconnect = true, cbOnDisconnect = undefined) {
    this.identity = identity;
    this.url = url;
    this.cbOnDisconnect = cbOnDisconnect;

    this.textDecoder = new TextDecoder("utf-8");

    if (autoconnect) {
      try {
        this.start();
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * Start the websocket client.
   */
  start() {
    try {
      this.websocket = new WebSocket(this.url + `?clientID=${this.identity}`);
    } catch (error) {
      console.error(error);
    }
    this.websocket.binaryType = 'arraybuffer';

    // add callbacks
    this.websocket.onopen = (event) => {
      this.ready = true;
    };

    this.websocket.onmessage = (message) => {
      // process pings
      if (message.data === MSG_PING) {
        this.send(MSG_PONG);
        return;
      }

      if (!this.processMessage) {
        console.warn(
          '[' +
          new Date() +
          '] WebsocketClient.onMessageReceived() has not been set!' +
          '\nMessage received:\n' +
          message
        );
      } else {
        this.processMessage(message);
      }
    };

    this.websocket.onerror = error => {
      throw error;
    };

    this.websocket.onclose = (event) => {
      if (!event.wasClean) {
        console.warn(LOG_TAG + ' - closed unexpectedly!');
      }
      this.ready = false;
      this.cbOnDisconnect && this.cbOnDisconnect(event);
    };
  }

  onMessageReceived(callback) {
    this.processMessage = callback;
  }

  /**
   * Send a payload (string or Buffer object) to the server.
   * @param {(string|Buffer)} message
   */
  send(message) {
    this.websocket.send(message);
  }

  stop() {
    this.websocket.close();
  }
}

export default WebsocketClient;
