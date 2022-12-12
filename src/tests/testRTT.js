export default class TestRTT extends EventTarget {
  constructor(ubiiNode) {
    super();

    this.ubiiNode = ubiiNode;

    this.status = TestRTT.STATUS.UNMEASURED;
    this.settings = {};
    this.stats = {
      timings: []
    };
    this.results = {};
  }

  setStatus(status) {
    this.status = status;
    this.dispatchEvent(TestRTT.EVENTS.STATUS_CHANGE, this.status);
  }

  async start(messageLimit) {
    if (this.status === TestRTT.STATUS.RUNNING) return;
    await this.ubiiNode.waitForConnection();

    this.prepare(messageLimit);
  }

  async prepare(messageLimit) {
    this.setStatus(TestRTT.STATUS.RUNNING);

    this.settings.topic = this.ubiiNode.getClientID() + '/test_rtt';
    this.settings.messageLimit = messageLimit;

    this.stats.timings = [];
    this.stats.tSent = 0;
    this.stats.count = 0;

    this.results = {};

    this.subToken = await UbiiClientService.instance.subscribeTopic(this.testRTT.topic, this.receiveMessage);
  }

  async stop() {
    this.setStatus(TestRTT.STATUS.STOPPED);

    await this.ubiiNode.unsubscribe(this.subToken);
  }

  finish() {
    this.stop();

    let sum = this.stats.timings.reduce((partial_sum, a) => partial_sum + a);
    this.results.avgRTT = sum / this.stats.timings.length;
    this.setStatus(TestRTT.STATUS.FINISHED);
  }

  receiveMessage(data, topic) {
    const timing = performance.now() - this.stats.tSent;
    this.stats.timings.push(timing);
    if (typeof this.results.minimum === 'undefined' || this.results.minimum > timing) {
      this.results.minimum = timing;
    }
    if (typeof this.results.maximum === 'undefined' || this.results.maximum < timing) {
      this.results.maximum = timing;
    }
    this.stats.count++;
    if (this.stats.count < this.settings.messageLimit) {
      this.sendMessage();
    } else {
      this.finish();
    }
  }

  sendMessage() {
    this.stats.tSent = performance.now();
    this.ubiiNode.publishRecordImmediately({
      topic: this.settings.topic,
      double: 1
    });
  }
}

TestRTT.STATUS = Object.freeze({
  UNMEASURED: 'unmeasured',
  RUNNING: 'running',
  STOPPED: 'stopped',
  FINISHED: 'finished'
});

TestRTT.EVENTS = Object.freeze({
  STATUS_CHANGE: 'status_change'
});
