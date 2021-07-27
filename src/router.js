import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

export default new Router({
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./vue/EntryPage.vue')
    },
    /* tests */
    {
      path: '/tests',
      name: 'Tests - Overview',
      component: () => import('./vue/tests/TestsOverview.vue')
    },
    {
      path: '/tests/rtt_pubsub',
      name: 'Tests - Round-Trip Time PubSub',
      component: () => import('./vue/tests/TestPubSubRTT.vue')
    },
    {
      path: '/tests/rtt_pubsubregex',
      name: 'Tests - Round-Trip Time PubSubRegex',
      component: () => import('./vue/tests/TestPubSubRegexRTT.vue')
    },
    /* examples */
    {
      path: '/examples',
      name: 'Examples - Overview',
      component: () => import('./vue/examples/ExamplesOverview.vue')
    },
    {
      path: '/examples/mouse_pointer',
      name: 'Example - Mouse Pointer',
      component: () => import('./vue/examples/ExampleMousePointer.vue')
    }
  ]
});
