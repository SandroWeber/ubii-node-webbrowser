<template>
  <div id="app">
    <div class="server-connection">
      <label>IP</label>
      <input class="input" v-model="serverIP" />
      <label>Service Port</label>
      <input class="input" v-model="servicePort" />
      <button class="input btn-connect" @click="connectUbii()">
        ⟲
      </button>
    </div>
    <!--<div class="page-header-wrapper">
      <server-status id="server-status" />
      <page-header />
    </div>-->

    <example-mouse-pointer />
  </div>
</template>

<script>
import UbiiClientService from '../ubiiNode/ubiiClientService';
import ExampleMousePointer from './ExampleMousePointer.vue';

export default {
  name: 'app',
  components: {
    ExampleMousePointer
  },
  data: function() {
    return {
      serverIP: window.location.hostname,
      servicePort: 8102
    };
  },
  mounted: function() {
    window.addEventListener('beforeunload', () => {
      UbiiClientService.disconnect();
    });
    this.connectUbii();
  },
  beforeDestroy: function() {
    UbiiClientService.disconnect();
  },
  methods: {
    connectUbii: function() {
      UbiiClientService.connect(this.serverIP, this.servicePort);
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
  background-color: black;
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
</style>
