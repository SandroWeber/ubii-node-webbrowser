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

    try {
      await this.client.initialize();
    } catch (error) {
      console.error('UbiiClientService.client.initialize() failed:\n' + error.toString());
    }
    
    if (this.client.isInitialized()) {
      console.info(
        'UbiiClientService - client initialized with ID:\n' + this.client.clientSpecification.id
      );

      this.client.topicDataClient.websocket.onclose = () => {
        console.warn('Ubi-Interact topic data websocket connection has closed!');
        this.emit(UbiiClientService.EVENTS.DISCONNECT);
      };
    }

    try {
      await this.waitForConnection();
      this.connecting = false;
      this.emit(UbiiClientService.EVENTS.CONNECT);
    } catch {
      console.error('UbiiClientService - failed to connect');
    }
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
   * Use to receive a Promise that resolves as soon as connection is established.
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
  addOnDisconnectCallback(callback) {
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
   * @param {ubii.services.ServiceRequest} serviceRequest Protobuf of a service request. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceRequest.proto}
   * @returns A Ubi-Interact ServiceReply. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceReply.proto}
   */
  async callService(serviceRequest) {
    return this.client.callService(serviceRequest);
  }

  /**
   * Register the specified device.
   * @param {ubii.devices.Device} deviceSpecs Protobuf object specifying device. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/device.proto}
   * @returns The master node reply for the requested registration.
   */
  async registerDevice(deviceSpecs) {
    deviceSpecs.clientId = this.client.clientSpecification.id;
    return this.client.registerDevice(deviceSpecs);
  }

  /**
   * Deregister the specified device. Usually enough to fill in the device's ID.
   * @param {ubii.devices.Device} deviceSpecs Protobuf object specifying device. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/device.proto}
   * @returns The master node reply for the requested deregistration.
   */
  async deregisterDevice(deviceSpecs) {
    return this.client.deregisterDevice(deviceSpecs);
  }

  /**
   * Register the specified session.
   * @param {ubii.sessions.Session} sessionSpecs Protobuf object specifying session. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/sessions/session.proto}
   * @returns The master node reply for the requested registration.
   */
  async registerSession(sessionSpecs) {
    if (this.client && this.client.isInitialized()) {
      return this.client.registerSession(sessionSpecs);
    }
  }

  /**
   * Get the interval used to regularly publish TopicDataRecords.
   * @returns Interval in milliseconds.
   */
  getPublishIntervalMs() {
    return this.client && this.client.publishDelayMs;
  }

  /**
   * Set the interval used to regularly publish TopicDataRecords.
   * @param {Number} intervalMs Interval in milliseconds.
   */
  setPublishIntervalMs(intervalMs) {
    this.client && this.client.setPublishIntervalMs(intervalMs);
  }

  /**
   * Add a TopicDataRecord to the publishing queue.
   * @param {ubii.topicData.TopicDataRecord} topicDataRecord TopicDataRecord to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecord(topicDataRecord) {
    this.client && this.client.publishRecord(topicDataRecord);
  }

  /**
   * Add a list of TopicDataRecords to the publishing queue.
   * @param {ubii.topicData.TopicDataRecordList} topicDataRecordList TopicDataRecordList to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecordList(topicDataRecordList) {
    this.client && this.client.publishRecordList(topicDataRecordList);
  }

  /**
   * Publish a TopicDataRecord without delay using an individual TopicData message instead of queueing it. Might lead to messaging overhead.
   * @param {ubii.topicData.TopicDataRecord} topicDataRecord TopicDataRecord to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecordImmediately(topicDataRecord) {
    this.client && this.client.publishRecordImmediately(topicDataRecord);
  }

  /**
   * Subscribe to a topic, providing a callback function to be called upon receiving notifications.
   * @param {String} topic The topic to subscribe to.
   * @param {Function} callback The function to be called upon receiving messages for the specified topic.
   * @returns A subscription token that should be used to unsubscribe.
   */
  async subscribeTopic(topic, callback) {
    return this.client && this.client.subscribeTopic(topic, callback);
  }

  /**
   * Subscribe to a regular expression, providing a callback function to be called upon receiving notifications.
   * @param {String} regex The regular expression to subscribe to. Used to match against existing and future topics.
   * @param {Function} callback The function to be called upon receiving messages for the specified regular expression.
   * @returns A subscription token that should be used to unsubscribe.
   */
  subscribeRegex(regex, callback) {
    return this.client && this.client.subscribeRegex(regex, callback);
  }

  /**
   * Subscribe to a component profile, providing a callback function to be called upon receiving notifications.
   * @param {ubii.devices.Component} componentProfile The Component(s) to subscribe to. Used to match against existing and future Components. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/component.proto}
   * @param {Function} callback The function to be called upon receiving messages for the specified Component profile.
   * @returns A subscription token that should be used to unsubscribe.
   */
  async subscribeComponents(componentProfile, callback) {
    return (await this.client) && this.client.subscribeComponents(componentProfile, callback);
  }

  /**
   * Unsubscribe using a subscription token.
   * @param {Object} token The token returned by one of the subscribe... methods.
   * @returns The master node reply.
   */
  async unsubscribe(token) {
    return await this.client.unsubscribe(token);
  }

  /**
   * Get a regular expression matching UUIDv4 strings.
   * @returns {String} The regular expression.
   */
  getUUIDv4Regex() {
    return uuidv4Regex;
  }

  /**
   * Create a new timestamp to be included in a TopicDataRecord using the current system time in milliseconds.
   * @returns {ubii.topicData.Timestamp} The timestamp. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/timestamp.proto}
   */
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
