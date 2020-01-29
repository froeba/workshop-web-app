import fetch, { Response } from "node-fetch";
import { ConnectApi } from "mbed-cloud-sdk";
import { NotificationData } from "mbed-cloud-sdk/types/legacy/connect/types";
import { Pool } from "pg";
import { getValues } from "./pollValues";

const hostName = process.env.HOSTNAME || "https://localhost";
const webhookURI = new URL("callback", hostName).toString();
const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");
const apiUrl = process.env.MBED_CLOUD_SDK_HOST || "https://api.us-east-1.mbedcloud.com/";
const apiKey = process.env.MBED_CLOUD_SDK_API_KEY;
const headers = { Authorization: `bearer ${apiKey}` };

const subscriptionsUrl = new URL("/v2/subscriptions", apiUrl);
const deviceDirectoryUrl = new URL("/v3/devices", apiUrl);
const endpointsUrl = new URL("/v2/endpoints", apiUrl);

console.log(`HOSTNAME=${hostName}`);
console.log(`RESOURCE=${resourcePaths.join(",")}`);
console.log(`DEVICE_ID=${deviceId.join(",")}`);
console.log(`LONG_POLLING_ENABLED=${process.env.LONG_POLLING_ENABLED}`);

function checkStatus(res: Response) {
  if (res.ok) {
    // res.status >= 200 && res.status < 300
    return res;
  } else {
    throw Error(res.statusText);
  }
}

/**
 * Internal function
 * @ignore
 */
function matchWithWildcard(input: string, matchWith: string): boolean {
  // if we have nothing to match with, return false
  if (matchWith === null || matchWith === undefined || matchWith === "") {
    return false;
  }

  // if input is empty or * then we're listening to everything so return true
  if (input === null || input === undefined || input === "" || input === "*") {
    return true;
  }

  // if wildcard used, match on begining of string
  if (input.endsWith("*")) {
    return matchWith.startsWith(input.slice(0, -1));
  }

  // no wildcard so match strings explicitly
  return input === matchWith;
}

export const setup = async (
  connect: ConnectApi,
  pool: Pool,
  notification: (n: NotificationData) => void,
  longPolling: boolean = false
) => {
  console.log("Updating table schema");
  try {
    const client = await pool.connect();
    const query =
      "create table if not exists resource_values ( id serial, device_id varchar(50), path varchar(50), time timestamp, value text );";
    await client.query(query);
    client.release();
  } catch (err) {
    console.error(err);
  }

  try {
    console.log("Updating subscriptions");
    await fetch(subscriptionsUrl, {
      method: "DELETE",
      headers,
    }).then(checkStatus);

    const subscriptionBody: any[] = [];
    deviceId.forEach(d => subscriptionBody.push({ "endpoint-name": d, "resource-path": resourcePaths }));

    console.log("Setting pre-subscriptions");
    await fetch(subscriptionsUrl, { method: "PUT", headers, body: JSON.stringify(subscriptionBody) }).then(checkStatus);

    // set subscription on already registered devices
    console.log("Setting subscriptions on registered devices");
    const registeredDevices = await fetch(`${deviceDirectoryUrl}?state__eq=registered`, { headers })
      .then(checkStatus)
      .then(res => res.json());

    registeredDevices.data
      .filter((device: any) => deviceId.reduce((prev, curr) => prev || matchWithWildcard(curr, device.id), false))
      .forEach(async (device: any) => {
        const resources = await fetch(`${endpointsUrl}/${device.id}`, { headers })
          .then(checkStatus)
          .then(r => r.json());
        resources
          .filter((resource: any) =>
            resourcePaths.reduce((prev, curr) => prev || matchWithWildcard(curr, resource.uri), false)
          )
          .forEach(
            async (resource: any) =>
              await fetch(`${subscriptionsUrl}/${device.id}/${resource.uri}`, { method: "PUT", headers }).then(
                checkStatus
              )
          );
      });
    console.log("Subscriptions updated");

    if (longPolling) {
      await connect.startNotifications();
      console.log("Using long-polling");
    } else {
      await connect.updateWebhook(webhookURI, {}, true);
      console.log(`Using Webhook "${webhookURI}"`);
    }
  } catch (err) {
    console.error(err);
  }

  getValues(connect, notification);
};
