<template>
  <div id="app">
    <div class="server-connection">
      <server-status />
      <label>IP</label>
      <input class="input" v-model="serverIP" />
      <label>Service Port</label>
      <input class="input" v-model="servicePort" />
      <button class="input btn-connect" @click="connectUbii()">⟲</button>
    </div>

    <div class="router-view-wrapper">
      <router-view class="router-view" />
    </div>
  </div>
</template>

<script>
import UbiiClientService from '../ubiiNode/ubiiClientService';
import ServerStatus from './ServerStatus.vue';

import config from './config.json';

export default {
  name: 'app',
  components: {
    ServerStatus
  },
  data: function () {
    return {
      serverIP: window.location.hostname,
      servicePort: 8102
    };
  },
  mounted: function () {
    window.addEventListener('beforeunload', () => {
      UbiiClientService.instance.disconnect();
    });
    this.connectUbii();
  },
  beforeDestroy: function () {
    UbiiClientService.instance.disconnect();
  },
  methods: {
    connectUbii: function () {
      UbiiClientService.instance.setName('ubii-node-webbrowser VueJS Test');
      UbiiClientService.instance.setHTTPS(window.location.protocol.includes('https'));

      let useHTTPS = window.location.protocol.includes('https');
      UbiiClientService.instance.setHTTPS(useHTTPS);
      UbiiClientService.instance.setName('Ubi-Interact Web Frontend');

      let urlServices = useHTTPS ? 'https://' : 'http://';
      if (
        config &&
        config.masterNode &&
        config.masterNode.services &&
        config.masterNode.services.url
      ) {
        urlServices += config.masterNode.services.url.replace(/.*:\/\//, '');
      } else {
        urlServices += window.location.hostname + ':8102/services/json';
      }
      let urlTopicData = useHTTPS ? 'wss://' : 'ws://';
      if (
        config &&
        config.masterNode &&
        config.masterNode.topicdata &&
        config.masterNode.topicdata.url
      ) {
        urlTopicData += config.masterNode.topicdata.url.replace(/.*:\/\//, '');
      } else {
        urlTopicData += window.location.hostname + ':8104';
      }
      UbiiClientService.instance.connect(urlServices, urlTopicData);
    }
  }
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  background-color: white;
}

html,
body {
  width: 100%;
  height: 100%;
}

#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: maxContrastColor;
  overflow: hidden;
}

.server-connection {
  color: white;
}

.input {
  background-color: white;
  margin: 5px;
}

.btn-connect {
  width: 25px;
}

.router-view-wrapper {
  flex-grow: 1;
  overflow: hidden;
}
</style>
