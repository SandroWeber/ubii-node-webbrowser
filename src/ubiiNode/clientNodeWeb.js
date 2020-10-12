/* eslint-disable no-console */

import RESTClient from './restClient';
import WebsocketClient from './websocketClient';
import {
  ProtobufTranslator,
  MSG_TYPES,
  DEFAULT_TOPICS
} from '@tum-far/ubii-msg-formats';

class ClientNodeWeb {
  constructor(name, serverHost, servicePort) {
    // Properties:
    this.name = name;
    this.serverHost = serverHost;
    this.servicePort = servicePort;

    this.serviceClient = undefined;
    this.topicDataClient = undefined;

    // Translators:
    this.translatorServiceReply = new ProtobufTranslator(
      MSG_TYPES.SERVICE_REPLY
    );
    this.translatorServiceRequest = new ProtobufTranslator(
      MSG_TYPES.SERVICE_REQUEST
    );
    this.translatorTopicData = new ProtobufTranslator(MSG_TYPES.TOPIC_DATA);

    // Cache for specifications:
    this.clientSpecification = undefined;
    this.deviceSpecifications = new Map();

    this.topicDataCallbacks = new Map();
    this.topicDataRegexCallbacks = new Map();
    //this.topicDataRegexes = new Map();
  }

  /**
   * Initialize this client.
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // STEP 1: open a request/reply-style service connection to server
      this.serviceClient = new RESTClient(this.serverHost, this.servicePort);

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
              error => {
                console.warn(error);
              }
            )
            .catch(error => {
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
    // unsubscribe all topics / regexes
    let topics = Array.from(this.topicDataCallbacks.keys());
    let regexes = Array.from(this.topicDataRegexCallbacks.keys());
    await this.callService({
      topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
      topicSubscription: {
        unsubscribeTopics: topics,
        unsubscribeTopicRegexp: regexes
      }
    });

    // deregister all devices
    this.deviceSpecifications.forEach(async deviceSpecs => {
      await this.deregisterDevice(deviceSpecs);
    });

    // deregister client
    return this.callService({
      topic: DEFAULT_TOPICS.SERVICES.CLIENT_DEREGISTRATION,
      client: this.clientSpecification
    }).then(() => {
      this.clientSpecification = undefined;
    });
  }

  async reinitialize() {
    this.serviceClient = new RESTClient(this.serverHost, this.servicePort);
    this.initializeTopicDataClient();
  }

  initializeTopicDataClient() {
    this.topicDataClient = new WebsocketClient(
      this.clientSpecification.id,
      this.serverHost,
      parseInt(this.serverSpecification.portTopicDataWs)
    );
    this.topicDataClient.onMessageReceived(messageBuffer => {
      try {
        // Decode the buffer.
        let arrayBuffer = messageBuffer.data;
        let message = this.translatorTopicData.createMessageFromBuffer(
          new Uint8Array(arrayBuffer)
        );
        this._onTopicDataMessageReceived(message);
      } catch (error) {
        console.error(error);
      }
    });
  }

  /**
   * Is this client already initialized?
   */
  isInitialized() {
    return (
      this.serviceClient !== undefined && this.topicDataClient !== undefined
    );
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
      reply => {
        if (reply.server !== undefined && reply.server !== null) {
          // Process the reply client specification.
          this.serverSpecification = reply.server;
          this.ubiiConstants = JSON.parse(
            this.serverSpecification.constantsJson
          );
        }
      },
      error => {
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

    return this.callService(message).then(reply => {
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
      reply => {
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
      error => {
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
      reply => {
        if (reply.success) {
          this.deviceSpecifications.delete(specs.id);
        }

        if (reply.error) {
          return reply.error;
        }
      },
      error => {
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
      reply => {
        if (reply.session !== undefined && reply.session !== null) {
          return reply.session;
        }
      },
      error => {
        console.error(error);
      }
    );
  }

  /**
   * Subscribe to the specified topic.
   * @param {*} topic
   * @param {*} callback
   */
  async subscribeTopic(topic, callback) {
    let message = {
      topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
      topicSubscription: {
        clientId: this.clientSpecification.id,
        subscribeTopics: [topic]
      }
    };

    return this.callService(message).then(
      reply => {
        if (reply.success !== undefined && reply.success !== null) {
          let callbacks = this.topicDataCallbacks.get(topic);
          if (callbacks && callbacks.length > 0) {
            callbacks.push(callback);
          } else {
            this.topicDataCallbacks.set(topic, [callback]);
          }
        } else {
          console.error(
            'ClientNodeWeb - subscribe failed (' + topic + ')\n' + reply
          );
        }
      },
      error => {
        console.error(error);
      }
    );
  }

  async unsubscribeTopic(topic, callback = undefined) {
    let currentCallbacks = this.topicDataCallbacks.get(topic);
    if (currentCallbacks && currentCallbacks.length > 0) {
      if (!callback) {
        this.topicDataCallbacks.delete(topic);
      } else {
        let index = currentCallbacks.indexOf(callback);
        if (index !== -1) currentCallbacks.splice(index, 1);
      }
    }

    if (currentCallbacks && currentCallbacks.length === 0) {
      this.topicDataCallbacks.delete(topic);

      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.clientSpecification.id,
          unsubscribeTopics: [topic]
        }
      };
      this.callService(message);
    }
  }

  /**
   * Subscribe to the specified regex.
   * @param {*} regexString
   * @param {*} callback
   */
  async subscribeRegex(regexString, callback) {
    // already subscribed to regexString, add callback to list
    let registeredRegex = this.topicDataRegexCallbacks.get(regexString);
    if (registeredRegex) {
      if (
        registeredRegex.callbacks &&
        Array.isArray(registeredRegex.callbacks)
      ) {
        registeredRegex.callbacks.push(callback);
      } else {
        registeredRegex.callbacks = [callback];
      }
    }
    // need to subscribe at backend
    else {
      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.clientSpecification.id,
          subscribeTopicRegexp: [regexString]
        }
      };

      try {
        let reply = await this.callService(message);
        if (reply.success !== undefined && reply.success !== null) {
          let newRegex = {
            callbacks: [callback],
            regex: new RegExp(regexString)
          };
          this.topicDataRegexCallbacks.set(regexString, newRegex);
        } else {
          // another component subscribed in the meantime?
          let registeredRegex = this.topicDataRegexCallbacks.get(regexString);
          if (registeredRegex && registeredRegex.callbacks.length > 0) {
            registeredRegex.callbacks.push(callback);
          } else {
            console.error(
              'ClientNodeWeb - could not subscribe to regex ' +
                regexString +
                ', response:\n' +
                reply
            );
            return false;
          }
        }
      } catch (error) {
        console.error(
          'ClientNodeWeb - subscribeRegex(' +
            regexString +
            ') failed: \n' +
            error
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Unsubscribe from the specified regex.
   * @param {*} regexString
   * @param {*} callback
   */
  async unsubscribeRegex(regexString, callback) {
    let registeredRegex = this.topicDataRegexCallbacks.get(regexString);
    if (registeredRegex === undefined) {
      return false;
    }

    // remove callback from list of callbacks
    let index = registeredRegex.callbacks.indexOf(callback);
    if (index >= 0) {
      registeredRegex.callbacks.splice(index, 1);
    }

    // if no callbacks left, unsubscribe at backend
    if (registeredRegex.callbacks.length === 0) {
      let message = {
        topic: DEFAULT_TOPICS.SERVICES.TOPIC_SUBSCRIPTION,
        topicSubscription: {
          clientId: this.clientSpecification.id,
          unsubscribeTopicRegexp: [regexString]
        }
      };

      try {
        let reply = await this.callService(message);
        if (reply.success !== undefined && reply.success !== null) {
          this.topicDataRegexCallbacks.delete(regexString);
        } else {
          console.error(
            'ClientNodeWeb - could not unsubscribe from regex ' +
              regexString +
              ', response:\n' +
              reply
          );
          return false;
        }
      } catch (error) {
        console.error(
          'ClientNodeWeb - unsubscribeRegex(' +
            regexString +
            ') failed: \n' +
            error
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Call a service specified by the topic with a message and callback.
   * @param {String} topic The topic relating to the service to be called
   * @param {Object} message An object representing the protobuf message to be sent
   * @param {Function} callback The function to be called with the reply
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
        .send('/services', message)
        .then(
          reply => {
            let message = this.translatorServiceReply.createMessageFromPayload(
              reply
            );

            return resolve(message);
          },
          rejection => {
            console.warn(rejection);
            return reject(rejection);
          }
        )
        .catch(error => {
          console.error(error);
        });
    });
  }

  /**
   * Publish the specified value of the specified type under the specified topic to the master node.
   * @param {ubii.topicData.TopicData} topicData
   */
  publish(topicData) {
    let buffer = this.translatorTopicData.createBufferFromPayload(topicData);

    this.topicDataClient.send(buffer);
  }

  _onTopicDataMessageReceived(message) {
    let record = message.topicDataRecord;

    if (record && record.topic) {
      let callbacks = this.topicDataCallbacks.get(record.topic);
      if (!callbacks) {
        this.topicDataRegexCallbacks.forEach(value => {
          let regex = value.regex;
          if (regex.test(record.topic)) {
            callbacks = value.callbacks;
          }
        });
      }
      callbacks &&
        callbacks.forEach(cb => {
          cb(record[record.type], record.topic);
        });
    }
  }
}

export default ClientNodeWeb;
