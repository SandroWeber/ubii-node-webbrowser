# ubii-node-webbrowser

## Usage
[API Documentation](https://sandroweber.github.io/ubii-node-webbrowser/UbiiClientService.html)

### Quick Reference

#### Initialization

'''
UbiiClientService.instance.setName('My Ubi-Interact Browser Node');
UbiiClientService.instance.connect('...master node service url ...', '...master node topic data url ...');
UbiiClientService.instance.setPublishIntervalMs(123);  // optional adjustment to frequence in which TopicDataRecords are regularly bundled up and sent to master node
'''

#### Service Calls

'''
// a service request object matching https://github.com/SandroWeber/ubii-msg-formats/blob/develop/src/proto/services/serviceRequest.proto
// topic is required, rest of the data depends on the service (check service overview on web-frontend for master node)
let serviceRequest = {
    topic: 'my/service/topic',
    ... 
};
UbiiClientService.instance.callService(serviceRequest);
'''
