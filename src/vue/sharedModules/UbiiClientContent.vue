<template>
  <div class="full-height">
    <div v-show="!connected">
      <span class="notification"
        >Please connect to backend before starting the application.</span
      >
    </div>

    <div v-show="connected" class="full-height">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import UbiiClientService from '../../ubiiNode/ubiiClientService';

export default {
  name: 'UbiiClientContent',
  props: {
    ubiiClientService: Object
  },
  data: () => {
    return {
      connected: false
    };
  },
  mounted: function() {
    UbiiClientService.instance.on(UbiiClientService.EVENTS.CONNECT, () => {
      this.connected = true;
    });
    UbiiClientService.instance.on(UbiiClientService.EVENTS.DISCONNECT, () => {
      this.connected = false;
    });

    UbiiClientService.instance.waitForConnection().then(() => {
      this.connected = true;
    });
  }
};
</script>

<style scoped>
.full-height, .full-height > * {
  height: 100%;
}

.notification {
  color: red;
}
</style>
