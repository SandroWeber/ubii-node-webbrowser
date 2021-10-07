/* eslint-disable no-console */

import EventEmitter from 'events';

import ClientNodeWeb from './clientNodeWeb';

const uuidv4Regex = '[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}';

let _instance = null;
const SINGLETON_ENFORCER = Symbol();

class UbiiClientService extends EventEmitter {
  constructor(enforcer) {
    super();

    if (enforcer !== SINGLETON_ENFORCER) {
      throw new Error('Use ' + this.constructor.name + '.instance');
    }

    this.name = 'ubii-node-webbrowser';

    this.client = undefined;
    this.connecting = false;

    this.onDisconnectCallbacks = [];
    this.useHTTPS = true;
  }

  static get instance() {
    if (_instance == null) {
      _instance = new UbiiClientService(SINGLETON_ENFORCER);
    }

    return _instance;
  }

  setName(name) {
    this.name = name;
  }

  setHTTPS(bool) {
    this.useHTTPS = bool;
  }

  async connect(serverIP = window.location.hostname, servicePort = 8102) {
    let changedAddress = serverIP !== this.serverIP || servicePort !== this.servicePort;
    if (!changedAddress && (this.isConnected() || this.connecting)) {
      return this.waitForConnection();
    }

    this.serverIP = serverIP;
    this.servicePort = servicePort;
    this.connecting = true;

    console.info(
      'UbiiClientService - connecting to ' + this.serverIP + ':' + this.servicePort + '...'
    );

    if (!this.client) {
      this.client = new ClientNodeWeb(this.name, this.serverIP, this.servicePort);
    }

    return this.client.initialize().then(
      () => {
        if (this.client.isInitialized()) {
          console.info(
            'UbiiClientService - client connected with ID:\n' + this.client.clientSpecification.id
          );
          this.connecting = false;

          this.client.topicDataClient.websocket.onclose = () => {
            console.warn('Ubi-Interact topic data websocket connection has closed!');
            this.emit(UbiiClientService.EVENTS.DISCONNECT);
          };

          this.emit(UbiiClientService.EVENTS.CONNECT);
        }
      },
      (error) => {
        console.info('UbiiClientService.client.initialize() failed:\n' + error.toString());
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

    this.emit(UbiiClientService.EVENTS.DISCONNECT);
    this.onDisconnectCallbacks.forEach((callback) => {
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

  getPublishIntervalMs() {
    return this.client && this.client.publishDelayMs;
  }
  
  setPublishIntervalMs(intervalMs) {
    this.client && this.client.setPublishIntervalMs(intervalMs);
  }

  publishRecord(topicDataRecord) {
    this.client && this.client.publishRecord(topicDataRecord);
  }

  publishRecordList(topicDataRecordList) {
    this.client && this.client.publishRecordList(topicDataRecordList);
  }

  publishRecordImmediately(topicDataRecord) {
    this.client && this.client.publishRecordImmediately(topicDataRecord);
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

  generateTimestamp() {
    let now = Date.now();
    let seconds = Math.floor(now / 1000);
    let nanos = (now - seconds * 1000) * 1000000;
    return {
      seconds: seconds,
      nanos: nanos,
    };
  }
}

UbiiClientService.EVENTS = Object.freeze({
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  RECONNECT: 'RECONNECT',
});

export default UbiiClientService;
