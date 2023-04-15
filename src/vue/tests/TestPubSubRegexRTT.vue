<template>
  <div class="performance-test-rtt">
    <h3>Round-Trip Time via single topic publish & regex subscribe</h3>

    <button class="start-button" @click="startTest()" :disabled="!ubiiConnected">
      <font-awesome-icon icon="play" v-show="this.testData.status !== 'running'" />
      <font-awesome-icon icon="spinner" v-show="this.testData.status === 'running'" />
    </button>

    <div class="statistics-grid">
      <!-- status -->
      <span>Status:</span>
      <span class="test-status">{{ this.testData.status }}</span>
    </div>

    <div class="separator"></div>

    <div class="settings-grid">
      <label for="rtt-message-count"># messages:</label>
      <input :id="'rtt-message-count'" :type="'# messages'" v-model="testData.messageCount" />
      <label for="rtt-topic-count"># topics:</label>
      <input :id="'rtt-topic-count'" :type="'# topics'" v-model="testData.topicCount" />
    </div>
  </div>
</template>

<script>
import ProtobufLibrary from '@tum-far/ubii-msg-formats/dist/js/protobuf';

/* fontawesome */
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPlay, faSpinner } from '@fortawesome/free-solid-svg-icons';
library.add(faPlay, faSpinner);

import { UbiiClientService } from '../../index';

export default {
  name: 'PerformanceTestRTT-PubSubRegex',
  mounted: function () {
    // unsubscribe before page is unloaded
    window.addEventListener('beforeunload', () => {
      this.stopTest();
    });

    this.ubiiService = UbiiClientService.instance;

    this.ubiiConnected = this.ubiiService.isConnected();
    this.ubiiService.on(UbiiClientService.EVENTS.CONNECT, () => {
      this.ubiiConnected = true;
    });
    this.ubiiService.on(UbiiClientService.EVENTS.DISCONNECT, () => {
      this.ubiiConnected = false;
    });
  },
  beforeDestroy: function () {
    this.stopTest();
  },
  data: () => {
    return {
      ubiiConnected: false,
      testData: {
        status: 'unmeasured',
        timings: [],
        avgRTT: undefined,
        messageCount: '1000',
        topicCount: '10',
        topics: undefined,
        topicRegex: undefined,
        device: {
          name: 'RTT_test_device',
          deviceType: ProtobufLibrary.ubii.devices.Device.DeviceType.PARTICIPANT,
          components: [],
        },
      },
    };
  },
  methods: {
    ubiiSetup: async function () {
      if (!this.testData.device.registered) {
        let deviceResponse = await this.ubiiService.registerDevice(this.testData.device);
        this.testData.device = deviceResponse;
        this.testData.device.registered = true;
      }

      return this.testData.device;
    },
    prepareTest: function () {
      this.testData.status = 'running';
      this.testData.timings = [];
      this.testData.messageCounter = 0;
      this.testData.maxMessages = parseInt(this.testData.messageCount);
      this.testData.tSent = 0;
      this.testData.avgRTT = undefined;

      this.testData.topicPrefix = this.ubiiService.getClientID() + '/test_rtt_regex';
      this.testData.topics = [];
      for (let i = 0; i < this.testData.topicCount; i++) {
        this.testData.topics.push(this.testData.topicPrefix + '/i');
      }
      this.testData.topicRegex = this.testData.topicPrefix + '/*';
    },
    startTest: async function () {
      if (this.testData.status === 'running') return;

      this.prepareTest();
      await this.ubiiSetup();

      this.subToken = await this.ubiiService.subscribeRegex(this.testData.topicRegex, this.rttReceivePackage);
      this.rttSendPackage();
    },
    stopTest: function () {
      if (this.testData && this.testData.avgRTT) {
        this.testData.status = this.testData.avgRTT.toString() + 'ms';
        this.ubiiService.unsubscribe(this.subToken);
      }
    },
    rttSendPackage: function () {
      let topic = this.getRandomTopic();
      this.testData.tSent = Date.now();
      topic && this.ubiiService.publishRecordImmediately({
        topic: topic,
        double: 1,
      });
    },
    rttReceivePackage: function () {
      this.testData.timings.push(Date.now() - this.testData.tSent);
      this.testData.messageCounter++;
      if (this.testData.messageCounter < this.testData.maxMessages) {
        this.rttSendPackage();
      } else {
        let sum = this.testData.timings.reduce((partial_sum, a) => partial_sum + a);
        this.testData.avgRTT = sum / this.testData.timings.length;
        this.stopTest();
      }
    },
    getRandomTopic: function() {
      if (!this.testData.topics || this.testData.topics.length === 0) return undefined;

      return this.testData.topics[Math.floor(Math.random() * this.testData.topics.length)];
    }
  },
};
</script>

<style scoped>
.start-button {
  grid-area: run;
  width: 50px;
}

@keyframes spinner {
  to {
    transform: rotate(360deg);
  }
}

.fa-spinner {
  animation: spinner 1s linear infinite;
}

.performance-test-rtt {
  padding: 15px;
  display: grid;
  grid-gap: 15px;
  grid-template-columns: 50px 1fr 3px 1fr;
  grid-template-rows: 20px 1fr;
  grid-template-areas:
    'run title'
    '. statistics'
    '. settings';
}

.statistics-grid {
  grid-area: statistics;
  display: grid;
  grid-gap: 15px;
  grid-template-columns: 300px 1fr;
  grid-template-rows: 25px;
}

.separator {
  grid-area: separator;
  background-color: white;
}

.settings-grid {
  grid-area: settings;
  display: grid;
  grid-gap: 15px;
  grid-template-columns: 200px 100px;
  grid-template-rows: 25px;
  grid-template-rows: 25px;
}
</style>
