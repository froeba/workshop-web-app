import { ConnectApi, DeviceRepository } from "mbed-cloud-sdk";
const directory = new DeviceRepository();

const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");

export const getValues = async (connect: ConnectApi) => {
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
              connect.getResourceValue(id, path);
            } catch (e) {
              console.error(e);
            }
          }
        });
      });
    }
  });
  setTimeout(() => getValues(connect), 1000 * 60 * 5);
};
