/* eslint-disable no-console */

import EventEmitter from 'events';

import ClientNodeWeb from './clientNodeWeb';

const uuidv4Regex = '[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}';
const MAX_RETRIES_WAIT_FOR_CONNECTION = 50;

let _instance = null;
const SINGLETON_ENFORCER = Symbol();

/**
 * Service to access a singleton instance of a Ubi-Interact client node and expose its API.
 */
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

  /** 
   * Return the singleton instance of the client node.
   */
  static get instance() {
    if (_instance == null) {
      _instance = new UbiiClientService(SINGLETON_ENFORCER);
    }

    return _instance;
  }

  /** 
   * Set a name to use for the client node.
   * @param {string} name The name.
   */
  setName(name) {
    this.name = name;
  }

  /**
   * Set whether to use HTTPS or not when trying to connect to master node.
   * @param {boolean} bool 
   */
  setHTTPS(bool) {
    this.useHTTPS = bool;
  }

  /**
   * Connect to master node.
   * @param {string} urlServices URL for service calls.
   * @param {string} urlTopicData URL for websocket connection transferring TopicData.
   * @returns A promise that resolves when connected or rejects on failure to connect.
   */
  async connect(urlServices, urlTopicData) {
    let changedAddress = urlServices !== this.urlServices || urlTopicData !== this.urlTopicData;
    if (!changedAddress && (this.isConnected() || this.connecting)) {
      return this.waitForConnection();
    }

    this.urlServices = urlServices;
    this.urlTopicData = urlTopicData;
    this.connecting = true;

    console.info(
      'UbiiClientService - connecting to services=' +
        this.urlServices +
        ' and topicdata=' +
        this.urlTopicData +
        ' ...'
    );

    if (!this.client) {
      this.client = new ClientNodeWeb(this.name, this.urlServices, this.urlTopicData);
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

  /**
   * Disconnect from master node.
   * @returns A promise indicating conclusion.
   */
  async disconnect() {
    console.info('UbiiClientService - disconnecting ...');
    if (!this.isConnected()) {
      console.warn('Client tried to disconnect without being connected.');
      return Promise.resolve();
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

  /**
   * Reconnect to master node.
   */
  async reconnect() {
    console.info('UbiiClientService - reconnecting ...');
    await this.client.reinitialize();
  }


  /**
   * Use to receive a Promise that resolves once connection is established.
   * @returns The Promise.
   */
  waitForConnection() {
    return new Promise((resolve, reject) => {
      let retry = 0;

      let checkConnection = () => {
        retry += 1;

        if (retry > MAX_RETRIES_WAIT_FOR_CONNECTION) {
          reject('UbiiClientService.waitForConnection() - maximum retries exceeded.');
          return;
        }

        if (this.client && this.client.isConnected()) {
          resolve('UbiiClientService is connected.');
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

  /**
   * Whether the client node is connected to the master node or not.
   * @returns A boolean.
   */
  isConnected() {
    return this.client && this.client.isConnected();
  }

  /**
   * Add a callback function to be executed after disconnecting.
   * @param {Function} callback A callback function.
   */
  onDisconnect(callback) {
    this.onDisconnectCallbacks.push(callback);
  }

  /**
   * Get the client node ID if connected, or undefined if not connected.
   * @returns A string, or undefined.
   */
  getClientID() {
    if (this.client && this.client.isInitialized()) {
      return this.client.clientSpecification.id;
    } else {
      return undefined;
    }
  }

  /**
   * Make a service call.
   * @param {ubii.services.ServiceRequest} serviceRequest The Protobuf of a service request. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceRequest.proto}
   * @returns The reply to the request. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceReply.proto}
   * 
   */
  async callService(serviceRequest) {
    return this.client.callService(serviceRequest);
  }

  /**
   * Register the specified device.
   * @param {ubii.devices.Device} device Protobuf object specifying device. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/device.proto}
   */
  async registerDevice(deviceSpecs) {
    deviceSpecs.clientId = this.client.clientSpecification.id;
    return this.client.registerDevice(deviceSpecs);
  }

  /**
   * Deregister the specified device. Usually enough to fill in the device's ID.
   * @param {ubii.devices.Device} deviceSpecs Protobuf object specifying device. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/device.proto}
   */
  async deregisterDevice(deviceSpecs) {
    return this.client.deregisterDevice(deviceSpecs);
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

  subscribeRegex(regex, callback) {
    return this.client && this.client.subscribeRegex(regex, callback);
  }

  async subscribeComponents(componentProfile, callback) {
    return (await this.client) && this.client.subscribeComponents(componentProfile, callback);
  }

  async unsubscribe(token) {
    return await this.client.unsubscribe(token);
  }

  getUUIDv4Regex() {
    return uuidv4Regex;
  }

  generateTimestamp() {
    return {
      millis: performance.now()
    };
  }
}

UbiiClientService.EVENTS = Object.freeze({
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  RECONNECT: 'RECONNECT'
});

export default UbiiClientService;
