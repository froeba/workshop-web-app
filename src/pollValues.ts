import { ConnectApi, DeviceRepository } from "mbed-cloud-sdk";
import { NotificationData } from "mbed-cloud-sdk/types/legacy/connect/types";
const directory = new DeviceRepository();

const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");
const POLLING_INTERVAL = 1000 * 60 * 15;

export const getValues = async (connect: ConnectApi, notify: (data: NotificationData) => void) => {
  console.log("Getting latest resource values");
  let id = undefined;
  if (deviceId.join("") !== "*") {
    id = { in: deviceId };
  }
  const devices = await directory.list({ filter: { state: "registered", id } }).all();
  devices.forEach(async ({ id }) => {
    if (id) {
      const resources = await connect.listResources(id);
      resources.forEach(({ path }) => {
        resourcePaths.forEach(subPath => {
          if (path.startsWith(subPath.replace("*", ""))) {
            console.log(id, path);
            try {
              connect.getResourceValue(id, path).then(value => {
                notify({ deviceId: id, path, payload: value as string });
              });
            } catch (e) {
              console.error(e);
            }
          }
        });
      });
    }
  });
  setTimeout(() => getValues(connect, notify), POLLING_INTERVAL);
};
