/* eslint-disable no-console */

class RESTClient {
  /**
   * Communication endpoint implementing REST pattern.
   * @param {string} url URL to connect to.
   */
  constructor(url) {
    this.url = url;
  }

  //TODO: make async/await !
  send(message) {
    return new Promise((resolve, reject) => {
      let body = JSON.stringify(message);

      const request = new Request(this.url, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body
      });

      try {
        fetch(request).then((response) => {
          if (!response.ok) {
            throw new Error('Network response was not ok.');
          }
          return resolve(response.json());
        });
      } catch (error) {
        console.error(error);
        return reject(error);
      }
    });
  }
}

export default RESTClient;
