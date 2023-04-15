<template>
  <UbiiClientContent :ubiiClientService="ubiiClientService">
    <div class="grid">
      <div class="seperator header-demo">
        <span class="separator-label">Demo</span>
      </div>

      <div class="options">
        <!-- a checkbox to toggle showing the client side pointer -->
        <input id="checkboxClientPointer" type="checkbox" v-model="showClientPointer" />
        <label for="checkboxClientPointer">Show Client Pointer</label>

        <br />

        <!-- a checkbox to toggle showing the server side pointer -->
        <input id="checkboxServerPointer" type="checkbox" v-model="showServerPointer" />
        <label for="checkboxServerPointer">Show Server Pointer</label>

        <br />

        <!-- a checkbox to toggle inverting the pointer position at the server before sending it back to client -->
        <input id="checkboxMirrorPointer" type="checkbox" v-model="mirrorPointer" />
        <label for="checkboxMirrorPointer">Mirror Pointer</label>

        <br />

        <!-- a checkbox to toggle immediate publishing of TopicDataRecords -->
        <input
          id="checkboxPublishImmediately"
          type="checkbox"
          v-model="publishImmediately"
        />
        <label for="checkboxPublishImmediately">Publish Immediately</label>

        <br />

        <!-- a checkbox to toggle immediate publishing of TopicDataRecords -->
        <input
          id="numberPublishInterval"
          type="number"
          v-model="publishIntervalMs"
          :disabled="publishImmediately"
          v-on:change="onPublishIntervalChange"
        />
        <label for="numberPublishInterval">Publish Interval (ms)</label>
      </div>

      <!-- the mouse area.
      if our pointer is inside, its position is sent to the server and back to us, then displayed as a red square-->
      <div
        id="mouse-pointer-area"
        class="mouse-pointer-area"
        v-bind:class="{ hideCursor: !showClientPointer }"
        v-on:mousemove="onMouseMove($event)"
        v-on:mouseenter="clientPointerInside = true"
        v-on:mouseleave="clientPointerInside = false"
        v-on:touchstart="onTouchStart($event)"
        v-on:touchend="clientPointerInside = false"
        v-on:touchmove="onTouchMove($event)"
      >
        <font-awesome-icon
          class="server-mouse-position-indicator"
          icon="mouse-pointer"
          :style="{
            top: serverMousePosition.y - 4 + 'px',
            left: serverMousePosition.x - 4 + 'px',
          }"
          v-show="showServerPointer && clientPointerInside"
        />
      </div>

      <div class="seperator header-description">
        <span class="separator-label">Description</span>
      </div>

      <div class="description-general">
        Placing your mouse inside the above area will show your mouse indicator (arrow) as
        well as a red square. The basic idea of this demo is to send the mouse position to
        the Ubi-Interact backend, which will send it back to us so we can display it (red
        square).
        <br />Reading the code of this example will show your how to register a device
        with Ubi-Interact defining the topics for data communication. It also shows you
        how to publish (send) and subcribe (receive) to topics. A small session +
        processing module is also specified and communicated to Ubi-Interact that can
        manipulate the communicated mouse position. You can see in the code how to specify
        this processing module on the client side, link it to the topics of our device and
        start it.
      </div>

      <div class="description-options">
        You can toggle whether the client/server side mouse indicator should be shown.
        "Mirror Pointer" will tell the processing module to invert your client mouse
        position in X and Y.
      </div>

      <div class="description-mouse-area">
        Moving your mouse inside this area will publish its current position normalized to
        ([0;1] , [0;1]) on the topic ".../mouse_client_position". A processing module in
        the backend will read this client position. If the flag "mirror pointer" is set,
        the processing module will invert the client position. The processing module will
        then write the new position to the topic ".../mouse_server_position", which we
        subscribe to. Once we receive data on the ".../mouse_server_position" topic, the
        position of the server pointer indicator (red square) will be updated.
      </div>
    </div>
  </UbiiClientContent>
</template>

<script>
import ProtobufLibrary from "@tum-far/ubii-msg-formats/dist/js/protobuf";
import { DEFAULT_TOPICS } from "@tum-far/ubii-msg-formats";
import UbiiClientService from "../../ubiiNode/ubiiClientService";

import UbiiClientContent from "../sharedModules/UbiiClientContent";

