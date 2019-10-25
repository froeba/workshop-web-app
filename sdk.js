const { Pool } = require("pg");
const { ConnectApi } = require("mbed-cloud-sdk");
const moment = require("moment");

console.log("Starting SDK process");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

const connect = new ConnectApi();

const observer = connect.subscribe.resourceValues(
  {
    deviceId: "*",
    resourcePaths: ["/3303/*"]
  },
  "OnValueUpdate"
);

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
  observer.once().then(notification);
};

observer.once().then(notification);
