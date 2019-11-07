import moment from "moment";
import React, { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import superagent from "superagent";
import "./App.css";

const deviceNames: { [index: string]: string } = {
  "016981016ceb00000000000100100100": "Disco 1",
  "016b9e62feda000000000001001000fa": "K64F 1",
  "016badc3e46400000000000100100312": "K64F 2",
  "016bade3650a000000000001001000d0": "Odin 1",
  "016bade3be1e000000000001001000d3": "Odin 2",
  "016e12b596320000000000010010fe40": "K64F 3",
  "016e12ed701500000000000100110272": "K64F 4",
  "016e12f203360000000000010011032f": "K64F 5"
};

const resourceNames: { [index: string]: string } = {
  "/3303/.*/5700": "Temperature",
  "/3304/.*/5700": "Relative Humidity",
  "/3323/.*/5700": "Air pressure"
};

interface ResourceValue {
  id: number;
  device_id: string;
  path: string;
  time: Date;
  value: number;
  epoch: number;
}

interface Paths {
  [path: string]: ResourceValue[];
}
interface Devices {
  [device: string]: Paths;
}
const App: React.FC = () => {
  const [values, setValues] = useState<ResourceValue[]>([]);
  const getValues = () => {
    superagent.get("/values").then(result => {
      const val: ResourceValue[] = result.body.results.map((a: any) => ({
        ...a, 
        value: parseFloat(a.value),
        time: new Date(a.time),
        epoch: new Date(a.time).valueOf()
      }));
      setValues(val);
      window.setTimeout(getValues, 10 * 1000);
    });
  };
  useEffect(getValues, []);

  const devices: Devices = {};
  values.map((v: ResourceValue) => {
    if (!devices[v.device_id]) {
      devices[v.device_id] = {};
    }
    if (!devices[v.device_id][v.path]) {
      devices[v.device_id][v.path] = [];
    }
    devices[v.device_id][v.path].push(v);
    return v;
  });
  console.log(Object.keys(devices));

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
        const resourceName =
          matchPath && resourceNames[matchPath]
            ? resourceNames[matchPath]
            : res;
        return (
          <div className="device" key={res}>
            <h3 title={deviceId}>
              {deviceName} - {resourceName}
            </h3>
            <div className="App-graph">
              <div className="graph">{showPath(paths[res])}</div>
              <div className="value">
                <h1>
                  <span
                    style={{
                      color:
                        paths[res][0].value > paths[res][1].value
                          ? "green"
                          : "red"
                    }}
                  >
                    {paths[res][0].value.toFixed(1)}
                  </span>
                </h1>
              </div>
            </div>
          </div>
        );
      });

  const showPath = (values: ResourceValue[]) => {
    const max = Math.ceil(
      values.reduce(
        (a, c) => (a ? (c.value > a ? c.value : a) : c.value),
        -Infinity
      )
    );
    const min = Math.floor(
      values.reduce((a, c) => (c.value < a ? c.value : a), Infinity)
    );
    const margin = Math.ceil((max - min) * 0.1);

    return (
      <ResponsiveContainer aspect={21 / 9} minHeight={200}>
        <LineChart data={values}>
          <Line
            dot={false}
            type="monotone"
            dataKey="value"
            animationEasing="linear"
          />
          <XAxis
            scale="time"
            dataKey="epoch"
            type="number"
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
