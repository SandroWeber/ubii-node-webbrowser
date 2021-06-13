<template>
  <div class="server-status-wrapper">
    <div class="connected-stop-sign" :class="connected ? 'green-accent' : 'red-accent'" />
  </div>
</template>

<script>
import { UbiiClientService } from '../index';

export default {
  name: 'ServerStatus',
  data: () => {
    return {
      ubiiClientService: UbiiClientService.instance,
      connected: UbiiClientService.instance.isConnected()
    };
  },
  mounted: function() {
    UbiiClientService.instance.on(UbiiClientService.EVENTS.CONNECT, () => {
      this.onConnectionChange(true);
    });
    UbiiClientService.instance.on(UbiiClientService.EVENTS.DISCONNECT, () => {
      this.onConnectionChange(false);
    });
  },
  methods: {
    onConnectionChange: function(connected) {
      this.connected = connected;
    }
  }
};
</script>

<style scoped>
.server-status-wrapper {
  position: absolute;
  top: 0px;
  right: 0px;
  margin: 10px;
}

.icon {
  height: 1.5em;
  width: 1.5em;
}

.button {
  position: relative;
  align-items: center;
  height: 2em;
  width: 2em;
  padding-top: 0.2em;
}

.button-connect {
  color: white;
  grid-area: button-connect;
  height: 1.8em;
  width: 8em;
  margin: 2px 10px 2px 10px;
}

.green-accent {
  background-color: green;
}

.red-accent {
  background-color: red;
}

.connected-stop-sign {
  width: 20px;
  height: 20px;
  border-radius: 10px;
}
</style>
