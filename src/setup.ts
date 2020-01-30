import fetch from "node-fetch";
import { Pool } from "pg";
import { removeAsync } from "../";
import { getValues } from "./pollValues";
import { AsyncRequest, DeviceResource, NotificationData, NotificationResponse, RegisteredDevicesResponse, SubscriptionBody } from "./types";
import { checkStatus, matchWithWildcard } from "./utils";

const hostName = process.env.HOSTNAME || "https://localhost";
const webhookURI = new URL("callback", hostName).toString();
const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");
const apiUrl = process.env.API_HOST || "https://api.us-east-1.mbedcloud.com/";
const apiKey = process.env.API_KEY;
const headers = { Authorization: `bearer ${apiKey}` };

const subscriptionsUrl = new URL("/v2/subscriptions", apiUrl);
const deviceDirectoryUrl = new URL("/v3/devices", apiUrl);
const endpointsUrl = new URL("/v2/endpoints", apiUrl);
const longPollUrl = new URL("/v2/notification/pull", apiUrl);
const webhookUrl = new URL("/v2/notification/callback", apiUrl);

console.log(`HOSTNAME=${hostName}`);
console.log(`RESOURCE=${resourcePaths.join(",")}`);
console.log(`DEVICE_ID=${deviceId.join(",")}`);
console.log(`LONG_POLLING_ENABLED=${process.env.LONG_POLLING_ENABLED}\n`);

export const setup = async (pool: Pool, notification: (n: NotificationData) => void, longPolling: boolean = false) => {
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

    const subscriptionBody: SubscriptionBody[] = [];
    deviceId.forEach(d => subscriptionBody.push({ "endpoint-name": d, "resource-path": resourcePaths }));

    console.log("Setting pre-subscriptions");
    await fetch(subscriptionsUrl, { method: "PUT", headers, body: JSON.stringify(subscriptionBody) }).then(checkStatus);

    // set subscription on already registered devices
    console.log("Setting subscriptions on registered devices");
    const registeredDevices = await fetch(`${deviceDirectoryUrl}?state__eq=registered`, { headers })
      .then(checkStatus)
      .then(res => res.json()) as RegisteredDevicesResponse;

    registeredDevices.data
      .filter(device => deviceId.reduce<boolean>((prev, curr) => prev || matchWithWildcard(curr, device.id), false))
      .forEach(async device => {
        const resources = await fetch(`${endpointsUrl}/${device.id}`, { headers })
          .then(checkStatus)
          .then(r => r.json()) as DeviceResource[];
        resources
          .filter(resource =>
            resourcePaths.reduce<boolean>((prev, curr) => prev || matchWithWildcard(curr, resource.uri), false)
          )
          .forEach(
            async resource =>
              await fetch(`${subscriptionsUrl}/${device.id}/${resource.uri}`, { method: "PUT", headers }).then(
                checkStatus
              )
          );
      });
    console.log("Subscriptions updated");

    await fetch(webhookUrl, { method: "DELETE", headers })
      .then(checkStatus)
      .catch(() => {});
    console.log("Deleted old webhook");

    if (longPolling) {
      startLongPoll(notification);
      console.log("Using long-polling");
    } else {
      const webhookBody = {
        url: webhookURI,
        serialization: {
          type: "v2",
          cfg: {
            include_timestamp: true,
          },
        },
      };
      await fetch(webhookUrl, {
        headers: { ...headers, "content-type": "application/json" },
        method: "PUT",
        body: JSON.stringify(webhookBody),
      }).then(checkStatus);
      console.log(`Using Webhook "${webhookURI}"`);
    }
  } catch (err) {
    console.error(err);
  }

  getValues(notification);
};

const startLongPoll = (notification: (n: NotificationData) => void) => {
  setTimeout(() => longPoll(notification), 0);
};

const longPoll = async (notification: (n: NotificationData) => void) => {
  const result = await fetch(longPollUrl, { headers })
    .then(checkStatus)
    .then(r => r.json())
    .catch(e => {
      setTimeout(() => longPoll(notification), 5000);
    });
  setTimeout(() => longPoll(notification), 0);
  handleNotification(result, notification);
};

export const handleNotification = (result: NotificationResponse, notification: (n: NotificationData) => void) => {
  const { notifications } = result;
  const asyncResponses = result["async-responses"];
  if (notifications) {
    notifications.forEach((n) =>
      notification({ deviceId: n.ep, path: n.path, payload: Buffer.from(n.payload, "base64").toString() })
    );
  }
  if (asyncResponses) {
    asyncResponses.forEach((n) => {
      const async = removeAsync(n.id) as AsyncRequest;
      if (async) {
        notification({ deviceId: async?.deviceId, path: async?.path, payload: Buffer.from(n.payload, "base64").toString()});
      }
    });
  }
};
