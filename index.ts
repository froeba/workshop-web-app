import express from "express";
import { ConnectApi, DeviceDirectoryApi } from "mbed-cloud-sdk";
import { NotificationData } from "mbed-cloud-sdk/types/legacy/connect/types";
import moment from "moment";
import path from "path";
import { Pool } from "pg";
import { getValues } from "./src/pollValues";

const connect = new ConnectApi({
  forceClear: true,
  autostartNotifications: false,
});

const PORT = process.env.PORT || 5000;
const hostName = process.env.HOSTNAME || "https://localhost";
const webhookURI = new URL("callback", hostName).toString();
const resourcePaths = (process.env.RESOURCE || "/3303/*").split(",");
const deviceId = (process.env.DEVICE_ID || "*").split(",");

console.log(`HOSTNAME=${hostName}`);
console.log(`RESOURCE=${resourcePaths.join(",")}`);
console.log(`DEVICE_ID=${deviceId.join(",")}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

interface Results {
  results: any[];
}

const getQuery = async (query = "select * from resource_values;") => {
  const results: Results = { results: [] };
  const client = await pool.connect();
  const result = await client.query(query);
  results.results = result ? result.rows : [];
  client.release();
  return results;
};

const main = async () => {
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
  getValues(connect);
};

const notification = async ({ deviceId, path, payload }: NotificationData) => {
  const text =
    "INSERT INTO resource_values(device_id, path, time, value) VALUES($1, $2, to_timestamp($3 / 1000.0), $4) RETURNING *";
  const values = [deviceId, path, Date.now(), payload];
  try {
    const res = await pool.query(text, values);
    const { id, device_id, path, value, time } = res.rows[0];
    const t = moment(time)
      .format("lll")
      .toString();
    console.log(`${t} ${id} ${device_id} ${path} ${value}`);
  } catch (err) {
    console.log(err.stack);
  }
};

express()
  .use(express.static(path.join(__dirname, "client/build")))
  .use(express.json())
  .use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  })
  .get("/values", async (req, res) => {
    const query = "select * from resource_values order by time desc limit 10000;";
    try {
      res.send(await getQuery(query));
    } catch (err) {
      res.send("Error" + err);
    }
  })
  .all("/callback", async (req, res) => {
    try {
      connect.notify(req.body);
    } catch (err) {
      console.log(err.stack);
    } finally {
      res.sendStatus(204);
    }
  })
  .get("*", (req, res) => {
    res.sendFile(path.join(__dirname + "/client/build/index.html"));
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`))
  .once("listening", main);
