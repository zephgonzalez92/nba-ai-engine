
"use client";

export default function TeamDropdown({ teams, onSelect }: any) {
  return (
    <select onChange={(e) => onSelect(e.target.value)} className="p-2 border rounded">
      <option>Select Team</option>
      {teams.map((team: string) => (
        <option key={team}>{team}</option>
      ))}
    </select>
  );
}
