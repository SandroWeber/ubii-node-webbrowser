/* eslint-disable no-console */

import EventEmitter from 'events';

import ClientNodeWeb from './clientNodeWeb';

const uuidv4Regex =
  '[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}';

class UbiiClientService extends EventEmitter {
  EVENTS = {
    CONNECT: 'CONNECT',
    DISCONNECT: 'DISCONNECT',
    RECONNECT: 'RECONNECT'
  };

  constructor() {
    super();

    this.serverIP = window.location.hostname;
    this.serverPort = '8102';

    this.client = undefined;
    this.connecting = false;

    this.onDisconnectCallbacks = [];
  }

  async connect() {
    if (this.isConnected() || this.connecting) {
      return this.waitForConnection();
    }

    console.info('UbiiClientService - connecting ...');
    this.connecting = true;

    if (!this.client) {
      this.client = new ClientNodeWeb(
        'web frontend',
        this.serverIP,
        this.serverPort
      );
    }

    return this.client.initialize().then(
      () => {
        if (this.client.isInitialized()) {
          console.info(
            'UbiiClientService - client connected with ID:\n' +
              this.client.clientSpecification.id
          );
          this.connecting = false;

          this.emit(this.EVENTS.CONNECT);
        }
      },
      error => {
        console.info(
          'UbiiClientService.client.initialize() failed:\n' + error.toString()
        );
      }
    );
  }

  async disconnect() {
    console.info('UbiiClientService - disconnecting ...');
    if (!this.isConnected()) {
      console.warn('Client tried to disconnect without being connected.');
      return;
    }

    let id = this.client.clientSpecification.id;

    this.emit(this.EVENTS.DISCONNECT);
    this.onDisconnectCallbacks.forEach(callback => {
      callback();
    });

    return this.client.deinitialize().then(() => {
      this.connecting = false;
      this.client = undefined;
      console.info('client disconnected with ID: ' + id);
    });
  }

  async reconnect() {
    console.info('UbiiClientService - reconnecting ...');
    await this.client.reinitialize();
  }

  waitForConnection() {
    return new Promise((resolve, reject) => {
      let maxRetries = 10;
      let retry = 0;

      let checkConnection = () => {
        retry += 1;

        if (retry > maxRetries) {
          reject(false);
          return;
        }

        if (this.client && this.client.isConnected()) {
          resolve(this.client.isConnected());
          return;
        } else {
          setTimeout(() => {
            checkConnection();
          }, 100);
        }
      };
      checkConnection();
    });
  }

  isConnected() {
    return this.client && this.client.isConnected();
  }

  onDisconnect(callback) {
    this.onDisconnectCallbacks.push(callback);
  }

  getClientID() {
    if (this.client && this.client.isInitialized()) {
      return this.client.clientSpecification.id;
    } else {
      return undefined;
    }
  }

  async callService(serviceRequest) {
    return this.client.callService(serviceRequest);
  }

  /**
   * Register the specified device at the UBII server.
   * @param {object} device Object specifying device according to protobuf format ubii.devices.Device
   */
  async registerDevice(deviceSpecs) {
    deviceSpecs.clientId = this.client.clientSpecification.id;
    return this.client.registerDevice(deviceSpecs);
  }

  /**
   * Deregister the specified device at the UBII server.
   * @param {object} device Object specifying device according to protobuf format ubii.devices.Device
   */
  async deregisterDevice(specs) {
    return this.client.deregisterDevice(specs);
  }

  async registerSession(sessionSpecs) {
    if (this.client && this.client.isInitialized()) {
      return this.client.registerSession(sessionSpecs);
    }
  }

  publish(topicData) {
    this.client && this.client.publish(topicData);
  }

  publishRecord(topicDataRecord) {
    this.client &&
      this.client.publish({
        topicDataRecord: topicDataRecord
      });
  }

  publishRecordList(topicDataRecordList) {
    this.client &&
      this.client.publish({
        topicDataRecordList: topicDataRecordList
      });
  }

  async subscribeTopic(topic, callback) {
    return this.client && this.client.subscribeTopic(topic, callback);
  }

  async unsubscribeTopic(topic, callback) {
    return this.client && this.client.unsubscribeTopic(topic, callback);
  }

  subscribeRegex(regex, callback) {
    return this.client && this.client.subscribeRegex(regex, callback);
  }

  unsubscribeRegex(regex, callback) {
    return this.client && this.client.unsubscribeRegex(regex, callback);
  }

  getUUIDv4Regex() {
    return uuidv4Regex;
  }
}

/*UbiiClientService.EVENTS = {
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  RECONNECT: 'RECONNECT'
};*/

export default new UbiiClientService();
