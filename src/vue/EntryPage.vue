<template>
  <div class="entry-page-wrapper">
    <div class="tile-menu-list">
      <router-link to="/tests" class="tile-menu-item" tag="div">
        <div class="tile-menu-item-background">
          <p>Tests Overview</p>
        </div>
      </router-link>

      <router-link to="/examples" class="tile-menu-item" tag="div">
        <div class="tile-menu-item-background">
          <p>Examples Overview</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script>

export default {
  name: 'EntryPage'
};
</script>

<style scoped>

@import './styles/tile-menus.css';

.entry-page-wrapper {
  height: 100%;
}

</style>
