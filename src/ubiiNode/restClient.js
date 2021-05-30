/* eslint-disable no-console */
import UbiiClientService from './ubiiClientService';

class RESTClient {
  /**
   * Communication endpoint implementing REST pattern.
   * @param {*} host Host to connect to.
   * @param {*} port Port to connect to.
   */
  constructor(host = 'localhost', port = 5555) {
    this.host = host;
    this.port = port;
  }

  send(route, message) {
    let url = UbiiClientService.instance.useHTTPS ? 'https://' : 'http://';
    url += this.host + ':' + this.port + route;

    return new Promise(async (resolve, reject) => {
      let body = JSON.stringify(message);

      const request = new Request(url, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body
      });

      try {
        const response = await fetch(request);
        if (!response.ok) {
          throw new Error('Network response was not ok.');
        }
        return resolve(response.json());
      } catch (error) {
        console.error(error);
        return reject(error);
      }
    });
  }
}

export default RESTClient;
