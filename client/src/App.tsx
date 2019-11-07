import React, { useEffect, useState } from "react";
import superagent from "superagent";
import {
  LineChart,
  Line,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis
} from "recharts";
import "./App.css";
import moment from "moment";

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

  const showDevices = (d: Devices) =>
    Object.keys(d)
      .sort((a, b) => a.localeCompare(b))
      .map(res => showDevice(d[res], res));

  const showDevice = (paths: Paths, deviceId: string) =>
    Object.keys(paths)
      .sort((a, b) => a.localeCompare(b))
      .map(res => (
        <div className="App-graph" key={res}>
          <h3 title={deviceId}>
            {`${deviceId.slice(0, 6)}...${deviceId.slice(-6)}`}- {res}
          </h3>
          {showPath(paths[res])}
        </div>
      ));

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
          <Line dot={false} type="monotone" dataKey="value" />
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
