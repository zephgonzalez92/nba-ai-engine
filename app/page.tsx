
"use client";

import { useState } from "react";
import TeamDropdown from "@/components/TeamDropdown";

export default function Home() {
  const teams = [
    "Dallas Mavericks",
    "Boston Celtics",
    "Los Angeles Lakers",
    "Denver Nuggets"
  ];

  const [selected, setSelected] = useState("");

  return (
    <main style={{ padding: 40 }}>
      <h1>NBA AI Betting Engine</h1>
      <TeamDropdown teams={teams} onSelect={setSelected} />
      {selected && <p>Selected Team: {selected}</p>}
    </main>
  );
}
