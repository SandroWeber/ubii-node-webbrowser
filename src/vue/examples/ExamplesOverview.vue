<template>
  <div class="tests-overview-wrapper">
    <div class="tile-menu-list">
      <router-link to="/examples/mouse_pointer" class="tile-menu-item" tag="div">
        <div class="tile-menu-item-background">
          <p>Mouse Pointer</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script>

export default {
  name: 'ExamplesOverview'
};
</script>

<style scoped>

@import '../styles/tile-menus.css';

</style>
