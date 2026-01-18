"use client";

import { useState, useEffect } from "react";
import CalendarioPulizieClient from "./CalendarioPulizieClient";

export default function CalendarioPuliziePage() {
  const [properties, setProperties] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/properties/list").then(res => res.json()),
      fetch("/api/dashboard/data").then(res => res.json()),
    ])
      .then(([propertiesData, dashboardData]) => {
        setProperties(propertiesData.activeProperties || []);
        setOperators(dashboardData.operators || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-4"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return <CalendarioPulizieClient properties={properties} operators={operators} />;
}