/* eslint-disable no-console */

import RESTClient from './restClient';
import WebsocketClient from './websocketClient';
import { ProtobufTranslator, MSG_TYPES, DEFAULT_TOPICS } from '@tum-far/ubii-msg-formats';
import { RuntimeTopicData, SUBSCRIPTION_TYPES } from '@tum-far/ubii-topic-data';

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
  }

  /**
   * Initialize this client.
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // STEP 1: open a request/reply-style service connection to server
      this.serviceClient = new RESTClient(this.urlServices);

      // STEP 2: (service call) get the server configuration (ports, ....)
      this.getServerConfig().then(() => {
        // STEP 3: (service call) register yourself as a client
        if (!this.clientSpecification) {
          this.registerClient()
            .then(
              () => {
                // STEP 4: open the asynchronous connection for topic data communication (needs valid client ID from registration)
                this.initializeTopicDataClient();
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
          this.initializeTopicDataClient();
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
    this.initializeTopicDataClient();
  }

  initializeTopicDataClient() {
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
   * Call a service specified by the topic with a message and callback.
   * @param {Object} message An object representing the protobuf message to be sent
   */
  callService(message) {
    return new Promise((resolve, reject) => {
      // VARIANT A: PROTOBUF
      /*let buffer = this.translatorServiceRequest.createBufferFromPayload(message);
       console.info('### callService - request ###');
       console.info(message);
       console.info(buffer);
       this.serviceClient.send('/services', buffer).then(
       (reply) => {
       let buffer = new Buffer(reply);
       let message = this.translatorServiceReply.createMessageFromBuffer(buffer);
       console.info('### callService - reply ###');
       console.info(message);
       console.info(buffer.length);
       console.info(buffer);
 
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
   * Subscribe to the specified topic.
   * @param {*} topic
   * @param {*} callback
   */
  async subscribeTopic(topic, callback) {
    let subscriptions = this.topicDataBuffer.getSubscriptionTokensForTopic(topic);

    let token = this.topicDataBuffer.subscribeTopic(topic, (record) => {
      callback(record);
    });

    if (!subscriptions || subscriptions.length === 0) {
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
        console.error('local error during subscribe to "' + topic + '": ' + error);
        return error;
      }
    }

    return token;
  }

  /**
   * Subscribe to the specified regex.
   * @param {*} regexString
   * @param {*} callback
   */
  async subscribeRegex(regexString, callback) {
    let subscriptions = this.topicDataBuffer.getSubscriptionTokensForRegex(regexString);
    if (!subscriptions || subscriptions.length === 0) {
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
          return replySubscribe.error;
        }
      } catch (error) {
        logError(error);
        return error;
      }
    }

    let token = this.topicDataBuffer.subscribeRegex(regexString, (record) => {
      callback(record);
    });

    return token;
  }

  /**
   * Unsubscribe at topicdata and possibly at master node.
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
        let replySubscribe = await this.callService(message);
        if (replySubscribe.error) {
          return replySubscribe.error;
        }
      } catch (error) {
        logError(error);
        return error;
      }
    }

    return result;
  }

  publishRecord(record) {
    this.recordsToPublish.push(record);
  }

  publishRecordList(recordList) {
    this.recordsToPublish.push(...recordList);
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

  setPublishIntervalMs(intervalMs) {
    this.intervalPublishRecords && clearInterval(this.intervalPublishRecords);
    this.intervalPublishRecords = setInterval(() => this.flushRecordsToPublish(), intervalMs);
  }

  publishRecordImmediately(record) {
    let buffer = this.translatorTopicData.createBufferFromPayload({
      topicDataRecord: record
    });
    this.topicDataClient.send(buffer);
  }

  _onTopicDataMessageReceived(message) {
    let recordList = message.topicDataRecordList ? message.topicDataRecordList : [];
    message.topicDataRecord && recordList.push(message.topicDataRecord);

    for (let record of recordList) {
      this.topicDataBuffer.publish(record.topic, record);
    }
  }
}

export default ClientNodeWeb;
