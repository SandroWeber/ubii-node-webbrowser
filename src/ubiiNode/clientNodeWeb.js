/* eslint-disable no-console */

import RESTClient from './restClient';
import WebsocketClient from './websocketClient';
import { ProtobufTranslator, MSG_TYPES, DEFAULT_TOPICS } from '@tum-far/ubii-msg-formats';
import { RuntimeTopicData, SUBSCRIPTION_TYPES } from '@tum-far/ubii-topic-data';

import FilterUtils from '../filterUtils';

const LOG_TAG = 'UbiiNode';

/*const logInfo = (msg) => {
  console.info(LOG_TAG + '\n' + msg);
}
const logWarning = (msg) => {
  console.warn(LOG_TAG + '\n' + msg);
}*/
const logError = (msg) => {
  console.error(LOG_TAG + '\n' + msg);
};

/**
 * A Ubi-Interact client node.
 */
class ClientNodeWeb {
  get id() {
    return this.clientSpecification.id;
  }

  constructor(name, urlServices, urlTopicData, publishDelayMs = 15) {
    // Properties:
    this.name = name;
    this.urlServices = urlServices;
    this.urlTopicData = urlTopicData;
    this.publishDelayMs = publishDelayMs;

    this.recordsToPublish = [];
    this.serviceClient = undefined;
    this.topicDataClient = undefined;

    this.topicDataBuffer = new RuntimeTopicData();

    // Translators:
    this.translatorServiceReply = new ProtobufTranslator(MSG_TYPES.SERVICE_REPLY);
    this.translatorServiceRequest = new ProtobufTranslator(MSG_TYPES.SERVICE_REQUEST);
    this.translatorTopicData = new ProtobufTranslator(MSG_TYPES.TOPIC_DATA);

    // Cache for specifications:
    this.clientSpecification = undefined;
    this.deviceSpecifications = new Map();

    this.topicDataCallbacks = new Map();
    this.topicDataRegexCallbacks = new Map();


    this.componentSubs = new Map();
    this.mapTopics2ComponentSubs = new Map();
    this.componentSubscriptionId = 0;
  }

  /**
   * Initialize this client.
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // STEP 1: open a request/reply-style service connection to server
      this.serviceClient = new RESTClient(this.urlServices);

      // STEP 2: (service call) get the server configuration (ports, ....)
      this.getServerConfig().then(async () => {
        // STEP 3: (service call) register yourself as a client
        if (!this.clientSpecification) {
          this.registerClient()
            .then(
              async () => {
                // STEP 4: open the asynchronous connection for topic data communication (needs valid client ID from registration)
                await this.initializeTopicDataClient();
                return resolve();
              },
              (error) => {
                console.warn(error);
              }
            )
            .catch((error) => {
              console.error(error);
              reject(error);
              throw error;
            });
        } else {
          await this.initializeTopicDataClient();
        }
      });
    });
  }

  async deinitialize() {
    this.intervalPublishRecords && clearInterval(this.intervalPublishRecords);
    // unsubscribe all topics / regexes
    let topics = Array.from(this.topicDataBuffer.getAllTopics());
    let regexes = Array.from(this.topicDataBuffer.regexSubscriptions.map((token) => token.topic));
    await this.callService({
      topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
      topicSubscription: {
        unsubscribeTopics: topics,
        unsubscribeTopicRegexp: regexes
      }
    });

    // deregister all devices
    for (let deviceSpecs of this.deviceSpecifications) {
      await this.deregisterDevice(deviceSpecs);
    }

    // deregister client
    await this.callService({
      topic: DEFAULT_TOPICS.SERVICES.CLIENT_DEREGISTRATION,
      client: this.clientSpecification
    });
    this.clientSpecification = undefined;
  }

  async reinitialize() {
    this.serviceClient = new RESTClient(this.urlServices);
    await this.initializeTopicDataClient();
  }

  async initializeTopicDataClient() {
    this.topicDataClient = new WebsocketClient(this.id, this.urlTopicData);
    this.topicDataClient.onMessageReceived((messageBuffer) => {
      try {
        let arrayBuffer = messageBuffer.data;
        let message = this.translatorTopicData.createMessageFromBuffer(new Uint8Array(arrayBuffer));
        this._onTopicDataMessageReceived(message);
      } catch (error) {
        console.error(error);
      }
    });

    this.setPublishIntervalMs(this.publishDelayMs);
    
    this.subTokenInfoNewDevices = await this.subscribeTopic('/info/device/new', (record) => {
      for (let newComponent of record.device.components) {
        let matchingSubs = this.getMatchingComponentSubscriptions(newComponent);
        this.addComponentSubListForTopic(newComponent.topic, matchingSubs);
      }
    });
  }

  /**
   * Is this client already initialized?
   */
  isInitialized() {
    return this.serviceClient !== undefined && this.topicDataClient !== undefined;
  }

