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

export const setup = async (connect: ConnectApi, pool: Pool, notification: (n: NotificationData) => void) => {
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

  console.log("Updating Webhook and subscriptions - " + webhookURI);
  try {
    await connect.deletePresubscriptions();
    connect.subscribe
      .resourceValues(
        {
          deviceId,
          resourcePaths,
        },
        "OnValueUpdate"
      )
      .addListener(n => notification(n));
    await connect.updateWebhook(webhookURI, {}, true);
  } catch (err) {
    console.error(err);
  }

  console.log("Webhook and subscriptions updated");
  getValues(connect, notification);
};
