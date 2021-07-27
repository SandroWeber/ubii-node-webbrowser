<template>
  <div class="tests-overview-wrapper">
    <div class="tile-menu-list">
      <router-link to="/tests/rtt_pubsub" class="tile-menu-item" tag="div">
        <div class="tile-menu-item-background">
          <p>Round-Trip Time</p>
          <p>---</p>
          <p>Publish / Subscribe</p>
        </div>
      </router-link>

      <router-link to="/tests/rtt_pubsubregex" class="tile-menu-item" tag="div">
        <div class="tile-menu-item-background">
          <p>Round-Trip Time</p>
          <p>---</p>
          <p>Publish / Subscribe with regex</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script>

export default {
  name: 'TestsOverview'
};
</script>

<style scoped>

@import '../styles/tile-menus.css';

</style>