  isConnected() {
    return (
      this.serviceClient &&
      this.topicDataClient &&
      this.topicDataClient.websocket &&
      this.topicDataClient.websocket.readyState === WebSocket.OPEN
    );
  }

  async getServerConfig() {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.SERVER_CONFIG
    };

    return this.callService(message).then(
      (reply) => {
        if (reply.server !== undefined && reply.server !== null) {
          this.serverSpecification = reply.server;
          this.ubiiConstants = JSON.parse(this.serverSpecification.constantsJson);
        }
      },
      (error) => {
        console.error(error);
      }
    );
  }

  /**
   * Register this client at the masterNode.
   */
  async registerClient() {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.CLIENT_REGISTRATION
    };
    if (this.clientSpecification) {
      message.client = this.clientSpecification;
    } else {
      message.client = {
        name: this.name
      };
    }

    return this.callService(message).then((reply) => {
      if (reply.client) {
        this.clientSpecification = reply.client;

        return reply.client;
      }
    });
  }

  /**
   * Register the specified device at the masterNode.
   * @param {object} device Object specifying device according to protobuf format ubii.devices.Device
   */
  async registerDevice(device) {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.DEVICE_REGISTRATION,
      device: device
    };

    return this.callService(message).then(
      (reply) => {
        if (reply.device) {
          // Process the reply client specification.
          this.deviceSpecifications.set(reply.device.id, reply.device);

          return reply.device;
        }

        if (reply.error) {
          console.warn(reply.error);
          return undefined;
        }
      },
      (error) => {
        return error;
      }
    );
  }

  /**
   * Deregister the specified device at the masterNode.
   * @param {object} device Object specifying device according to protobuf format ubii.devices.Device
   */
  async deregisterDevice(specs) {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.DEVICE_DEREGISTRATION,
      device: specs
    };

    return this.callService(message).then(
      (reply) => {
        if (reply.success) {
          this.deviceSpecifications.delete(specs.id);
        }

        if (reply.error) {
          return reply.error;
        }
      },
      (error) => {
        return error;
      }
    );
  }

  async registerSession(session) {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.SESSION_REGISTRATION,
      session: session
    };

    return this.callService(message).then(
      (reply) => {
        if (reply.session !== undefined && reply.session !== null) {
          return reply.session;
        }
      },
      (error) => {
        console.error(error);
      }
    );
  }


  /**
   * Make a service call.
   * @param {ubii.services.ServiceRequest} serviceRequest Protobuf of a service request. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceRequest.proto}
   * @returns A Ubi-Interact ServiceReply. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceReply.proto}
   */
  callService(message) {
    return new Promise((resolve, reject) => {
      // VARIANT A: PROTOBUF
      /*let buffer = this.translatorServiceRequest.createBufferFromPayload(message);
       this.serviceClient.send('/services', buffer).then(
       (reply) => {
       let buffer = new Buffer(reply);
       let message = this.translatorServiceReply.createMessageFromBuffer(buffer);
 
       return resolve(message);
       },
       (error) => {
       console.error(error);
       return reject();
       });*/

      // VARIANT B: JSON
      this.serviceClient
        .send(message)
        .then(
          (reply) => {
            return resolve(reply);
          },
          (rejection) => {
            console.warn(rejection);
            return reject(rejection);
          }
        )
        .catch((error) => {
          console.error(error);
        });
    });
  }

  /**
   * Subscribe to a topic, providing a callback function to be called upon receiving notifications.
   * @param {String} topic The topic to subscribe to.
   * @param {Function} callback The function to be called upon receiving messages for the specified topic.
   * @returns A subscription token that should be used to unsubscribe.
   */
  async subscribeTopic(topic, callback) {
    let subscriptions = this.topicDataBuffer.getSubscriptionTokensForTopic(topic);
    let subAtMasterNode = !subscriptions || subscriptions.length === 0;
    let token = this.topicDataBuffer.subscribeTopic(topic, (record) => {
      callback(record);
    });

    if (subAtMasterNode) {
      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.id,
          subscribeTopics: [topic]
        }
      };

      try {
        let replySubscribe = await this.callService(message);
        if (replySubscribe.error) {
          this.topicDataBuffer.unsubscribe(token);
          logError('server error during subscribe to "' + topic + '": ' + replySubscribe.error);
          return replySubscribe.error;
        }
      } catch (error) {
        this.topicDataBuffer.unsubscribe(token);
        logError('local error during subscribe to "' + topic + '": ' + error);
        return error;
      }
    }

    return token;
  }

  /**
   * Subscribe to a regular expression, providing a callback function to be called upon receiving notifications.
   * @param {String} regexString The regular expression to subscribe to. Used to match against existing and future topics.
   * @param {Function} callback The function to be called upon receiving messages for the specified regular expression.
   * @returns A subscription token that should be used to unsubscribe.
   */
  async subscribeRegex(regexString, callback) {
    let subscriptions = this.topicDataBuffer.getSubscriptionTokensForRegex(regexString);
    let subAtMasterNode = !subscriptions || subscriptions.length === 0;
    let token = this.topicDataBuffer.subscribeRegex(regexString, (record) => {
      callback(record);
    });

    if (subAtMasterNode) {
      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.id,
          subscribeTopicRegexp: [regexString]
        }
      };

      try {
        let replySubscribe = await this.callService(message);
        if (replySubscribe.error) {
          this.topicDataBuffer.unsubscribe(token);
          logError(replySubscribe.error);
          return replySubscribe.error;
        }
      } catch (error) {
        this.topicDataBuffer.unsubscribe(token);
        logError(error);
        return error;
      }
    }

    return token;
  }

  /**
   * Subscribe to a component profile, providing a callback function to be called upon receiving notifications.
   * @param {ubii.devices.Component} componentProfile The Component(s) to subscribe to. Used to match against existing and future Components. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/devices/component.proto}
   * @param {Function} callback The function to be called upon receiving messages for the specified Component profile.
   * @returns A subscription token that should be used to unsubscribe.
   */
  async subscribeComponents(componentProfile, callback) {
    let subscription = this.getComponentSubscription(componentProfile);
    if (typeof subscription === 'undefined') {
      try {
        let replySubscribe = await this.callService({
          topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
          topicSubscription: {
            clientId: this.id,
            subscribeComponents: [componentProfile]
          }
        });
        if (replySubscribe.error) return replySubscribe.error;
        
        subscription = {
          tokens: []
        };
        this.componentSubs.set(componentProfile, subscription);

        let replyMatchingComponentList = await this.callService({
          topic: DEFAULT_TOPICS.SERVICES.COMPONENT_GET_LIST,
          component: componentProfile
        });
        if (replyMatchingComponentList.error) return replyMatchingComponentList.error;
        else if (replyMatchingComponentList.componentList) {
          for (let matchingComponent of replyMatchingComponentList.componentList.elements) {
            this.addComponentSubListForTopic(matchingComponent.topic, [subscription]);
          }
        }
      } catch (error) {
        logError(error);
        return error;
      }
    }

    this.componentSubscriptionId++;
    let token = {
      id: this.componentSubscriptionId,
      component: componentProfile,
      type: 'component',
      callback: callback,
    };
    subscription.tokens.push(token);

    return token;
  }

  getComponentSubscription(componentProfile) {
    for (let key of this.componentSubs.keys()) {
      if (FilterUtils.deepEqual(key, componentProfile)) {
        return this.componentSubs.get(key);
      }
    }
  }

  getMatchingComponentSubscriptions(componentProfile) {
    let subs = [];
    for (let key of this.componentSubs.keys()) {
      if (FilterUtils.matches(key, componentProfile)) {
        subs.push(this.componentSubs.get(key));
      }
    }

    return subs;
  }

  addComponentSubListForTopic(topic, matchingComponentSubs) {
    let entry = this.mapTopics2ComponentSubs.get(topic);
    if (!entry) {
      this.mapTopics2ComponentSubs.set(topic, matchingComponentSubs);
    } else {
      for (let sub of matchingComponentSubs) {
        if (!entry.includes(sub)) {
          entry.push(sub);
        }
      }
    }
  }

  /**
   * Unsubscribe at local topic data buffer and at master node if no other subscriptions to the same expression are left.
   * @param {*} token
   */
  async unsubscribe(token) {
    let result = this.topicDataBuffer.unsubscribe(token);

    let subs = undefined;
    if (token.type === SUBSCRIPTION_TYPES.TOPIC) {
      subs = this.topicDataBuffer.getSubscriptionTokensForTopic(token.topic);
    } else if (token.type === SUBSCRIPTION_TYPES.REGEX) {
      subs = this.topicDataBuffer.getSubscriptionTokensForRegex(token.topic);
    }

    if (!subs || subs.length === 0) {
      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.id
        }
      };
      if (token.type === SUBSCRIPTION_TYPES.TOPIC) {
        message.topicSubscription.unsubscribeTopics = [token.topic];
      } else if (token.type === SUBSCRIPTION_TYPES.REGEX) {
        message.topicSubscription.unsubscribeTopicRegexp = [token.topic];
      }

      try {
        let replyUnsubscribe = await this.callService(message);
        if (replyUnsubscribe.error) {
          logError(replyUnsubscribe.error);
          return replyUnsubscribe.error;
        }
      } catch (error) {
        logError(error);
        return error;
      }
    }

    return result;
  }

  /**
   * Add a TopicDataRecord to the publishing queue.
   * @param {ubii.topicData.TopicDataRecord} topicDataRecord TopicDataRecord to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecord(topicDataRecord) {
    this.recordsToPublish.push(topicDataRecord);
  }

  /**
   * Add a list of TopicDataRecords to the publishing queue.
   * @param {ubii.topicData.TopicDataRecordList} topicDataRecordList TopicDataRecordList to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecordList(topicDataRecordList) {
    this.recordsToPublish.push(...topicDataRecordList);
  }

  flushRecordsToPublish() {
    if (this.recordsToPublish.length === 0) return;

    let buffer = this.translatorTopicData.createBufferFromPayload({
      topicDataRecordList: {
        elements: this.recordsToPublish
      }
    });
    this.topicDataClient.send(buffer);

    this.recordsToPublish = [];
  }

  /**
   * Set the interval for regular publishing of TopicDataRecords.
   * @param {Number} intervalMs The interval in milliseconds. 
   */
  setPublishIntervalMs(intervalMs) {
    this.intervalPublishRecords && clearInterval(this.intervalPublishRecords);
    this.intervalPublishRecords = setInterval(() => this.flushRecordsToPublish(), intervalMs);
  }

  /**
   * Publish a TopicDataRecord without delay using an individual TopicData message instead of queueing it. Might lead to messaging overhead.
   * @param {ubii.topicData.TopicDataRecord} topicDataRecord TopicDataRecord to publish. {@link https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/topicData/topicDataRecord.proto}
   */
  publishRecordImmediately(topicDataRecord) {
    let buffer = this.translatorTopicData.createBufferFromPayload({
      topicDataRecord: topicDataRecord
    });
    this.topicDataClient.send(buffer);
  }

  _onTopicDataMessageReceived(message) {
    let recordList = message.topicDataRecordList ? message.topicDataRecordList : [];
    message.topicDataRecord && recordList.push(message.topicDataRecord);

    for (let record of recordList) {
      this.topicDataBuffer.publish(record.topic, record);
      let componentSubs = this.mapTopics2ComponentSubs.get(record.topic);
      if (componentSubs && componentSubs.length > 0) {
        for (let sub of componentSubs) {
          for (let token of sub.tokens) {
            token.callback(record);
          }
        }
      }
    }
  }
}

export default ClientNodeWeb;
