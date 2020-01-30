import fetch from "node-fetch";
import { storeAsync } from "../";
import { DeviceResource, NotificationData, RegisteredDevicesResponse } from "./types";
import { checkStatus, generateId, matchWithWildcard, resolveIn } from "./utils";

const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");
const POLLING_INTERVAL = 1000 * 60 * 5;

const apiUrl = process.env.API_HOST || "https://api.us-east-1.mbedcloud.com/";
const apiKey = process.env.API_KEY;
const headers = { Authorization: `bearer ${apiKey}`, "Content-Type": "application/json" };

const deviceDirectoryUrl = new URL("/v3/devices", apiUrl);
const endpointsUrl = new URL("/v2/endpoints", apiUrl);
const deviceRequestUrl = new URL("/v2/device-requests", apiUrl);

export const getValues = async (notify: (data: NotificationData) => void) => {
  console.log("Getting latest resource values");
  let id = undefined;
  if (deviceId.join("") !== "*") {
    id = { in: deviceId };
  }
  console.log("Getting registered devices");
  const registeredDevices = (await fetch(`${deviceDirectoryUrl}?state__eq=registered`, { headers })
    .then(checkStatus)
    .then(res => res.json())) as RegisteredDevicesResponse;

  registeredDevices.data
    .filter(device => deviceId.reduce<boolean>((prev, curr) => prev || matchWithWildcard(curr, device.id), false))
    .forEach(async device => {
      console.log(`Looking for resources on ${device.id}`);
      const resources = (await fetch(`${endpointsUrl}/${device.id}`, { headers })
        .then(checkStatus)
        .then(r => r.json())) as DeviceResource[];
      const matchedRes = resources.filter(resource =>
        resourcePaths.reduce<boolean>((prev, curr) => prev || matchWithWildcard(curr, resource.uri), false)
      );

      for (const resource of matchedRes) {
        console.log(`Requesting resource ${resource.uri}`);
        const asyncId = generateId();
        const body = JSON.stringify({
          method: "GET",
          uri: resource.uri,
        });
        const url = `${deviceRequestUrl}/${device.id}?async-id=${asyncId}`;
        await fetch(url, {
          method: "POST",
          headers,
          body,
        })
          .then(checkStatus)
          .then(res => {
            if (!res.ok) console.log(resource.uri);
          });
        storeAsync({ asyncId, deviceId: device.id, path: resource.uri });

        await resolveIn(100);
      }
    });
  console.log("Subscriptions updated");

  setTimeout(() => getValues(notify), POLLING_INTERVAL);
};
