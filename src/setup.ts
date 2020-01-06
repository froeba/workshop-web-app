import { ConnectApi } from "mbed-cloud-sdk";
import { NotificationData } from "mbed-cloud-sdk/types/legacy/connect/types";
import { Pool } from "pg";
import { getValues } from "./pollValues";

const hostName = process.env.HOSTNAME || "https://localhost";
const webhookURI = new URL("callback", hostName).toString();
const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");

console.log(`HOSTNAME=${hostName}`);
console.log(`RESOURCE=${resourcePaths.join(",")}`);
console.log(`DEVICE_ID=${deviceId.join(",")}`);
console.log(`LONG_POLLING_ENABLED=${process.env.LONG_POLLING_ENABLED}`);

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
    await connect.deletePresubscriptions();
    connect.subscribe.resourceValues({ deviceId, resourcePaths }, "OnValueUpdate").addListener(n => notification(n));
    if (longPolling) {
      await connect.startNotifications();
      console.log("Subscriptions updated, using long-polling");
    } else {
      await connect.updateWebhook(webhookURI, {}, true);
      console.log(`Subscriptions updated, using Webhook "${webhookURI}"`);
    }
  } catch (err) {
    console.error(err);
  }

  getValues(connect, notification);
};
