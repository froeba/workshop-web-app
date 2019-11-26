import moment from "moment";
import React, { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import superagent from "superagent";
import { Devices, Names, Paths, ResourceValue } from ".";
import "./App.css";

const PAUSE_FOR_POLL = 10 * 1000;

const deviceNames: Names = {};

const resourceNames: Names = {
  "/3323/.*/5700": "Air pressure",
};

const App: React.FC = () => {
  const [values, setValues] = useState<ResourceValue[]>([]);
  const devices: Devices = {};

  const getValues = () => {
    superagent
      .get("/values")
      .then(parseValues)
      .catch(() => window.setTimeout(getValues, PAUSE_FOR_POLL));
  };

  const parseValues = (result: superagent.Response) => {
    if (result.body) {
      const val: ResourceValue[] = result.body.results.map((a: any) => ({
        ...a,
        value: parseFloat(a.value),
        time: new Date(a.time),
        epoch: new Date(a.time).valueOf(),
      }));
      setValues(val);
    }
    window.setTimeout(getValues, PAUSE_FOR_POLL);
  };

  useEffect(getValues, []);

  values.map(v => {
    if (!devices[v.device_id]) {
      devices[v.device_id] = {};
    }
    if (!devices[v.device_id][v.path]) {
      devices[v.device_id][v.path] = [];
    }
    devices[v.device_id][v.path].push(v);
    return v;
  });

  const showDevices = (d: Devices) =>
    Object.keys(d)
      .sort((a, b) => a.localeCompare(b))
      .map(res => showDevice(d[res], res));

  const showDevice = (paths: Paths, deviceId: string) =>
    Object.keys(paths)
      .sort((a, b) => a.localeCompare(b))
      .map(res => {
        const deviceName = deviceNames[deviceId]
          ? deviceNames[deviceId]
          : `${deviceId.slice(0, 6)}...${deviceId.slice(-6)}`;
        const matchPath = Object.keys(resourceNames)
          .map(e => (res.match(e) ? e : false))
          .reduce((acc, cur) => (!!cur ? cur : acc), "");
        const resourceName = matchPath && resourceNames[matchPath] ? resourceNames[matchPath] : res;
        const [val1, val2] = paths[res];
        const styleColour =
          val1 && val2 && val1.value !== val2.value ? (val1.value > val2.value ? "green" : "red") : "white";
        return (
          <div className="device" key={res}>
            <h3 title={deviceId}>
              {deviceName} - {resourceName}
            </h3>
            <div className="App-graph">
              <div className="graph">{showPath(paths[res])}</div>
              <div className="value">
                <h1>
                  <span style={{ color: styleColour }}>{paths[res][0].value.toFixed(1)}</span>
                </h1>
              </div>
            </div>
          </div>
        );
      });

  const showPath = (values: ResourceValue[]) => {
    const max = Math.ceil(values.reduce((a, c) => (a ? (c.value > a ? c.value : a) : c.value), -Infinity));
    const min = Math.floor(values.reduce((a, c) => (c.value < a ? c.value : a), Infinity));
    const margin = Math.ceil((max - min) * 0.1);
    const { time, value, device_id, path } = values[0];
    const latest = { time, value, id: 0, device_id, path, epoch: Date.now() };
    values.reverse();
    values.push(latest);
    values.reverse();
    return (
      <ResponsiveContainer aspect={21 / 9} minHeight={200}>
        <LineChart data={values}>
          <Line dot={false} type="monotone" dataKey="value" animationEasing="linear" />
          <XAxis
            scale="time"
            dataKey="epoch"
            type="number"
            tick={false}
            domain={["auto", "auto"]}
            tickFormatter={d => moment(d).format("LTS")}
          />
          <YAxis domain={[Math.floor(min - margin), Math.ceil(max + margin)]} />
          <Tooltip labelFormatter={d => moment(d).format("ll LTS")} />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        {showDevices(devices)}
        {values.length === 0 && <h1 className="noData">No data available</h1>}
      </header>
    </div>
  );
};

export default App;
