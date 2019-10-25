const express = require("express");
const moment = require("moment");
const path = require("path");
const { Pool } = require("pg");
const Sdk = require("mbed-cloud-sdk");

const connect = new Sdk.ConnectApi();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

const getQuery = async (query = "select * from resource_values;") => {
  const results = { results: undefined };
  const client = await pool.connect();
  const result = await client.query(query);
  results.results = result ? result.rows : undefined;
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
    console.log("Table schema updated");
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
  const webhookURI = process.env.HOSTNAME + "callback";
  console.log("Updating Webhook and subscriptions - " + webhookURI);
  try {
    connect.handleNotifications = true;
    await connect.updateWebhook(webhookURI, {}, true);
    connect.subscribe
      .resourceValues(
        {
          deviceId: "*",
          resourcePaths: ["/3303/*", "/3202/0/5600"]
        },
        "OnValueUpdate"
      )
      .addListener(n => notification(n));
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
  console.log("Webhook and subscriptions updated");
};

const notification = async ({ deviceId, path, payload }) => {
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
  .use(express.static(path.join(__dirname, "public")))
  .use(express.static(path.join(__dirname, "client/build")))
  .use(express.json())
  .use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  })
  .get("/values", async (req, res) => {
    const query = "select * from resource_values order by time desc limit 5000;";
    try {
      res.send(await getQuery(query));
    } catch (err) {
      res.send("Error" + err);
    }
  })
  .get("/db", async (req, res) => {
    const query =
      "select device_id, path, count(value), avg(cast(value as float)) from resource_values group by device_id, path;";
    try {
      res.send(await getQuery(query));
    } catch (err) {
      res.send("Error" + err);
    }
  })
  .get("/devices", async (req, res) => {
    const deviceList = new Sdk.DeviceRepository().list({
      maxResults: 10,
      filter: { state: "registered" }
    });
    const results = [];
    for await (const device of deviceList) {
      results.push(device);
    }
    res.send(results);
  })
  .all("/callback", async (req, res) => {
    try {
      if (req.body && req.body.notifications) {
        connect.notify(req.body);
      }
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