/* fontawesome */
import { library } from "@fortawesome/fontawesome-svg-core";
import { faMousePointer } from "@fortawesome/free-solid-svg-icons";

library.add(faMousePointer);

export default {
  name: "ExampleMousePointer",
  components: { UbiiClientContent },
  /* STEP 1: mounted() is our vue component entry point, start here! */
  mounted: async function () {
    // unsubscribe before page is suddenly closed
    window.addEventListener("beforeunload", () => {
      this.stopExample();
    });

    UbiiClientService.instance.on(UbiiClientService.EVENTS.CONNECT, () => {
      this.startExample();
    });
    UbiiClientService.instance.on(UbiiClientService.EVENTS.DISCONNECT, () => {
      this.stopExample();
    });

    // make sure we're connected, then start the example
    await UbiiClientService.instance.waitForConnection();
    this.startExample();
  },
  beforeDestroy: function () {
    this.stopExample();
  },
  data: () => {
    return {
      showClientPointer: false,
      showServerPointer: true,
      mirrorPointer: false,
      publishImmediately: false,
      publishIntervalMs: UbiiClientService.instance.getPublishIntervalMs(),
      ubiiClientService: UbiiClientService.instance,
      exampleStarted: false,
      clientMousePosition: { x: 0, y: 0 },
      serverMousePosition: { x: 0, y: 0 },
      clientPointerInside: false,
    };
  },
  watch: {
    mirrorPointer: function (value) {
      if (
        !UbiiClientService.instance.isConnected() ||
        !this.ubiiDevice.name ||
        !this.ubiiComponentMirrorPointer.topic
      ) {
        return;
      }

      this.publishMirrorPointer(value);
    },
  },
  methods: {
    createUbiiSpecs: function () {
      // create specifications for ubi-interact

      // helper definitions that we can reference later
      let deviceName = "web-example-mouse-pointer";
      let topicPrefix = "/" + UbiiClientService.instance.getClientID() + "/" + deviceName;

      // define our abstract device and its components

      // specification of a ubii.devices.Device
      // https://gitlab.lrz.de/IN-FAR/Ubi-Interact/ubii-msg-formats/blob/develop/src/proto/devices/device.proto
      this.ubiiDevice = {
        clientId: UbiiClientService.instance.getClientID(),
        name: deviceName,
        deviceType: ProtobufLibrary.ubii.devices.Device.DeviceType.PARTICIPANT,
        components: [
          // component publishing our mouse pointer position
          {
            name: "2D pointer original",
            ioType: ProtobufLibrary.ubii.devices.Component.IOType.PUBLISHER,
            topic: topicPrefix + "/mouse_client_position",
            messageFormat: "ubii.dataStructure.Vector2",
          },
          // component publishing the flag to invert the pointer position
          {
            name: "2D pointer mirroring around center",
            ioType: ProtobufLibrary.ubii.devices.Component.IOType.PUBLISHER,
            topic: topicPrefix + "/mirror_mouse",
            messageFormat: "bool",
          },
          // component subscribing to the pointer position returned by the server processing module
          {
            name: "2D pointer processed",
            ioType: ProtobufLibrary.ubii.devices.Component.IOType.SUBSCRIBER,
            topic: topicPrefix + "/mouse_server_position",
            messageFormat: "ubii.dataStructure.Vector2",
          },
        ],
      };
      this.ubiiComponentClientPointer = this.ubiiDevice.components[0];
      this.ubiiComponentMirrorPointer = this.ubiiDevice.components[1];
      this.ubiiComponentServerPointer = this.ubiiDevice.components[2];

      // specification of a ubii.processing.ProcessingModule
      let processingCallback = (deltaTime, inputs /*, state*/) => {
        if (!inputs.clientPointer || !inputs.clientPointer.vector2) {
          return {};
        }

        let outputs = {
          serverPointer: {}
        };

        if (inputs.mirrorPointer && inputs.mirrorPointer.bool === true) {
          outputs.serverPointer.vector2 = {
            x: 1 - inputs.clientPointer.vector2.x,
            y: 1 - inputs.clientPointer.vector2.y,
          };
        } else {
          outputs.serverPointer.vector2 = {
            x: inputs.clientPointer.vector2.x,
            y: inputs.clientPointer.vector2.y,
          };
        }

        return { outputs };
      };

      this.ubiiProcessingModule = {
        name: "mirror-mouse-pointer",
        onProcessingStringified: processingCallback.toString(),
        processingMode: {
          frequency: {
            hertz: 60,
          },
        },
        inputs: [
          {
            internalName: "clientPointer",
            messageFormat: "ubii.dataStructure.Vector2",
          },
          {
            internalName: "mirrorPointer",
            messageFormat: "bool",
          },
        ],
        outputs: [
          {
            internalName: "serverPointer",
            messageFormat: "ubii.dataStructure.Vector2",
          },
        ],
      };
      this.ubiiProcessingModule.inputClientPointer = this.ubiiProcessingModule.inputs[0];
      this.ubiiProcessingModule.inputMirrorPointer = this.ubiiProcessingModule.inputs[1];
      this.ubiiProcessingModule.outputServerPointer = this.ubiiProcessingModule.outputs[0];

      // specification of a ubii.sessions.Session
      // https://gitlab.lrz.de/IN-FAR/Ubi-Interact/ubii-msg-formats/blob/develop/src/proto/sessions/session.proto
      this.ubiiSession = {
        name: "web-mouse-example-session",
        processingModules: [this.ubiiProcessingModule],
        ioMappings: [
          {
            processingModuleName: this.ubiiProcessingModule.name,
            inputMappings: [
              {
                inputName: this.ubiiProcessingModule.inputClientPointer.internalName,
                topicSource: "topic",
                topic: this.ubiiComponentClientPointer.topic,
              },
              {
                inputName: this.ubiiProcessingModule.inputMirrorPointer.internalName,
                topicSource: "topic",
                topic: this.ubiiComponentMirrorPointer.topic,
              },
            ],
            outputMappings: [
              {
                outputName: this.ubiiProcessingModule.outputServerPointer.internalName,
                topicDestination: "topic",
                topic: this.ubiiComponentServerPointer.topic,
              },
            ],
          },
        ],
      };
    },
    /* STEP 2: making all calls related to ubi-interact backend */
    startExample: async function () {
      if (this.exampleStarted) {
        return;
      }
      this.$data.exampleStarted = true;
      this.publishIntervalMs = UbiiClientService.instance.getPublishIntervalMs();

      // create all the specifications we need to define our example application
      // these are protobuf messages to be sent to the server (saved in this.$data)
      this.createUbiiSpecs();

      // register the mouse pointer device
      let replyRegisterDevice = await UbiiClientService.instance.registerDevice(
        this.ubiiDevice
      );
      // the device specs we send to backend intentionally left out the device ID
      // if the backend accepts the device registration, it will send back our specs
      // plus any necessary info (like the ID) filled in by the backend
      // that way we make sure the ID is created by the backend and valid
      if (replyRegisterDevice.id) {
        // success, we accept the device specs sent back to us as the final specs
        this.ubiiDevice = replyRegisterDevice;
      } else {
        // something went wrong, print to console
        console.error(replyRegisterDevice);
      }

      // subscribe to the device topics so we are notified when new data arrives on the topic
      this.subTokenServerPointer = await UbiiClientService.instance.subscribeTopic(
        this.ubiiComponentServerPointer.topic,
        // a callback to be called when new data on this topic arrives
        this.subscriptionServerPointerPosition
      );

      // start our session (registering not necessary as we do not want to save it permanently)
      let replySessionStart = await UbiiClientService.instance.client.callService({
        topic: DEFAULT_TOPICS.SERVICES.SESSION_RUNTIME_START,
        session: this.ubiiSession,
      });
      if (replySessionStart.session) {
        this.ubiiSession = replySessionStart.session;
      }
    },
    stopExample: async function () {
      if (!this.exampleStarted) return;

      UbiiClientService.instance.setPublishIntervalMs(15);
      this.exampleStarted = false;

      // unsubscribe and stop session
      await UbiiClientService.instance.unsubscribe(this.subTokenServerPointer);
      await UbiiClientService.instance.callService({
        topic: DEFAULT_TOPICS.SERVICES.SESSION_RUNTIME_STOP,
        session: this.ubiiSession,
      });

      if (this.ubiiDevice) {
        await UbiiClientService.instance.deregisterDevice(this.ubiiDevice);
      }
    },
    /* publishing and subscribing */
    subscriptionServerPointerPosition: function (record) {
      // when we get a normalized server pointer position, we calculate back to absolute (x,y) within the
      // mouse area and set our red square indicator
      let boundingRect = document
        .getElementById("mouse-pointer-area")
        .getBoundingClientRect();
      this.$data.serverMousePosition = {
        x: record.vector2.x * boundingRect.width,
        y: record.vector2.y * boundingRect.height,
      };
    },
    publishClientPointerPosition: function (vec2) {
      if (this.publishImmediately) {
        UbiiClientService.instance.publishRecordImmediately({
          topic: this.ubiiComponentClientPointer.topic,
          vector2: vec2,
        });
      } else {
        // publish our normalized client mouse position
        UbiiClientService.instance.publishRecord({
          topic: this.ubiiComponentClientPointer.topic,
          vector2: vec2,
        });
      }
    },
    publishMirrorPointer: function (boolean) {
      // if the checkbox is changed, we publish this info on the related topic
      UbiiClientService.instance.publishRecord({
        topic: this.ubiiComponentMirrorPointer.topic,
        bool: boolean,
      });
    },
    onPublishIntervalChange: function (event) {
      UbiiClientService.instance.setPublishIntervalMs(event.target.value);
    },
    /* UI events */
    onMouseMove: function (event) {
      if (!this.exampleStarted) {
        return;
      }

      // calculate the current mouse position, normalized to the bounds of the interactive area ([0;1], [0;1])
      let boundingRect = document
        .getElementById("mouse-pointer-area")
        .getBoundingClientRect();
      let relativeMousePosition = {
        x: (event.clientX - boundingRect.left) / boundingRect.width,
        y: (event.clientY - boundingRect.top) / boundingRect.height,
      };

      this.$data.clientMousePosition = relativeMousePosition;
      // publish our normalized client mouse position
      this.publishClientPointerPosition(this.$data.clientMousePosition);
    },
    onTouchStart: function (event) {
      this.$data.clientPointerInside = true;
      this.onTouchMove(event);
    },
    onTouchMove: function (event) {
      if (!this.exampleStarted) {
        return;
      }

      // calculate the current touch position, normalized to the bounds of the interactive area ([0;1], [0;1])
      let relativeMousePosition = {
        x:
          (event.touches[0].clientX - event.target.offsetLeft) / event.target.offsetWidth,
        y:
          (event.touches[0].clientY - event.target.offsetTop) / event.target.offsetHeight,
      };

      if (
        relativeMousePosition.x < 0 ||
        relativeMousePosition.x > 1 ||
        relativeMousePosition.y < 0 ||
        relativeMousePosition.y > 1
      ) {
        this.$data.clientPointerInside = false;
        return;
      }

      this.$data.clientMousePosition = relativeMousePosition;
      // publish our normalized client touch position
      this.publishClientPointerPosition(this.$data.clientMousePosition);
    },
  },
};
</script>

