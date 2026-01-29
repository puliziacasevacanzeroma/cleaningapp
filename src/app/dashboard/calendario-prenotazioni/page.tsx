"use client";

import { useState, useEffect } from "react";
import CalendarioPrenotazioniClient from "./CalendarioPrenotazioniClient";

export default function CalendarioPrenotazioniPage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/properties/list")
      .then(res => res.json())
      .then(data => {
        setProperties(data.activeProperties || []);
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

  return <CalendarioPrenotazioniClient properties={properties} />;
}