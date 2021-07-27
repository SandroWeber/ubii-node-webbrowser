import Vue from 'vue';
import App from './vue/App.vue';
import router from './router';

import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
Vue.component('font-awesome-icon', FontAwesomeIcon);

/* vue app */
Vue.config.productionTip = false;

new Vue({
  router,
  render: h => h(App)
}).$mount('#app');
