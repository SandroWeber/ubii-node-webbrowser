<template>
  <div id="app">
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
  mounted: () => {
    UbiiClientService.connect();
    window.addEventListener('beforeunload', () => {
      UbiiClientService.disconnect();
    });
  },
  beforeDestroy: function() {
    UbiiClientService.disconnect();
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

html, body {
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

#server-status {
  position: relative;
}

.navigation-wrapper {
  flex-grow: 0;
}

.page-header-wrapper {
  flex-grow: 0;
}

.router-view-wrapper {
  flex-grow: 1;
  overflow: hidden;
}

.server-stats {
  text-align: center;
}

.router-view {
  height: 100%;
}

.svg-inline--fa {
  vertical-align: 0;
}
</style>