<style scoped>
.grid {
  display: grid;
  grid-gap: 15px;
  grid-template-columns: 2fr 6fr;
  grid-template-rows: 30px 300px auto 30px auto;
  grid-template-areas:
    'header-demo header-demo'
    'demo-options demo-mouse-area'
    'description-options description-mouse-area'
    'header-description header-description'
    'description-general description-general';
  height: 100%;
  color: black;
}
.options {
  grid-area: demo-options;
  margin: 25px;
}
.mouse-pointer-area {
  grid-area: demo-mouse-area;
  margin: 10px;
  border: 3px solid black;
}
.hideCursor {
  cursor: none;
}
.server-mouse-position-indicator {
  position: relative;
  width: 10px;
  height: 10px;
  background-color: red;
}
.start-example {
  text-align: center;
  margin-top: 25px;
}
.start-example-button {
  width: 50px;
  height: 50px;
}
.description-general {
  grid-area: description-general;
  padding: 20px;
}
.description-options {
  grid-area: description-options;
  padding: 20px;
}
.description-mouse-area {
  grid-area: description-mouse-area;
  padding: 20px;
}
.header-demo {
  grid-area: header-demo;
  margin: 10px;
}
.header-description {
  grid-area: header-description;
  margin: 10px;
}
.seperator {
  border-bottom: solid 1px purple;
  height: 10px;
  line-height: 20px;
  text-align: left;
}
.separator-label {
  display: inline;
  padding-left: 15px;
  padding-right: 20px;
  color: purple;
}
</style>
