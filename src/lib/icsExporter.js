export function exportToICS(inspections) {
  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FIMS//Field Inspection Management System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ].join("\r\n");

  inspections.forEach(insp => {
    if (insp.type === "leave" || !insp.date) return;
    
    const date = insp.date.replace(/-/g, "");
    const startTime = insp.start_time ? insp.start_time.replace(":", "") + "00" : "090000";
    const endTime = insp.start_time ? (Number(insp.start_time.split(":")[0]) + 1) + "0000" : "100000";
    
    ics += "\r\nBEGIN:VEVENT";
    ics += `\r\nUID:${insp.id}@fims.co.mz`;
    ics += `\r\nDTSTAMP:${date}T${startTime}`;
    ics += `\r\nDTSTART:${date}T${startTime}`;
    ics += `\r\nDTEND:${date}T${endTime.length === 6 ? endTime : "100000"}`;
    ics += `\r\nSUMMARY:Inspeção - ${insp.location_name}`;
    ics += `\r\nDESCRIPTION:Inspetor: ${insp.inspector_name}\\nEstado: ${insp.status}`;
    ics += `\r\nLOCATION:${insp.location_name}`;
    ics += "\r\nEND:VEVENT";
  });

  ics += "\r\nEND:VCALENDAR";

  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "FIMS_Schedule.ics";
  link.click();
}

// Helper to generate calendar days
export const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};
